// Full-screen Markdown reader, designed for reading on a phone: big calm type, adjustable size/width/theme,
// reading progress, contents drawer, "skim" mode (first sentence of each paragraph stays bold) and read-aloud.
import { $, $$, esc, toast, download, copyText } from './util.js';
import { renderMd, parseFrontMatter } from './md.js';

const PREFS = 'fromodyssey.reader', POS = 'fromodyssey.pos';
const DEF = { size: 18, lh: 1.7, font: 'serif', width: 'm', theme: 'auto', skim: false };
const loadPrefs = () => { try { return { ...DEF, ...JSON.parse(localStorage.getItem(PREFS) || '{}') }; } catch (_) { return { ...DEF }; } };
const savePrefs = p => { try { localStorage.setItem(PREFS, JSON.stringify(p)); } catch (_) {} };
const getPos = k => { try { return (JSON.parse(localStorage.getItem(POS) || '{}'))[k] || 0; } catch (_) { return 0; } };
const setPos = (k, v) => { try { const o = JSON.parse(localStorage.getItem(POS) || '{}'); o[k] = v; const keys = Object.keys(o); if (keys.length > 60) delete o[keys[0]]; localStorage.setItem(POS, JSON.stringify(o)); } catch (_) {} };
const WIDTH = { s: '30rem', m: '38rem', l: '50rem' };

const ID_W = new Set(['yang', 'dan', 'di', 'dengan', 'untuk', 'dari', 'pada', 'adalah', 'ini', 'itu', 'dalam', 'tidak', 'juga', 'oleh', 'atau', 'akan', 'karena', 'sebagai']);
const EN_W = new Set(['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'with', 'as', 'by', 'was', 'are']);
function looksId(t) { let a = 0, b = 0; for (const w of String(t).toLowerCase().match(/\p{L}+/gu) || []) { if (ID_W.has(w)) a++; else if (EN_W.has(w)) b++; } return a > b; }

let active = null;
export function closeReader() { if (active) active.close(true); }

/**
 * @param o {title, md, key, filename, openUrl, subtitle}
 */
export function openReader(o) {
  closeReader();
  const prefs = loadPrefs();
  const { meta } = parseFrontMatter(o.md);
  const { html, headings, words } = renderMd(o.md);
  const mins = Math.max(1, Math.round(words / 220));
  const key = o.key || o.title;
  const root = document.createElement('div');
  root.className = 'reader-ov';
  root.innerHTML = `
    <div class="rd-top">
      <button class="rd-btn" data-x="back" aria-label="Tutup pembaca">←</button>
      <div class="rd-title" title="${esc(o.title)}">${esc(o.title)}</div>
      <button class="rd-btn" data-x="listen" aria-label="Bacakan" title="Bacakan">🔊</button>
      <button class="rd-btn" data-x="toc" aria-label="Daftar isi" title="Daftar isi">☰</button>
      <button class="rd-btn" data-x="aa" aria-label="Pengaturan teks" title="Pengaturan teks">Aa</button>
    </div>
    <div class="rd-progress"><i></i></div>
    <div class="rd-scroll"><article class="rd-body">
      <div class="rd-meta">${esc(o.subtitle || meta.category || '')}${o.subtitle || meta.category ? ' · ' : ''}sekitar ${mins} menit baca</div>
      ${html}
      <div class="rd-end">— selesai —</div>
    </article></div>
    <div class="rd-sheet" data-sheet="aa" hidden>
      <div class="rd-row"><span>Ukuran</span><input type="range" min="15" max="28" step="1" data-p="size" value="${prefs.size}"><b data-show="size">${prefs.size}</b></div>
      <div class="rd-row"><span>Jarak baris</span><div class="seg" data-seg="lh">${[['1.5', 'Rapat'], ['1.7', 'Normal'], ['1.95', 'Lega']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="rd-row"><span>Huruf</span><div class="seg" data-seg="font">${[['serif', 'Serif'], ['sans', 'Sans']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="rd-row"><span>Lebar</span><div class="seg" data-seg="width">${[['s', 'Sempit'], ['m', 'Sedang'], ['l', 'Lebar']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="rd-row"><span>Warna</span><div class="seg" data-seg="theme">${[['auto', 'Otomatis'], ['paper', 'Kertas'], ['sepia', 'Sepia'], ['night', 'Malam']].map(([v, l]) => `<button data-v="${v}">${l}</button>`).join('')}</div></div>
      <div class="rd-row"><span>Mode sekilas</span><label class="rd-switch"><input type="checkbox" data-p="skim" ${prefs.skim ? 'checked' : ''}><i></i></label><small class="muted">kalimat pertama tiap paragraf tetap tebal, sisanya memudar</small></div>
      <div class="rd-row rd-actions">
        <button class="btn sm ghost" data-x="dl">⤓ Unduh .md</button>
        <button class="btn sm ghost" data-x="copy">Salin teks</button>
        ${o.openUrl ? `<a class="btn sm ghost" href="${esc(o.openUrl)}" target="_blank" rel="noopener">Buka aslinya ↗</a>` : ''}
      </div>
    </div>
    <div class="rd-sheet rd-toc" data-sheet="toc" hidden>
      <h3 style="margin:0 0 8px">Daftar isi</h3>
      ${headings.filter(h => h.level <= 3).map(h => `<a href="#${h.id}" data-jump="${h.id}" class="l${h.level}">${esc(h.text)}</a>`).join('') || '<p class="muted">Dokumen ini tidak punya judul bagian.</p>'}
    </div>`;
  document.body.appendChild(root);
  document.body.classList.add('reading');
  const scroller = $('.rd-scroll', root), bar = $('.rd-progress i', root);

  const apply = () => {
    root.style.setProperty('--rd-size', prefs.size + 'px');
    root.style.setProperty('--rd-lh', prefs.lh);
    root.style.setProperty('--rd-w', WIDTH[prefs.width] || WIDTH.m);
    root.dataset.font = prefs.font; root.dataset.rt = prefs.theme;
    root.classList.toggle('skim', !!prefs.skim);
    $$('[data-seg]', root).forEach(seg => $$('button', seg).forEach(b => b.classList.toggle('on', String(prefs[seg.dataset.seg]) === b.dataset.v)));
    $('[data-show="size"]', root).textContent = prefs.size;
    savePrefs(prefs);
  };
  apply();
  $$('[data-seg]', root).forEach(seg => seg.onclick = e => { const b = e.target.closest('button'); if (!b) return; prefs[seg.dataset.seg] = seg.dataset.seg === 'lh' ? parseFloat(b.dataset.v) : b.dataset.v; apply(); });
  $$('input[data-p]', root).forEach(i => i.oninput = () => { prefs[i.dataset.p] = i.type === 'checkbox' ? i.checked : +i.value; apply(); });

  const sheets = $$('[data-sheet]', root);
  const toggle = name => sheets.forEach(s => { s.hidden = s.dataset.sheet === name ? !s.hidden : true; });
  let speaking = false;
  const stopSpeak = () => { try { window.speechSynthesis.cancel(); } catch (_) {} speaking = false; $$('.speaking', root).forEach(p => p.classList.remove('speaking')); $('[data-x="listen"]', root).classList.remove('on'); };

  const onScroll = () => {
    const max = scroller.scrollHeight - scroller.clientHeight; const pct = max > 0 ? scroller.scrollTop / max : 0;
    bar.style.width = (pct * 100).toFixed(1) + '%'; setPos(key, pct);
  };
  scroller.addEventListener('scroll', onScroll, { passive: true });
  requestAnimationFrame(() => { const p = getPos(key); if (p > 0.02 && p < 0.97) { scroller.scrollTop = p * (scroller.scrollHeight - scroller.clientHeight); toast('Lanjut dari tempat terakhir kamu berhenti'); } onScroll(); });

  let closed = false;
  const close = fromBtn => {
    if (closed) return; closed = true; stopSpeak(); window.removeEventListener('popstate', onPop); document.removeEventListener('keydown', onKey);
    root.remove(); document.body.classList.remove('reading'); active = null;
    if (fromBtn !== 'pop' && history.state && history.state.rd) history.back();
  };
  const onPop = () => close('pop');
  const onKey = e => { if (e.key === 'Escape') close(true); };
  history.pushState({ rd: 1 }, '');
  window.addEventListener('popstate', onPop); document.addEventListener('keydown', onKey);
  active = { close };

  root.addEventListener('click', e => {
    const x = e.target.closest('[data-x]'); const j = e.target.closest('[data-jump]');
    if (j) { e.preventDefault(); const t = root.querySelector('#' + CSS.escape(j.dataset.jump)); if (t) scroller.scrollTo({ top: t.offsetTop - 70, behavior: 'smooth' }); toggle(null); return; }
    if (!x) { if (!e.target.closest('.rd-sheet') && !e.target.closest('.rd-top')) sheets.forEach(s => { s.hidden = true; }); return; }
    const a = x.dataset.x;
    if (a === 'back') close(true);
    else if (a === 'toc') toggle('toc');
    else if (a === 'aa') toggle('aa');
    else if (a === 'dl') download(o.filename || (o.title.replace(/[^\w\- ]+/g, '').trim() || 'document') + '.md', o.md, 'text/markdown');
    else if (a === 'copy') copyText(o.md);
    else if (a === 'listen') {
      if (!('speechSynthesis' in window)) return toast('Browser ini belum mendukung fitur bacakan');
      if (speaking) return stopSpeak();
      const paras = $$('.rd-body p, .rd-body li, .rd-body h1, .rd-body h2, .rd-body h3', root);
      const top = scroller.scrollTop; let i = Math.max(0, paras.findIndex(p => p.offsetTop + p.offsetHeight > top + 40));
      speaking = true; x.classList.add('on');
      const lang = looksId($('.rd-body', root).textContent.slice(0, 4000)) ? 'id-ID' : 'en-GB';
      const voice = (window.speechSynthesis.getVoices() || []).find(v => v.lang && v.lang.replace('_', '-').toLowerCase() === lang.toLowerCase()) || (window.speechSynthesis.getVoices() || []).find(v => v.lang && v.lang.toLowerCase().startsWith(lang.slice(0, 2)));
      const next = () => {
        if (!speaking || i >= paras.length) return stopSpeak();
        const p = paras[i++]; $$('.speaking', root).forEach(n => n.classList.remove('speaking')); p.classList.add('speaking');
        scroller.scrollTo({ top: p.offsetTop - 120, behavior: 'smooth' });
        const u = new SpeechSynthesisUtterance(p.textContent); u.lang = lang; u.rate = 0.98; if (voice) u.voice = voice; u.onend = next; u.onerror = stopSpeak; window.speechSynthesis.speak(u);
      };
      next();
    }
  });
  return { close };
}
