// PDF -> Markdown (text-layer PDFs). Works in the browser and in Node with pdfjs-dist.
// Strategy: group text items into lines, find the body font size, treat clearly bigger / known-section lines
// as headings, glue lines into paragraphs, remove running headers/footers and page numbers.

const SECTION = /^(abstract|summary|highlights|keywords?|introduction|background|methods?|materials and methods|methodology|experimental( section)?|results( and discussion)?|discussion|conclusions?|limitations|acknowledg(e)?ments?|funding|references|bibliography|appendix|supplementary (material|information)|abbreviations|abstrak|ringkasan|kata kunci|pendahuluan|latar belakang|metode( penelitian)?|metodologi|hasil( dan pembahasan)?|pembahasan|kesimpulan|simpulan|daftar pustaka|referensi|ucapan terima kasih|lampiran|declaration of competing interest|author contributions|data availability( statement)?)\s*:?$/i;
const NUMBERED = /^(\d{1,2}(\.\d{1,2}){0,2})\.?\s+([A-Z][A-Za-z0-9 ,:;()'’\-–/&]{2,90})$/;

const mode = arr => { const m = new Map(); arr.forEach(([v, w]) => m.set(v, (m.get(v) || 0) + w)); let best = 0, bw = -1; m.forEach((w, v) => { if (w > bw) { bw = w; best = v; } }); return best; };
const norm = s => s.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();

export async function pdfToMarkdown(pdfjsLib, data, opts = {}) {
  const doc = await pdfjsLib.getDocument({ data, useSystemFonts: true, isEvalSupported: false, verbosity: 0 }).promise;
  let info = {};
  try { info = (await doc.getMetadata()).info || {}; } catch (_) {}
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    opts.onProgress && opts.onProgress(p, doc.numPages);
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const tc = await page.getTextContent();
    const lines = []; let cur = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const size = Math.abs(it.transform[3]) || it.height || 10;
      const x = it.transform[4], y = it.transform[5];
      if (!it.str.trim()) { if (cur && it.str) cur.text += ' '; if (it.hasEOL && cur) { lines.push(cur); cur = null; } continue; }
      if (!cur || Math.abs(y - cur.y) > Math.max(size, cur.size) * 0.55) {
        if (cur) lines.push(cur);
        cur = { y, x, size, text: '', end: x, page: p, h: vp.height };
      } else if (x - cur.end > size * 0.15 && !/\s$/.test(cur.text)) cur.text += ' ';
      cur.text += it.str; cur.end = x + (it.width || 0); cur.size = Math.max(cur.size, size);
      if (it.hasEOL) { lines.push(cur); cur = null; }
    }
    if (cur) lines.push(cur);
    lines.forEach(l => { l.text = l.text.replace(/\s+/g, ' ').trim(); });
    pages.push({ lines: lines.filter(l => l.text), width: vp.width, height: vp.height });
  }
  const total = pages.reduce((a, p) => a + p.lines.reduce((b, l) => b + l.text.length, 0), 0);
  const scanned = total < 150 * Math.max(1, doc.numPages);

  // running headers / footers + page numbers
  const freq = new Map();
  pages.forEach(pg => { const seen = new Set(); pg.lines.forEach(l => { const edge = l.y > pg.height * 0.92 || l.y < pg.height * 0.08; if (edge) seen.add(norm(l.text)); }); seen.forEach(k => freq.set(k, (freq.get(k) || 0) + 1)); });
  const repeated = new Set([...freq].filter(([k, n]) => doc.numPages >= 2 && n >= Math.max(2, doc.numPages * 0.4)).map(([k]) => k));
  pages.forEach(pg => { pg.lines = pg.lines.filter(l => { const edge = l.y > pg.height * 0.92 || l.y < pg.height * 0.08; return !(edge && (repeated.has(norm(l.text)) || /^(page\s*)?\d{1,4}(\s*(of|\/)\s*\d{1,4})?$/i.test(l.text))); }); });

  const all = pages.flatMap(pg => pg.lines);
  const body = all.length ? mode(all.map(l => [Math.round(l.size * 2) / 2, l.text.length])) : 10;
  const maxW = pages.map(pg => Math.max(1, ...pg.lines.map(l => l.end - l.x)));

  // classify lines
  const blocks = []; // {type:'h1'|'h2'|'h3'|'p'|'li', text}
  let para = null, prev = null, refMode = false, titleDone = false;
  const flush = () => { if (para) { blocks.push({ type: refMode ? 'li' : 'p', text: para }); para = null; } };
  const join = (a, b) => /[A-Za-z]-$/.test(a) && /^[a-z]/.test(b) ? a.slice(0, -1) + b : a + ' ' + b;
  pages.forEach((pg, pi) => {
    pg.lines.forEach((l, li) => {
      const t = l.text;
      const big = l.size >= body * 1.18;
      const short = t.length < 130 && !/[.,;]$/.test(t);
      let level = 0;
      if (SECTION.test(t.replace(/^\d+(\.\d+)*\.?\s*/, ''))) level = 2;
      else if (big && short) level = pi === 0 && !titleDone && l.size >= body * 1.45 ? 1 : (l.size >= body * 1.35 ? 2 : 3);
      else if (NUMBERED.test(t) && short && t.split(' ').length <= 12 && (!prev || prev.page !== l.page || prev.y - l.y > l.size * 1.25 || li === 0)) level = (t.match(/\./g) || []).length >= 2 ? 3 : 2;
      if (level) {
        flush();
        const last = blocks[blocks.length - 1];
        const sameBlock = prev && prev.page === l.page && Math.abs(prev.size - l.size) < 0.6 && prev.y - l.y < l.size * 1.8;
        if (last && last.type === 'h1' && big && sameBlock) last.text += ' ' + t;   // multi-line title
        else if (last && last.type === 'h' + level && level === 3 && big && sameBlock) last.text += ' ' + t;
        else blocks.push({ type: 'h' + level, text: t });
        if (level === 1) titleDone = true;
        refMode = /^(references|bibliography|daftar pustaka|referensi)$/i.test(t.replace(/^\d+(\.\d+)*\.?\s*/, ''));
        prev = l; return;
      }
      const startsRef = refMode && /^(\[\d+\]|\d{1,3}[.)])\s/.test(t);
      const gap = prev && prev.page === l.page ? prev.y - l.y : 0;
      const prevShort = prev && (prev.end - prev.x) < maxW[pi] * 0.72 && /[.!?:]["')\]]?$/.test(prev.text);
      const newPara = !para || startsRef || gap > l.size * 1.9 || (prevShort && /^[A-Z0-9“"(\[]/.test(t));
      if (newPara) { flush(); para = t; } else para = join(para, t);
      prev = l;
    });
  });
  flush();

  const out = [];
  let title = (info.Title && info.Title.trim().length > 8 ? info.Title.trim() : '');
  const h1 = blocks.find(b => b.type === 'h1'); if (h1) title = h1.text; 
  if (!title) { const firstBig = blocks.find(b => b.type.startsWith('h')); title = firstBig ? firstBig.text : (blocks[0] ? blocks[0].text.slice(0, 90) : ''); }
  for (const b of blocks) {
    if (b.type === 'h1') out.push('# ' + b.text);
    else if (b.type === 'h2') out.push('## ' + b.text);
    else if (b.type === 'h3') out.push('### ' + b.text);
    else if (b.type === 'li') out.push('- ' + b.text);
    else out.push(b.text);
  }
  // references: keep list items together
  const md = out.join('\n\n').replace(/(\n\n- [^\n]+)(?=\n\n- )/g, '$1').replace(/\n\n- /g, '\n- ').replace(/\n(?=- )/, '\n\n');
  const text = blocks.map(b => b.text).join('\n');
  return { md, title: title.replace(/\s+/g, ' ').slice(0, 200), pages: doc.numPages, scanned, text, info };
}
