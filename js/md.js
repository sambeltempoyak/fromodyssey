// Tiny, safe Markdown helpers: front matter, rendering to HTML, headings list.
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function parseFrontMatter(md) {
  const m = /^---\n([\s\S]*?)\n---\n?/.exec(md || '');
  if (!m) return { meta: {}, body: md || '' };
  const meta = {};
  m[1].split('\n').forEach(l => { const i = l.indexOf(':'); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim().replace(/^"|"$/g, ''); });
  return { meta, body: md.slice(m[0].length) };
}
export const fmQuote = s => '"' + String(s ?? '').replace(/"/g, "'").replace(/\n/g, ' ') + '"';

function inline(s) {
  s = esc(s);
  s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank" rel="noopener">$2</a>');
  return s;
}
const slug = (t, seen) => { let s = t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'; let n = s, i = 2; while (seen.has(n)) n = s + '-' + i++; seen.add(n); return n; };
const lead = html => html.replace(/^(.{20,}?[.!?])(\s+|$)/, '<span class="lead">$1</span>$2'); // first sentence, for skim mode

/** Render Markdown to HTML. Returns {html, headings:[{level,text,id}], words}. */
export function renderMd(md) {
  const { body } = parseFrontMatter(md);
  const lines = body.replace(/<!--[\s\S]*?-->/g, '').replace(/\r/g, '').split('\n');
  const out = [], headings = [], seen = new Set(); let words = 0, i = 0;
  const isBlank = l => !l.trim();
  const LIST = /^\s*([-*+]|\d+[.)])\s+/;
  while (i < lines.length) {
    let l = lines[i];
    if (isBlank(l)) { i++; continue; }
    let m;
    if (/^```/.test(l)) { const buf = []; i++; while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]); i++; out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`); continue; }
    if ((m = /^(#{1,6})\s+(.*)$/.exec(l))) {
      const level = m[1].length, text = m[2].replace(/[*_`]/g, '').trim(), id = slug(text, seen);
      headings.push({ level, text, id }); out.push(`<h${level} id="${id}">${inline(m[2])}</h${level}>`); i++; continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(l)) { out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(l)) { const buf = []; while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, '')); out.push(`<blockquote>${inline(buf.join(' '))}</blockquote>`); continue; }
    if (/^\s*\|.*\|\s*$/.test(l) && /^\s*\|?\s*:?-{2,}/.test(lines[i + 1] || '')) {
      const rows = []; while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.trim().replace(/^\||\|$/g, '').split('|').map(c => inline(c.trim()));
      const head = cells(rows[0]); const bodyRows = rows.slice(2).map(cells);
      out.push(`<div class="tbl"><table><thead><tr>${head.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${bodyRows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`); continue;
    }
    if (LIST.test(l)) {
      const ordered = /^\s*\d+[.)]/.test(l); const items = [];
      while (i < lines.length && LIST.test(lines[i])) {
        const mm = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)$/.exec(lines[i]); items.push({ d: mm[1].length >= 2 ? 1 : 0, t: mm[2] });
        i++;
        while (i < lines.length && lines[i].trim() && /^\s{2,}\S/.test(lines[i]) && !LIST.test(lines[i])) { items[items.length - 1].t += ' ' + lines[i].trim(); i++; }
      }
      let html = '', open = false;
      items.forEach(it => { if (it.d && !open) { html += '<ul>'; open = true; } else if (!it.d && open) { html += '</ul>'; open = false; } html += `<li>${inline(it.t)}</li>`; });
      if (open) html += '</ul>';
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${html}</${tag}>`); words += items.reduce((a, b) => a + b.t.split(/\s+/).length, 0); continue;
    }
    const buf = [];
    while (i < lines.length && !isBlank(lines[i]) && !/^(#{1,6}\s|```|>|-{3,}\s*$)/.test(lines[i]) && !LIST.test(lines[i])) buf.push(lines[i++].trim());
    const para = buf.join(' '); words += para.split(/\s+/).length; out.push(`<p>${lead(inline(para))}</p>`);
  }
  return { html: out.join('\n'), headings, words };
}
