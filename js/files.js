// Berkas: satu tempat untuk menaruh apa saja (CV, ijazah, catatan lapangan, rekaman, foto, bacaan).
// Aplikasi membaca, menebak jenisnya, MENANYA dulu ("Benar?"), lalu menyimpan di folder Drive yang tepat.
// Dua tampilan: "Pintar" (cari + kategori + proyek) dan "Pohon folder" (isi Drive yang sebenarnya).
// Kamu boleh menata ulang apa pun langsung di Google Drive; aplikasi hanya mengikuti ("Sinkronkan dengan Drive").
import { S, save, esc, $, $$, toast, today, loadScript, modal } from './util.js';
import { connected, putText, getById, delById, moveById, mkdir, tree, uploadLarge, loadIndex, saveIndex, safeName, DIR } from './drive.js';
import { classify, niceTitle, catFromPath, mediaKind, extOf, CATS, CAT_ORDER, TOPICS } from './classify.js';
import { pdfToMarkdown } from './pdf2md.js';
import { fmQuote, parseFrontMatter } from './md.js';
import { openReader } from './reader.js';
import { folderFor, FIELD_CATS, UNKNOWN_PROJECT, DEFAULT_TOPIC } from './folders.js';

const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
let pdfjs = null;
async function getPdfjs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(PDFJS + 'pdf.min.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs'; return pdfjs;
}
const EXT = f => extOf(f.name);
const MB = 1024 * 1024;
const LIMIT_B64 = 25 * MB, WARN_BIG = 150 * MB;
const SYNC_KEY = 'fromodyssey.lastsync', SYNC_EVERY = 10 * 60 * 1000;
const mimeOf = f => f.type || ({ pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', md: 'text/markdown', markdown: 'text/markdown' }[EXT(f)] || 'application/octet-stream');
const fmtSize = n => !n ? '' : n < 1024 * 1024 ? Math.max(1, Math.round(n / 1024)) + ' KB' : (n / MB).toFixed(n < 10 * MB ? 1 : 0) + ' MB';
const fmtD = d => { if (!d) return ''; const x = new Date(d); return isNaN(x) ? String(d) : x.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }); };
const stemOf = n => String(n).replace(/\.[^.\/]+$/, '');
const dirOf = p => String(p || '').split('/').slice(0, -1).join('/');
const baseOf = p => String(p || '').split('/').pop();
const catInfo = c => CATS[c] || CATS.lainnya;

/* ---------- membaca berkas jadi Markdown ---------- */
export async function fileToMarkdown(file, onStatus = () => {}) {
  const ext = EXT(file);
  if (ext === 'pdf') {
    onStatus('Membaca PDF…');
    const lib = await getPdfjs();
    const r = await pdfToMarkdown(lib, await file.arrayBuffer(), { onProgress: (p, n) => onStatus(`Membaca halaman ${p} dari ${n}…`) });
    if (r.scanned) { const e = new Error('Teks di PDF ini tidak bisa dibaca (kemungkinan hasil pindai berupa gambar). Berkasnya tetap kusimpan, tapi tanpa salinan Markdown. Untuk membacanya, buka di Google Drive lewat "Buka dengan > Google Dokumen" (OCR).'); e.scanned = true; throw e; }
    return { md: r.md, title: r.title, text: r.text, pages: r.pages };
  }
  if (ext === 'docx') {
    onStatus('Membaca berkas Word…');
    await loadScript('https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js');
    const r = await window.mammoth.convertToMarkdown({ arrayBuffer: await file.arrayBuffer() });
    const md = r.value.replace(/\\([.\-()#*_>])/g, '$1').replace(/__([^_]+)__/g, '**$1**').trim();
    return { md, title: (/^#\s+(.+)$/m.exec(md) || [])[1] || '', text: md, pages: Math.max(1, Math.round(md.length / 3000)) };
  }
  if (['txt', 'md', 'markdown'].includes(ext)) {
    const t = await file.text();
    return { md: t, title: (/^#\s+(.+)$/m.exec(t) || [])[1] || '', text: t, pages: Math.max(1, Math.round(t.length / 3000)) };
  }
  const e = new Error(`Aku bisa membaca isi PDF, Word (.docx), .txt dan .md. "${file.name}" berkas .${ext || '?'}, jadi cuma disimpan apa adanya.`); e.unsupported = true; throw e;
}

function buildDoc({ name, conv, cat, project, topic, title }) {
  const front = ['---', 'type: document', `title: ${fmQuote(title)}`, `category: ${catInfo(cat).label}`, project && project !== UNKNOWN_PROJECT ? `project: ${fmQuote(project)}` : null,
    topic ? `topic: ${fmQuote(topic)}` : null, `source-file: ${fmQuote(name)}`, `pages: ${conv.pages}`, `filed: ${today()}`, '---', ''].filter(x => x !== null).join('\n');
  let body = conv.md.trim();
  if (!/^#\s/.test(body)) body = `# ${title}\n\n${body}`;
  return front + '\n' + body + '\n';
}
const snippetOf = md => { const { body } = parseFrontMatter(md); return body.replace(/^#.*$/gm, '').replace(/[*_`>|-]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 170); };

/* ---------- pohon Drive terakhir (untuk nama unik, tampilan pohon, rapikan) ---------- */
let lastTree = null;
async function getTree(force) { if (!lastTree || force) lastTree = await tree(); return lastTree; }
async function uniqueName(folder, name) {
  let taken = new Set();
  try { (await getTree()).files.forEach(f => taken.add(f.path.toLowerCase())); } catch (_) {}
  if (!taken.has((folder + '/' + name).toLowerCase())) return name;
  const stem = stemOf(name), ext = name.slice(stem.length);
  for (let i = 2; i < 200; i++) { const n = `${stem} (${i})${ext}`; if (!taken.has((folder + '/' + n).toLowerCase())) return n; }
  return `${stem} ${Date.now()}${ext}`;
}

/* ---------- tahap 1: siapkan (baca + tebak), tahap 2: simpan setelah dikonfirmasi ---------- */
export async function prepareFile(file, { onStatus = () => {}, projects } = {}) {
  const kind = mediaKind(file.name, file.type);
  let conv = null, note = '';
  if (kind === 'doc') {
    try { conv = await fileToMarkdown(file, onStatus); }
    catch (e) { if (!e.unsupported) note = e.message; }
  }
  onStatus('Menebak jenis berkas…');
  const cls = classify(file.name, { mime: file.type, text: conv ? conv.text : '', pages: conv ? conv.pages : 0, projects: projects || S().projects || [] });
  return { file, kind, conv, note, cls, title: niceTitle(file.name, conv && conv.title, cls.cat) };
}

export async function saveFile(prep, choice, { onStatus = () => {}, onProgress = () => {} } = {}) {
  const { file, conv, title } = prep;
  const idx = await loadIndex();
  const cat = choice.cat, project = choice.project || '', topic = choice.topic || '';
  const folder = choice.folder || folderFor(cat, { project, topic });
  const ext = EXT(file);
  const name = await uniqueName(folder, safeName(stemOf(file.name)) + (ext ? '.' + ext : ''));
  onStatus('Menyimpan ke Drive…');
  const f = await uploadLarge(`${folder}/${name}`, file, onProgress);
  const entry = { id: f.id, name: f.name, orig: file.name, title, cat, project, topic, folder: dirOf(f.path), path: f.path, mime: f.mime || mimeOf(file), size: file.size,
    pages: conv ? conv.pages : 0, added: today(), url: f.url, snippet: '', why: choice.why || '' };
  if (conv) {
    const md = buildDoc({ name: file.name, conv, cat, project, topic, title });
    entry.snippet = snippetOf(md);
    if (ext === 'md' || ext === 'markdown') { entry.mdId = f.id; entry.md = f.path; }
    else { const mf = await putText(`${folder}/${stemOf(f.name)}.md`, md, 'text/markdown'); entry.mdId = mf.id; entry.md = mf.path; entry.mdUrl = mf.url; }
  }
  idx.files = idx.files.filter(x => x.id !== entry.id); idx.files.unshift(entry); idx.updated = Date.now(); await saveIndex(idx);
  lastTree = null;
  return entry;
}

/** Jalur lengkap untuk satu berkas (tanpa lembar konfirmasi). Mengembalikan {entry|null, md, title, cls, saved, duplicate?}. */
export async function ingestFile(file, { onStatus = () => {}, onProgress, forceCat, choice } = {}) {
  const prep = await prepareFile(file, { onStatus });
  let cls = prep.cls;
  if (forceCat && CATS[forceCat]) { const topic = forceCat === 'bacaan' ? cls.topic || DEFAULT_TOPIC : ''; cls = { ...cls, cat: forceCat, topic, folder: folderFor(forceCat, { project: cls.project, topic }), reasons: ['pilihanmu'] }; }
  const md = prep.conv ? buildDoc({ name: file.name, conv: prep.conv, cat: cls.cat, project: cls.project, topic: cls.topic, title: prep.title }) : '';
  if (!connected()) return { entry: null, md, title: prep.title, cls, saved: false, note: prep.note };
  const idx = await loadIndex();
  const dup = idx.files.find(f => f.orig === file.name && f.size === file.size);
  if (dup) return { entry: dup, md, title: prep.title, cls: { ...cls, cat: dup.cat }, saved: true, duplicate: true };
  const entry = await saveFile(prep, choice || { cat: cls.cat, project: cls.project, topic: cls.topic, folder: cls.folder, why: cls.reasons.join('; ') }, { onStatus, onProgress });
  return { entry, md, title: prep.title, cls, saved: true, note: prep.note };
}

/* ---------- salinan Markdown kecil di perangkat (supaya HP bisa membuka lagi tanpa sinyal) ---------- */
const MDC = 'fromodyssey.mdcache';
function cacheGet(k) { try { return (JSON.parse(localStorage.getItem(MDC) || '{}')[k] || {}).md || null; } catch (_) { return null; } }
function cachePut(k, md) {
  try {
    const o = JSON.parse(localStorage.getItem(MDC) || '{}'); o[k] = { md, t: Date.now() };
    const keys = Object.keys(o).sort((a, b) => o[b].t - o[a].t); let total = 0; const keep = {};
    for (const x of keys) { total += o[x].md.length; if (Object.keys(keep).length < 10 && total < 1500000) keep[x] = o[x]; }
    localStorage.setItem(MDC, JSON.stringify(keep));
  } catch (_) {}
}
async function makeMdCopy(entry) {
  const ext = extOf(entry.name || entry.orig);
  if (!['pdf', 'docx'].includes(ext)) throw new Error('Berkas ini tidak punya salinan yang bisa dibaca di sini. Buka langsung di Drive.');
  if ((entry.size || 0) > LIMIT_B64) throw new Error('Berkas ini terlalu besar untuk dibuka di sini. Buka di Drive.');
  toast('Membuat salinan Markdown…');
  const blob = await getById(entry.id, 'b64');
  const conv = await fileToMarkdown(new File([blob], entry.name || entry.orig));
  const md = buildDoc({ name: entry.orig || entry.name, conv, cat: entry.cat, project: entry.project, topic: entry.topic, title: entry.title });
  const mf = await putText(`${dirOf(entry.path)}/${stemOf(entry.name)}.md`, md, 'text/markdown');
  const idx = await loadIndex(); const e = idx.files.find(x => x.id === entry.id);
  if (e) { Object.assign(e, { mdId: mf.id, md: mf.path, mdUrl: mf.url, snippet: snippetOf(md), pages: conv.pages }); await saveIndex(idx); }
  Object.assign(entry, { mdId: mf.id, md: mf.path });
  return mf.id;
}
export async function readEntry(entry) {
  let id = entry.mdId;
  if (!id && /\.(md|markdown|txt)$/i.test(entry.name || entry.orig || '')) id = entry.id;
  if (!id) id = await makeMdCopy(entry);
  let md = null;
  try { md = await getById(id); if (md) cachePut(id, md); } catch (e) { md = cacheGet(id); if (!md) throw e; toast('Offline: menampilkan salinan yang tersimpan'); }
  if (md == null) md = cacheGet(id);
  if (md == null) throw new Error('Salinan Markdown tidak ditemukan di Drive.');
  openReader({ title: entry.title, md, key: id, filename: stemOf(entry.name || entry.title) + '.md', openUrl: entry.url, subtitle: catInfo(entry.cat).label });
}

/* ---------- audio, gambar, video ---------- */
async function openMedia(item) { // item: {id, name, size, mime, url, title}
  const kind = mediaKind(item.name, item.mime);
  const big = (item.size || 0) > LIMIT_B64;
  if (kind === 'doc' || kind === 'video' && big) {
    if (item.url) window.open(item.url, '_blank', 'noopener');
    return;
  }
  if (big) return modal(`<h2 style="font-size:18px">${esc(item.title || item.name)}</h2><p class="muted">Berkas ini ${fmtSize(item.size)}, terlalu besar untuk diputar di sini. Buka di Drive saja ya.</p><div class="row"><a class="btn" href="${esc(item.url || '#')}" target="_blank" rel="noopener">Buka di Drive</a><button class="btn ghost" data-close>Tutup</button></div>`);
  if (kind === 'video') { if (item.url) window.open(item.url, '_blank', 'noopener'); return; }
  let objUrl = '';
  modal(`<h2 style="font-size:18px">${esc(item.title || item.name)}</h2><div id="mdBox" class="muted">Mengambil berkas…</div><div class="row" style="margin-top:10px">${item.url ? `<a class="btn ghost" href="${esc(item.url)}" target="_blank" rel="noopener">Buka di Drive</a>` : ''}<button class="btn ghost" data-close>Tutup</button></div>`, async m => {
    const box = $('#mdBox', m);
    try {
      const blob = await getById(item.id, 'b64'); objUrl = URL.createObjectURL(blob);
      box.className = '';
      box.innerHTML = kind === 'audio' ? `<audio controls autoplay preload="metadata" src="${objUrl}" style="width:100%"></audio><p class="muted" style="font-size:12.5px">${esc(fmtSize(item.size))}</p>` : `<img src="${objUrl}" alt="${esc(item.name)}" style="max-width:100%;border-radius:12px">`;
      const obs = new MutationObserver(() => { if (!m.isConnected) { URL.revokeObjectURL(objUrl); obs.disconnect(); } }); obs.observe(document.body, { childList: true, subtree: true });
    } catch (e) { box.textContent = e.message; }
  });
}
function openItem(it) { // it: entri indeks
  const kind = mediaKind(it.name || it.orig, it.mime);
  if (kind === 'doc') return readEntry(it).catch(e => { toast(e.message); if (it.url) window.open(it.url, '_blank', 'noopener'); });
  return openMedia(it);
}

/* ---------- sinkron: samakan indeks dengan isi Drive (kunci = id) ---------- */
const prefixOf = (t, id, fallback) => { const f = (t.folders || []).find(x => x.id === id); return (f && f.path) || fallback; };
export function reconcile(idx, t, projects = []) {
  const sysPath = prefixOf(t, t.sysId, DIR.sys), pelPath = DIR.peluang;
  const skip = p => p === sysPath || p.startsWith(sysPath + '/') || p === pelPath || p.startsWith(pelPath + '/');
  const byId = new Map(t.files.map(f => [f.id, f])), byPath = new Map(t.files.map(f => [f.path, f]));
  const mdIds = new Set(); const seen = new Set();
  const stat = { added: 0, removed: 0, updated: 0 };
  const next = [];
  for (const e of idx.files) {
    let f = byId.get(e.id) || (e.file && byPath.get(e.file)) || (e.path && byPath.get(e.path) && !/^[A-Za-z0-9_-]{15,}$/.test(e.id) ? byPath.get(e.path) : null);
    if (!f) { if (t.truncated) next.push(e); else stat.removed++; continue; }
    if (seen.has(f.id)) continue; seen.add(f.id);
    const before = JSON.stringify([e.id, e.path, e.cat, e.project, e.topic, e.size]);
    e.id = f.id; e.name = f.name; e.path = f.path; e.folder = dirOf(f.path); e.url = f.url; e.size = f.size; e.mime = f.mime;
    const pc = catFromPath(f.path); if (pc) { e.cat = pc.cat; if (pc.project) e.project = pc.project; if (pc.topic) e.topic = pc.topic; }
    if (e.mdId) { const m = byId.get(e.mdId); if (m) { mdIds.add(m.id); e.md = m.path; } else if (!t.truncated) { delete e.mdId; delete e.md; } }
    if (e.id === e.mdId) mdIds.add(e.id);
    if (JSON.stringify([e.id, e.path, e.cat, e.project, e.topic, e.size]) !== before) stat.updated++;
    next.push(e);
  }
  for (const f of t.files) {
    if (seen.has(f.id) || mdIds.has(f.id) || skip(f.path)) continue;
    const pc = catFromPath(f.path);
    const cls = classify(f.name, { mime: f.mime, projects });
    const cat = pc ? pc.cat : cls.cat;
    next.push({ id: f.id, name: f.name, orig: f.name, title: niceTitle(f.name, '', cat), cat, project: pc && pc.project || (FIELD_CATS.includes(cat) ? cls.project : ''), topic: pc && pc.topic || '',
      folder: dirOf(f.path), path: f.path, mime: f.mime, size: f.size, pages: 0, added: (f.updated || today()).slice(0, 10), url: f.url, snippet: '', why: 'ditemukan di Drive' });
    stat.added++;
  }
  idx.files = next; return stat;
}

/* ---------- halaman ---------- */
export async function renderFiles(el, sub) {
  let idx = { files: [] }, loadErr = '';
  const st = { view: /pohon|folder/i.test(sub || '') ? 'pohon' : 'pintar', cat: 'all', project: 'all', q: '', open: new Set(['']) };
  el.innerHTML = `
    <div class="eyebrow">Berkas</div>
    <h1>Taruh di sini, nanti kutata.</h1>
    <p class="lede">CV, ijazah, catatan lapangan, rekaman, foto, bacaan: unggah apa saja. Aku coba menebak jenisnya, <b>menanyakan dulu</b> sebelum menyimpan, lalu menaruhnya di folder Google Drive yang tepat. Kamu juga boleh menata ulang langsung di Drive; aplikasi ini tinggal mengikuti.</p>
    <div id="fStatus"></div>
    <label class="dropzone" id="fdz"><input type="file" id="ff" multiple accept=".pdf,.docx,.txt,.md,.markdown,audio/*,.m4a,.mp3,.wav,.ogg,.opus,image/*,video/*" hidden>
      <span class="dz-ico">📥</span><b>Taruh berkas di sini, atau ketuk untuk memilih</b><small class="muted">PDF · Word · teks · rekaman suara · foto · video</small></label>
    <div id="fLog" class="stack" style="margin-top:12px"></div>
    <div class="fl-bar">
      <div class="seg" id="fView"><button data-v="pintar">Pintar</button><button data-v="pohon">Pohon folder</button></div>
      <button class="btn sm soft" id="fSync">Sinkronkan dengan Drive</button>
      <span class="muted fl-sync" id="fSyncInfo"></span>
    </div>
    <div id="fBody"></div>`;
  const body = $('#fBody', el), log = $('#fLog', el);

  const drawStatus = () => {
    $('#fStatus', el).innerHTML = connected() ? '' : `<div class="notice dew" style="margin-bottom:14px"><b>Drive belum tersambung di perangkat ini.</b> Berkas masih bisa dibaca di sini, tapi tidak disimpan. <a href="#/settings">Masuk di halaman Aku</a> (sekali saja).</div>`;
  };
  const syncInfo = () => { const t = Number(localStorage.getItem(SYNC_KEY) || 0); $('#fSyncInfo', el).textContent = t ? 'Terakhir: ' + new Date(t).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''; };

  async function doSync(silent) {
    if (!connected()) return;
    const btn = $('#fSync', el); if (btn) { btn.disabled = true; btn.textContent = 'Menyinkronkan…'; }
    try {
      const t = await getTree(true);
      idx = await loadIndex(true);
      const r = reconcile(idx, t, S().projects || []);
      if (r.added || r.removed || r.updated) { idx.updated = Date.now(); await saveIndex(idx); }
      localStorage.setItem(SYNC_KEY, String(Date.now()));
      if (!silent) toast(r.added || r.removed || r.updated ? `Sinkron: ${r.added} baru, ${r.updated} berubah, ${r.removed} hilang` : 'Sudah sama dengan Drive');
      loadErr = '';
    } catch (e) { if (!silent) toast(e.message); loadErr = e.message; }
    if (btn) { btn.disabled = false; btn.textContent = 'Sinkronkan dengan Drive'; }
    syncInfo(); draw();
  }

  /* ----- tampilan Pintar ----- */
  function drawSmart() {
    const counts = {}, projs = {};
    idx.files.forEach(f => { counts[f.cat] = (counts[f.cat] || 0) + 1; if (FIELD_CATS.includes(f.cat)) projs[f.project || UNKNOWN_PROJECT] = (projs[f.project || UNKNOWN_PROJECT] || 0) + 1; });
    const q = st.q.toLowerCase();
    const rows = idx.files.filter(f => (st.cat === 'all' || f.cat === st.cat) && (st.project === 'all' || (f.project || UNKNOWN_PROJECT) === st.project)
      && (!q || (f.title + ' ' + (f.topic || '') + ' ' + (f.project || '') + ' ' + (f.orig || '') + ' ' + (f.snippet || '')).toLowerCase().includes(q)));
    body.innerHTML = `
      <div class="row between" style="margin:14px 0 8px"><h2 style="margin:0">Semua berkasku</h2><span class="muted">${idx.files.length ? idx.files.length + ' berkas' : ''}</span></div>
      <div class="searchbar"><input type="search" id="fSearch" placeholder="Cari judul, topik, proyek…" value="${esc(st.q)}"></div>
      <div class="row fl-chips">${[['all', 'Semua', idx.files.length], ...CAT_ORDER.map(k => [k, catInfo(k).icon + ' ' + catInfo(k).label, counts[k] || 0])].filter(([k, , n]) => k === 'all' || n)
        .map(([k, l, n]) => `<button class="chip ${st.cat === k ? 'on' : ''}" data-cat="${k}">${esc(l)} · ${n}</button>`).join('')}</div>
      ${Object.keys(projs).length ? `<div class="row fl-chips"><span class="muted">Proyek:</span>${[['all', 'Semua', 0], ...Object.entries(projs).map(([k, n]) => [k, k, n])].map(([k, l, n]) => `<button class="chip ${st.project === k ? 'on' : ''}" data-proj="${esc(k)}">${esc(l)}${n ? ' · ' + n : ''}</button>`).join('')}</div>` : ''}
      <div id="fList">${loadErr ? `<div class="notice dew">${esc(loadErr)}</div>` : ''}${rows.length ? rows.map(f => {
        const kind = mediaKind(f.name || f.orig, f.mime);
        return `<div class="filecard" data-id="${esc(f.id)}"><div class="fc-ico">${catInfo(f.cat).icon}</div>
          <div class="fc-main"><b>${esc(f.title)}</b><div class="muted fc-meta">${esc(catInfo(f.cat).label)}${f.project && FIELD_CATS.includes(f.cat) ? ' · ' + esc(f.project) : ''}${f.topic ? ' · ' + esc(f.topic) : ''} · ${fmtD(f.added)}${f.size ? ' · ' + fmtSize(f.size) : ''}</div>
          ${f.snippet ? `<div class="fc-snip">${esc(f.snippet)}</div>` : ''}</div>
          <div class="fc-acts"><button class="btn sm" data-a="open">${kind === 'audio' ? 'Putar' : kind === 'doc' ? 'Baca' : 'Lihat'}</button><button class="btn sm ghost" data-a="more" aria-label="Lainnya">⋯</button></div></div>`;
      }).join('') : `<div class="empty">${idx.files.length ? 'Tidak ada yang cocok.' : connected() ? 'Belum ada berkas. Taruh yang pertama di atas, atau tekan "Sinkronkan dengan Drive" kalau kamu sudah menaruh sesuatu di foldernya.' : 'Berkas yang kamu taruh akan muncul di sini setelah Drive tersambung.'}</div>`}</div>`;
    $('#fSearch', body).oninput = e => { st.q = e.target.value; const pos = e.target.selectionStart; drawSmart(); const n = $('#fSearch', body); n.focus(); n.setSelectionRange(pos, pos); };
    $$('[data-cat]', body).forEach(b => b.onclick = () => { st.cat = b.dataset.cat; drawSmart(); });
    $$('[data-proj]', body).forEach(b => b.onclick = () => { st.project = b.dataset.proj; drawSmart(); });
    $$('.filecard', body).forEach(c => {
      const f = idx.files.find(x => x.id === c.dataset.id);
      c.onclick = e => { const a = e.target.closest('[data-a]'); if (a && a.dataset.a === 'more') return manage(f); openItem(f); };
    });
  }

  /* ----- sheet pengelolaan satu berkas (Pintar) ----- */
  function manage(f) {
    modal(`<h2 style="font-size:18px">${esc(f.title)}</h2>
      <p class="muted" style="font-size:13px">Lokasi di Drive: ${esc(f.folder || '')}<br>${esc(f.why || '')}</p>
      <div class="row"><button class="btn" data-a="open">Buka</button><button class="btn soft" data-a="move">Pindah ke kategori lain</button>${f.url ? `<a class="btn ghost" href="${esc(f.url)}" target="_blank" rel="noopener">Buka di Drive</a>` : ''}<button class="btn ghost" data-a="rm" style="color:var(--bad);border-color:var(--bad)">Hapus</button></div>`, (m, close) => {
      m.onclick = async e => {
        const a = e.target.closest('[data-a]'); if (!a) return;
        if (a.dataset.a === 'open') { close(); openItem(f); }
        if (a.dataset.a === 'move') { close(); confirmSheet({ title: f.title, cat: f.cat, project: f.project, topic: f.topic, name: f.name, existing: true }).then(async ch => { if (ch) await moveEntry(f, ch); }); }
        if (a.dataset.a === 'rm') {
          if (!confirm('Hapus berkas ini (dan salinan Markdown-nya) dari Drive? Berkasnya masuk ke tong sampah Drive, jadi masih bisa dikembalikan dari sana.')) return;
          close();
          try { await delById(f.id); if (f.mdId && f.mdId !== f.id) await delById(f.mdId).catch(() => {}); idx.files = idx.files.filter(x => x.id !== f.id); await saveIndex(idx); toast('Dihapus'); lastTree = null; } catch (err) { toast(err.message); }
          draw();
        }
      };
    });
  }
  async function moveEntry(f, ch) {
    try {
      toast('Memindahkan…');
      const folder = ch.folder;
      await moveById(f.id, `${folder}/${f.name}`);
      if (f.mdId && f.mdId !== f.id) await moveById(f.mdId, `${folder}/${baseOf(f.md || f.name)}`).catch(() => {});
      lastTree = null; await doSync(true); toast('Sudah dipindah');
    } catch (e) { toast(e.message); }
  }

  /* ----- lembar konfirmasi: "Aku kira ini ... Benar?" ----- */
  function confirmSheet({ title, cat, project, topic, name, why, note, size, existing }) {
    return new Promise(resolve => {
      const projects = [...new Set([...(S().projects || []), ...idx.files.map(f => f.project).filter(p => p && p !== UNKNOWN_PROJECT)])];
      const c = { cat, project: project || '', topic: topic || '', folder: '', touched: false };
      const recompute = () => { if (!c.touched) c.folder = folderFor(c.cat, { project: c.project, topic: c.topic }); };
      if (FIELD_CATS.includes(c.cat) && !c.project) c.project = UNKNOWN_PROJECT;
      recompute();
      let done = false;
      modal(`<div id="cfRoot"></div>`, (m, close) => {
        const bg = m.parentElement;
        const finish = v => { if (done) return; done = true; close(); resolve(v); };
        bg.addEventListener('click', e => { if (e.target === bg) finish(null); }, true);
        const paint = () => {
          const isField = FIELD_CATS.includes(c.cat);
          $('#cfRoot', m).innerHTML = `
            <h2 style="font-size:18px">${existing ? 'Pindahkan ke mana?' : 'Aku kira ini…'}</h2>
            <p class="cf-guess"><b>${esc(catInfo(c.cat).icon + ' ' + catInfo(c.cat).label)}</b>${isField ? ' · proyek <b>' + esc(c.project) + '</b>' : ''}${c.cat === 'bacaan' ? ' · topik <b>' + esc(c.topic || DEFAULT_TOPIC) + '</b>' : ''}${existing ? '' : '. Benar?'}</p>
            <p class="muted" style="font-size:13px;margin:0 0 8px">${esc(name || '')}${size ? ' · ' + fmtSize(size) : ''}${why ? '<br>Alasanku: ' + esc(why) : ''}</p>
            ${note ? `<div class="notice dew" style="font-size:13px;margin-bottom:8px">${esc(note)}</div>` : ''}
            ${size > WARN_BIG ? `<div class="notice dew" style="font-size:13px;margin-bottom:8px">Berkasnya besar (${fmtSize(size)}). Unggahannya bisa lama; biarkan halaman ini terbuka.</div>` : ''}
            <label class="f">Jenis</label>
            <div class="row fl-chips">${CAT_ORDER.map(k => `<button class="chip ${k === c.cat ? 'on' : ''}" data-c="${k}">${catInfo(k).icon} ${esc(catInfo(k).label)}</button>`).join('')}</div>
            ${isField ? `<label class="f">Proyek</label><div class="row fl-chips">${[...projects, UNKNOWN_PROJECT].map(p => `<button class="chip ${p === c.project ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('')}
              <input type="text" id="cfNewP" class="fl-mini" placeholder="+ proyek baru" aria-label="Proyek baru"></div>` : ''}
            ${c.cat === 'bacaan' ? `<label class="f">Topik</label><select id="cfTopic">${[...TOPICS.map(t => t[0]), DEFAULT_TOPIC].map(t => `<option ${t === (c.topic || DEFAULT_TOPIC) ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
            <label class="f">Folder di Drive</label>
            <input type="text" id="cfFolder" value="${esc(c.folder)}">
            <div class="row" style="margin:6px 0 0"><button class="btn sm ghost" id="cfInbox">Taruh di Kotak Masuk dulu</button></div>
            <p class="muted" style="font-size:12.5px;margin:10px 0 0">Disimpan di folder Google Drive milik Ejak, yang bisa dibuka Ejak.</p>
            <div class="row" style="margin-top:12px"><button class="btn" id="cfOk">${existing ? 'Pindahkan' : 'Ya, simpan'}</button><button class="btn ghost" id="cfNo">${existing ? 'Batal' : 'Lewati berkas ini'}</button></div>`;
          $$('[data-c]', m).forEach(b => b.onclick = () => { c.cat = b.dataset.c; if (FIELD_CATS.includes(c.cat) && !c.project) c.project = UNKNOWN_PROJECT; if (c.cat === 'bacaan' && !c.topic) c.topic = DEFAULT_TOPIC; recompute(); paint(); });
          $$('[data-p]', m).forEach(b => b.onclick = () => { c.project = b.dataset.p; recompute(); paint(); });
          const np = $('#cfNewP', m); if (np) np.onchange = () => { const v = safeName(np.value); if (np.value.trim()) { c.project = v; if (!projects.includes(v)) projects.push(v); recompute(); paint(); } };
          const tp = $('#cfTopic', m); if (tp) tp.onchange = () => { c.topic = tp.value; recompute(); paint(); };
          $('#cfFolder', m).oninput = e => { c.folder = e.target.value; c.touched = true; };
          $('#cfInbox', m).onclick = () => { c.folder = DIR.inbox; c.touched = true; paint(); };
          $('#cfOk', m).onclick = () => {
            const folder = c.folder.split('/').map(s => safeName(s)).filter(Boolean).join('/') || folderFor(c.cat, c);
            if (c.project && c.project !== UNKNOWN_PROJECT && !(S().projects || []).includes(c.project) && FIELD_CATS.includes(c.cat)) { S().projects = [...(S().projects || []), c.project]; save(); }
            finish({ cat: c.cat, project: FIELD_CATS.includes(c.cat) ? c.project : '', topic: c.cat === 'bacaan' ? (c.topic || DEFAULT_TOPIC) : '', folder, why: 'dikonfirmasi olehmu' });
          };
          $('#cfNo', m).onclick = () => finish(null);
        };
        paint();
        const poll = setInterval(() => { if (!m.isConnected) { clearInterval(poll); finish(null); } }, 300);
      });
    });
  }

  /* ----- unggah ----- */
  async function handle(files) {
    for (const file of files) {
      const row = document.createElement('div'); row.className = 'card logrow'; row.innerHTML = `<b>${esc(file.name)}</b><div class="muted" data-s>Mulai…</div><div class="ak-prog" data-bar hidden><i></i></div>`; log.prepend(row);
      const s = row.querySelector('[data-s]'), bar = row.querySelector('[data-bar]');
      try {
        const prep = await prepareFile(file, { onStatus: t => { s.textContent = t; }, projects: S().projects });
        const md = prep.conv ? buildDoc({ name: file.name, conv: prep.conv, cat: prep.cls.cat, project: prep.cls.project, topic: prep.cls.topic, title: prep.title }) : '';
        const openLocal = () => { const o = row.querySelector('[data-open]'); if (o) o.onclick = e => { e.preventDefault(); openReader({ title: prep.title, md, subtitle: catInfo(prep.cls.cat).label, key: 'local:' + prep.title }); }; };
        if (!connected()) { s.innerHTML = `Terbaca, tapi <b>belum disimpan</b> (Drive belum tersambung). ${prep.conv ? '<a href="#" data-open>Baca sekarang</a>' : ''}`; openLocal(); continue; }
        idx = await loadIndex();
        const dup = idx.files.find(f => f.orig === file.name && f.size === file.size);
        if (dup) { s.innerHTML = `Sudah pernah disimpan sebagai <b>${esc(catInfo(dup.cat).label)}</b>.`; continue; }
        s.textContent = 'Menunggu konfirmasimu…';
        const choice = await confirmSheet({ title: prep.title, cat: prep.cls.cat, project: prep.cls.project, topic: prep.cls.topic, name: file.name, why: prep.cls.reasons.join('; '), note: prep.note, size: file.size });
        if (!choice) { s.textContent = 'Dilewati, tidak disimpan.'; continue; }
        bar.hidden = false;
        const entry = await saveFile(prep, choice, { onStatus: t => { s.textContent = t; }, onProgress: (d, t) => { bar.firstElementChild.style.width = Math.round(d / t * 100) + '%'; s.textContent = `Mengunggah… ${Math.round(d / t * 100)}%`; } });
        bar.hidden = true; idx = await loadIndex();
        s.innerHTML = `Tersimpan di <b>${esc(entry.folder)}</b>. ${prep.conv ? '<a href="#" data-open>Baca sekarang</a>' : prep.note ? '<span class="muted">' + esc(prep.note) + '</span>' : ''}`;
        const o = row.querySelector('[data-open]'); if (o) o.onclick = e => { e.preventDefault(); readEntry(entry).catch(err => toast(err.message)); };
        draw();
      } catch (e) { bar.hidden = true; s.innerHTML = `<span style="color:var(--bad)">${esc(e.message)}</span>`; }
    }
  }

  /* ----- tampilan Pohon folder ----- */
  function drawTree() {
    const t = lastTree;
    if (!t) { body.innerHTML = `<div class="empty">${connected() ? 'Mengambil isi Drive…' : 'Hubungkan Drive dulu untuk melihat pohon foldernya.'}</div>`; return; }
    const kidsF = {}, kidsFi = {};
    t.folders.forEach(f => { (kidsF[f.parent || ''] = kidsF[f.parent || ''] || []).push(f); });
    t.files.forEach(f => { (kidsFi[f.parent || ''] = kidsFi[f.parent || ''] || []).push(f); });
    const cmp = (a, b) => a.name.localeCompare(b.name, 'id', { numeric: true });
    const count = id => (kidsFi[id] || []).length + (kidsF[id] || []).length;
    const rowsOf = (pid, depth) => [...(kidsF[pid] || []).sort(cmp)].map(f => {
      const open = st.open.has(f.id);
      return `<div class="tr-row" style="padding-left:${depth * 18}px" data-kind="folder" data-id="${esc(f.id)}"><button class="tr-tog" data-a="tog" aria-label="Buka/tutup">${open ? '▾' : '▸'}</button><span class="tr-name">📁 ${esc(f.name)}</span><span class="muted tr-meta">${count(f.id)}</span><button class="btn sm ghost" data-a="menu" aria-label="Aksi">⋯</button></div>${open ? rowsOf(f.id, depth + 1) : ''}`;
    }).join('') + ((pid === '' || st.open.has(pid)) ? [...(kidsFi[pid] || []).sort(cmp)].map(f => {
      const e = idx.files.find(x => x.id === f.id);
      return `<div class="tr-row" style="padding-left:${depth * 18 + 26}px" data-kind="file" data-id="${esc(f.id)}"><span class="tr-name">${esc(catInfo(e ? e.cat : 'lainnya').icon)} ${esc(f.name)}</span><span class="muted tr-meta">${esc(fmtSize(f.size))}</span><button class="btn sm" data-a="open">${mediaKind(f.name, f.mime) === 'audio' ? 'Putar' : 'Baca'}</button><button class="btn sm ghost" data-a="menu" aria-label="Aksi">⋯</button></div>`;
    }).join('') : '');
    const tidy = t.files.filter(f => !isSys(t, f.path) && (f.parent === '' || f.path.startsWith(DIR.inbox + '/'))).length;
    body.innerHTML = `<div class="row" style="margin:14px 0 8px"><button class="btn sm soft" id="trNew">+ Folder baru</button><button class="btn sm soft" id="trTidy">Rapikan otomatis${tidy ? ' (' + tidy + ')' : ''}</button><button class="btn sm ghost" id="trAll">Buka semua</button></div>
      <div class="tr">${rowsOf('', 0) || '<div class="empty">Drive masih kosong.</div>'}</div>`;
    $('#trNew', body).onclick = () => newFolder();
    $('#trTidy', body).onclick = () => tidyUp();
    $('#trAll', body).onclick = () => { t.folders.forEach(f => st.open.add(f.id)); drawTree(); };
    body.querySelector('.tr').onclick = e => {
      const row = e.target.closest('.tr-row'); if (!row) return;
      const a = e.target.closest('[data-a]'); const id = row.dataset.id; const isFolder = row.dataset.kind === 'folder';
      if (isFolder && (!a || a.dataset.a === 'tog')) { st.open.has(id) ? st.open.delete(id) : st.open.add(id); return drawTree(); }
      const node = (isFolder ? t.folders : t.files).find(x => x.id === id); if (!node) return;
      if (a && a.dataset.a === 'open') return openNode(node);
      nodeMenu(node, isFolder);
    };
  }
  const isSys = (t, p) => { const sp = prefixOf(t, t.sysId, DIR.sys); return p === sp || p.startsWith(sp + '/'); };
  function openNode(f) {
    const e = idx.files.find(x => x.id === f.id) || { id: f.id, name: f.name, orig: f.name, title: stemOf(f.name), cat: 'lainnya', mime: f.mime, size: f.size, url: f.url, path: f.path };
    openItem(e);
  }
  function nodeMenu(node, isFolder) {
    const t = lastTree; const prot = isFolder && node.id === t.sysId;
    modal(`<h2 style="font-size:18px">${isFolder ? '📁' : '📄'} ${esc(node.name)}</h2><p class="muted" style="font-size:13px">${esc(node.path)}</p>
      <div class="row">${isFolder ? '' : '<button class="btn" data-a="open">Baca / buka</button>'}${prot ? '' : '<button class="btn soft" data-a="mv">Pindah</button><button class="btn soft" data-a="rn">Ganti nama</button><button class="btn ghost" data-a="rm" style="color:var(--bad);border-color:var(--bad)">Hapus</button>'}${node.url ? `<a class="btn ghost" href="${esc(node.url)}" target="_blank" rel="noopener">Buka di Drive</a>` : ''}</div>
      ${prot ? '<p class="muted" style="font-size:13px">Folder sistem dipakai aplikasi ini, jadi tidak bisa dipindah atau dihapus dari sini.</p>' : ''}`, (m, close) => {
      m.onclick = async e => {
        const a = e.target.closest('[data-a]'); if (!a) return; close();
        if (a.dataset.a === 'open') openNode(node);
        if (a.dataset.a === 'mv') pickFolder(node, isFolder);
        if (a.dataset.a === 'rn') renameNode(node);
        if (a.dataset.a === 'rm') {
          if (!confirm(`Hapus ${isFolder ? 'folder' : 'berkas'} "${node.name}"${isFolder ? ' beserta isinya' : ''}? Ia dipindah ke tong sampah Drive, jadi masih bisa dikembalikan dari sana.`)) return;
          try { await delById(node.id); toast('Dihapus ke tong sampah Drive'); await doSync(true); } catch (err) { toast(err.message); }
        }
      };
    });
  }
  async function afterOp(fn, okMsg) { try { await fn(); toast(okMsg); await doSync(true); } catch (e) { toast(e.message); } }
  function renameNode(node) {
    modal(`<h2 style="font-size:18px">Ganti nama</h2><input type="text" id="rnIn" value="${esc(node.name)}"><div class="row" style="margin-top:10px"><button class="btn" id="rnOk">Simpan</button><button class="btn ghost" data-close>Batal</button></div>`, (m, close) => {
      $('#rnOk', m).onclick = () => { const n = safeName($('#rnIn', m).value); close(); if (n && n !== node.name) afterOp(() => moveById(node.id, (dirOf(node.path) ? dirOf(node.path) + '/' : '') + n), 'Nama diganti'); };
    });
  }
  function pickFolder(node, isFolder) {
    const t = lastTree;
    const opts = t.folders.filter(f => !(isFolder && (f.id === node.id || f.path.startsWith(node.path + '/')))).sort((a, b) => a.path.localeCompare(b.path, 'id', { numeric: true }));
    modal(`<h2 style="font-size:18px">Pindahkan "${esc(node.name)}" ke…</h2>
      <select id="pfSel"><option value="">(folder utama)</option>${opts.map(f => `<option value="${esc(f.path)}" ${f.path === dirOf(node.path) ? 'selected' : ''}>${esc(f.path)}</option>`).join('')}</select>
      <label class="f">atau folder baru</label><input type="text" id="pfNew" placeholder="mis. 04 Bacaan/Pendidikan">
      <div class="row" style="margin-top:10px"><button class="btn" id="pfOk">Pindahkan</button><button class="btn ghost" data-close>Batal</button></div>`, (m, close) => {
      $('#pfOk', m).onclick = () => {
        const dest = ($('#pfNew', m).value.trim() ? $('#pfNew', m).value.split('/').map(safeName).filter(Boolean).join('/') : $('#pfSel', m).value);
        close(); afterOp(() => moveById(node.id, (dest ? dest + '/' : '') + node.name), 'Sudah dipindah');
      };
    });
  }
  function newFolder() {
    const t = lastTree;
    modal(`<h2 style="font-size:18px">Folder baru</h2>
      <label class="f">Di dalam</label><select id="nfSel"><option value="">(folder utama)</option>${t.folders.filter(f => !isSys(t, f.path)).sort((a, b) => a.path.localeCompare(b.path, 'id', { numeric: true })).map(f => `<option value="${esc(f.path)}">${esc(f.path)}</option>`).join('')}</select>
      <label class="f">Nama</label><input type="text" id="nfName" placeholder="nama folder">
      <div class="row" style="margin-top:10px"><button class="btn" id="nfOk">Buat</button><button class="btn ghost" data-close>Batal</button></div>`, (m, close) => {
      $('#nfOk', m).onclick = () => { const n = safeName($('#nfName', m).value); if (!$('#nfName', m).value.trim()) return toast('Isi nama foldernya dulu'); const p = $('#nfSel', m).value; close(); afterOp(() => mkdir((p ? p + '/' : '') + n), 'Folder dibuat'); };
    });
  }

  /* ----- rapikan otomatis: usulan dulu, pindah hanya setelah kamu setuju ----- */
  async function tidyUp() {
    const t = await getTree(true); const mdIds = new Set(idx.files.map(e => e.mdId).filter(Boolean));
    const cands = t.files.filter(f => !isSys(t, f.path) && !mdIds.has(f.id) && (f.parent === '' || f.path.startsWith(DIR.inbox + '/')));
    if (!cands.length) return toast('Tidak ada berkas di Kotak Masuk atau folder utama. Sudah rapi!');
    const plan = cands.map(f => {
      const e = idx.files.find(x => x.id === f.id);
      const cls = classify(f.name, { mime: f.mime, text: e ? e.snippet : '', pages: e ? e.pages : 0, projects: S().projects || [] });
      return { f, e, cls, dest: cls.folder, on: cls.conf >= 0.6 && cls.cat !== 'lainnya' };
    });
    modal(`<h2 style="font-size:18px">Usulan merapikan</h2><p class="muted" style="font-size:13px">Belum ada yang dipindah. Centang yang kamu setujui.</p>
      <div class="tidy">${plan.map((p, i) => `<label class="tidy-row"><input type="checkbox" data-i="${i}" ${p.on ? 'checked' : ''}><span><b>${esc(p.f.name)}</b><br><span class="muted">${esc(p.f.path.includes('/') ? dirOf(p.f.path) : '(folder utama)')} → ${esc(p.dest)}<br>${esc(catInfo(p.cls.cat).icon + ' ' + catInfo(p.cls.cat).label)} · ${esc(p.cls.reasons[0])}</span></span></label>`).join('')}</div>
      <div class="row" style="margin-top:12px"><button class="btn" id="tdOk">Pindahkan yang dicentang</button><button class="btn ghost" data-close>Batal</button></div><p class="muted" id="tdMsg" style="font-size:13px"></p>`, (m, close) => {
      $('#tdOk', m).onclick = async () => {
        const picked = $$('input[data-i]', m).filter(i => i.checked).map(i => plan[+i.dataset.i]);
        if (!picked.length) return toast('Belum ada yang dicentang');
        const msg = $('#tdMsg', m); let ok = 0, bad = [];
        for (const p of picked) {
          msg.textContent = `Memindahkan ${ok + bad.length + 1} dari ${picked.length}…`;
          try {
            await moveById(p.f.id, `${p.dest}/${p.f.name}`);
            if (p.e && p.e.mdId && p.e.mdId !== p.e.id) await moveById(p.e.mdId, `${p.dest}/${baseOf(p.e.md || '')}`).catch(() => {});
            ok++;
          } catch (e) { bad.push(`${p.f.name}: ${e.message}`); }
        }
        if (bad.length) { msg.textContent = `${ok} dipindah, ${bad.length} gagal: ${bad.join(' | ')}`; } else { close(); toast(`${ok} berkas dirapikan`); }
        await doSync(true);
      };
    });
  }

  function draw() { $$('#fView button', el).forEach(b => b.classList.toggle('on', b.dataset.v === st.view)); st.view === 'pohon' ? drawTree() : drawSmart(); }

  /* ----- pasang ----- */
  const dz = $('#fdz', el), inp = $('#ff', el);
  inp.onchange = () => { handle([...inp.files]); inp.value = ''; };
  ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('hover'); }));
  ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('hover'); }));
  dz.addEventListener('drop', e => handle([...e.dataTransfer.files]));
  $('#fView', el).onclick = e => { const b = e.target.closest('button'); if (!b) return; st.view = b.dataset.v; draw(); if (st.view === 'pohon' && connected() && !lastTree) getTree().then(draw).catch(err => toast(err.message)); };
  $('#fSync', el).onclick = () => doSync(false);

  drawStatus(); syncInfo(); draw();
  if (connected()) {
    try { idx = await loadIndex(true); } catch (e) { loadErr = e.message; }
    draw();
    if (Date.now() - Number(localStorage.getItem(SYNC_KEY) || 0) > SYNC_EVERY) doSync(true);
    else if (st.view === 'pohon') getTree().then(draw).catch(() => {});
  }
}
