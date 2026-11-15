// Peluang: peta jalur PhD berdana dan hibah/fellowship riset untuk Berta.
// Robot harian (data/opportunities.json) + scout mingguan (data/agent-radar.json) + yang ia tambahkan sendiri,
// dibaca oleh analyze.js, diberi prioritas, bisa ditandai "Bukan untukku", dilacak dengan checklist.
import * as U from './util.js';
import { analyse, toMarkdown, htmlToText, VERDICT, APPLICANT, TYPE_LABEL } from './analyze.js';
import { DIR, connected, fetchPage, putText, getText, del, list as driveList } from './drive.js';
import { openReader } from './reader.js';

const { S, save, esc, $, $$, toast, fmtDate, daysLeft, uid, getJSON, modal, copyText, addXP, today } = U;
const CACHE_DIR = (DIR && DIR.cache) || '99 Sistem/cache-peluang';
const APPS_DIR = (DIR && DIR.apps) || '01 Peluang/Lamaran';
const safeName = s => String(s || 'tanpa judul').replace(/[\\/<>:"|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'tanpa judul';
const enc = encodeURIComponent;
const shorten = (s, n) => (s || '').length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + '…' : (s || '');

/* ---------------- kata kunci & konteks analisis ---------------- */
function customWords() { return (S().customKeywords || []).map(c => typeof c === 'string' ? c : c && c.w).filter(Boolean).map(w => String(w).toLowerCase()); }
function keywordsAll() {
  if (typeof U.allKeywords === 'function') return U.allKeywords();
  return [...new Set([...(S().profile.keywords || []), ...customWords()].map(k => String(k).toLowerCase()))];
}
const actx = () => ({ keywords: keywordsAll(), custom: customWords(), places: S().profile.places || [], avoid: S().profile.avoid || [] });
const kwSig = () => { const c = actx(); return [c.keywords.join('|'), c.custom.join('|'), c.places.join('|'), c.avoid.join('|')].join('#'); };

/* ---------------- memuat data ---------------- */
let cache = null;
async function loadOpps() {
  if (cache) return cache;
  const [robot, agent] = await Promise.all([
    getJSON('data/opportunities.json', { items: [], report: [], updated: null }),
    getJSON('data/agent-radar.json', { items: [], updated: null }),
  ]);
  const items = [], seenIds = new Set();
  const src = [...((agent && agent.items) || []).map(x => ({ ...x, curated: true })), ...((robot && robot.items) || []), ...(S().customOpps || []).map(x => ({ ...x, mine: true }))];
  for (const it of src) {
    if (!it || !it.title) continue;
    const id = it.id || hash(it.link || it.title);
    if (seenIds.has(id)) continue; seenIds.add(id);
    items.push({ ...it, id });
  }
  items.forEach(applyAnalysis);
  items.sort((a, b) => b.priority - a.priority);
  pruneFlags(items);
  cache = { items, robot: robot || {}, agent: agent || {} };
  rememberNew(items);
  return cache;
}
function hash(s = '') { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return 'h' + (h >>> 0).toString(36); }
window.addEventListener('fromodyssey:saved', () => { if (cache && cache.sig !== kwSig()) { cache.sig = kwSig(); cache.items.forEach(applyAnalysis); cache.items.sort((a, b) => b.priority - a.priority); } });

export async function topOpportunities(n = 3) {
  const { items } = await loadOpps();
  return items.filter(o => !S().seen[o.id] && !isFlagged(o) && o.an.verdict !== 'skip' && (o.an.daysLeft ?? 1) >= 0).slice(0, n);
}

/** Jumlah peluang di arus yang belum dilihat/ditandai dan pertama muncul ≤ 7 hari lalu.
 *  Sinkron: memakai data yang sudah dimuat (atau hitungan terakhir), lalu memuat ulang di belakang. */
const NEW_KEY = 'fromodyssey.newCount';
function countNew(items) {
  const t = today();
  return items.filter(o => !S().seen[o.id] && !isFlagged(o) && o.an.verdict !== 'skip' && (o.an.daysLeft ?? 1) >= 0 &&
    (() => { const d = o.first_seen || o.checked || o.published; if (!d) return false; const age = Math.round((Date.parse(t) - Date.parse(d)) / 86400000); return age >= 0 && age <= 7; })()).length;
}
function rememberNew(items) { try { localStorage.setItem(NEW_KEY, String(countNew(items))); } catch (_) {} }
export function newCount() {
  if (cache) return countNew(cache.items);
  loadOpps().catch(() => {});
  return +(localStorage.getItem(NEW_KEY) || 0) || 0;
}

/* ---------------- pelacak: tahap (kunci disimpan dalam bahasa Inggris agar data lama tetap jalan) ---------------- */
const STAGES = [['Saved', 'Disimpan'], ['Preparing', 'Menyiapkan'], ['Applied', 'Terkirim'], ['Interview', 'Wawancara'], ['Outcome', 'Hasil']];
const stageLabel = k => (STAGES.find(s => s[0] === k) || [k, k])[1];
function normStages() {
  const back = Object.fromEntries(STAGES.map(([k, l]) => [l.toLowerCase(), k]));
  for (const t of S().tracker) { if (!STAGES.some(s => s[0] === t.stage)) t.stage = back[String(t.stage || '').toLowerCase()] || 'Saved'; if (!Array.isArray(t.steps)) t.steps = []; }
}

export function nextTrackerSteps(n = 3) {
  normStages();
  const out = [];
  for (const t of S().tracker) {
    if (t.stage === 'Outcome') continue;
    const st = t.steps.find(x => !x.done);
    if (st) out.push({ id: t.id, title: t.title, step: st.t, deadline: t.deadline, days: daysLeft(t.deadline), href: '#/radar/pelacak' });
  }
  out.sort((a, b) => (a.days ?? 999) - (b.days ?? 999));
  return out.slice(0, n);
}

/* ---------------- kerangka halaman ---------------- */
const TABS = [['', 'Arus'], ['ringkas', 'Ringkas 5 menit'], ['kalender', 'Kalender musim'], ['rute', 'Rute'], ['cari', 'Cari cepat'], ['pelacak', 'Pelacak']];
const ALIAS = { digest: 'ringkas', tracker: 'pelacak', search: 'cari', routes: 'rute', calendar: 'kalender', feed: '', arus: '' };

export function renderRadar(el, sub = []) {
  let tab = sub[0] || ''; if (tab in ALIAS) tab = ALIAS[tab];
  el.innerHTML = `
    <div class="eyebrow">Peluang</div>
    <h1>PhD berdana, hibah &amp; fellowship</h1>
    <p class="lede">Tiap pagi robot membaca feed publik, tiap minggu scout mencari dengan teliti. Fromodyssey membaca tiap peluang, mengambil tenggat, dana dan syaratnya, menandai yang menghalangimu, lalu mengurutkan sisanya. Ketuk kartu untuk rinciannya. Alon-alon asal kelakon.</p>
    <nav class="tabs" aria-label="Bagian peluang">${TABS.map(([k, l]) => `<a href="#/radar${k ? '/' + k : ''}" class="${k === tab && tab !== 'item' ? 'on' : ''}">${l}</a>`).join('')}</nav>
    <div id="radarBody" class="radar"></div>`;
  const body = $('#radarBody', el);
  if (tab === 'item') return detail(body, decodeURIComponent(sub[1] || ''));
  (({ '': feed, ringkas: digest, kalender: calendar, rute: routes, cari: search, pelacak: tracker })[tab] || feed)(body, sub.slice(1));
}

/* ---------------- analisis + cache ---------------- */
const AK = 'fromodyssey.analysis';
let AN = (() => { try { return JSON.parse(localStorage.getItem(AK) || '{}'); } catch (_) { return {}; } })();
const saveAN = () => { try { localStorage.setItem(AK, JSON.stringify(AN)); } catch (_) { /* penuh: buang teks laman yang disimpan */ for (const a of Object.values(AN)) delete a._text; try { localStorage.setItem(AK, JSON.stringify(AN)); } catch (__) {} } };
const INDEX_PATH = CACHE_DIR + '/_index.json';
const tried = new Set();
let indexSynced = false, pushTimer = null;

function applyAnalysis(o) {
  const a = AN[o.id], sig = kwSig();
  if (a && a.source === 'page') {
    if (a.kw !== sig && a._text) { const re = analyse(o, { ...actx(), text: a._text }); AN[o.id] = { ...re, _text: a._text, kw: sig }; saveAN(); o.an = AN[o.id]; }
    else o.an = a;
  } else o.an = analyse(o, actx());
  if (o.an.source !== 'page') o.an.source = 'feed';
  o.priority = o.an.priority;
  return o;
}
export const isFlagged = o => !!(o && (S().flags[o.id] || S().seen[o.id] === 'skip'));
function pruneFlags(items) {
  if (!items.length) return;                       // data gagal dimuat: jangan pernah memangkas dari daftar kosong
  const ids = new Set(items.map(o => o.id)); let changed = false;
  for (const id of Object.keys(S().flags)) if (!ids.has(id)) { delete S().flags[id]; changed = true; }
  for (const id of Object.keys(S().seen)) if (!ids.has(id) && !S().tracker.some(t => t.oppId === id)) { delete S().seen[id]; changed = true; }
  if (changed) save();
}
function schedulePush() {
  if (!connected()) return; clearTimeout(pushTimer);
  pushTimer = setTimeout(() => putText(INDEX_PATH, JSON.stringify({ updated: Date.now(), byId: AN }), 'application/json').catch(() => {}), 4000);
}
async function syncIndexFromDrive() {
  if (indexSynced || !connected()) return; indexSynced = true;
  try {
    const t = await getText(INDEX_PATH); const j = t ? JSON.parse(t) : null;
    if (j && j.byId) { for (const [id, a] of Object.entries(j.byId)) if (!AN[id] || (a.analysedAt || '') > (AN[id].analysedAt || '')) AN[id] = a; saveAN(); }
  } catch (_) {}
}
/** Sekali sehari: hapus analisis (dan .md di Drive) untuk peluang yang sudah hilang dari arus atau kedaluwarsa. */
async function pruneCache(items) {
  if (!items.length) return;
  const k = 'fromodyssey.prune'; if (localStorage.getItem(k) === today()) return; localStorage.setItem(k, today());
  const ids = new Set(items.map(o => o.id)); const tracked = new Set(S().tracker.map(t => t.oppId));
  const dead = id => !tracked.has(id) && (!ids.has(id) || (AN[id] && AN[id].expires < today()));
  let removed = 0;
  if (connected()) {
    try {
      const files = await driveList(CACHE_DIR);
      for (const f of files || []) { const m = /^(.+)\.md$/.exec(f.name); if (m && dead(m[1])) { await del(f.path || `${CACHE_DIR}/${f.name}`); removed++; } }
    } catch (_) {}
  }
  for (const id of Object.keys(AN)) if (dead(id)) { delete AN[id]; removed++; }
  saveAN(); if (removed) schedulePush();
}
async function deepRead(o) {
  const r = await fetchPage(o.link);
  const html = r && (r.text || r.html || '');
  if ((r && r.status >= 400) || !html || html.length < 400) throw new Error(`Laman aslinya tidak bisa dibaca (status ${(r && r.status) || '?'}).`);
  const a = analyse(o, { ...actx(), html });
  if (a.source !== 'page') throw new Error('Teks di lamannya terlalu sedikit untuk dibaca (mungkin butuh JavaScript).');
  const txt = htmlToText(html).text.slice(0, 15000);
  AN[o.id] = { ...a, _text: txt, kw: kwSig() }; saveAN(); o.an = AN[o.id]; o.priority = a.priority;
  putText(`${CACHE_DIR}/${o.id}.md`, toMarkdown(a), 'text/markdown').catch(() => {});
  schedulePush();
  return a;
}
let queueRunning = false;
async function readTopAdverts(items, onProgress, limit = 12) {
  if (!connected() || queueRunning) return 0;
  const todo = items.filter(o => o.an.source !== 'page' && !isFlagged(o) && /^https?:/.test(o.link || '') && !/\.pdf($|\?)/i.test(o.link) && o.an.verdict !== 'skip' && (o.an.daysLeft ?? 1) >= 0 && !tried.has(o.id)).slice(0, limit);
  if (!todo.length) return 0;
  queueRunning = true; let done = 0;
  try {
    for (const o of todo) {
      tried.add(o.id); onProgress(done, todo.length);
      try { await deepRead(o); } catch (_) { /* biarkan bacaan cepat */ }
      done++;
    }
    onProgress(done, todo.length);
  } finally { queueRunning = false; }
  return done;
}
function rankList(items) { return items.filter(o => !isFlagged(o) && o.an.verdict !== 'skip' && (o.an.daysLeft ?? 1) >= 0); }

/* ---------------- "Bukan untukku" ---------------- */
const FLAG_REASONS = [['citizenship', 'Hanya untuk warga negara tertentu'], ['own-students', 'Hanya untuk mahasiswa/staf kampus itu'], ['campus', 'Butuh afiliasi kampus (NIDN, PI universitas)'], ['needs-phd', 'Butuh PhD selesai (postdoc)'], ['self-funded', 'Tidak didanai'], ['field', 'Temanya tidak nyambung'], ['closed', 'Sudah tutup'], ['other', 'Alasan lain']];
const ALIAS_FLAG = { 'postdoc-title': 'needs-phd' };
function flagModal(o, done) {
  let sug = (o.an.blockers.find(b => b.sev === 'high') || {}).id; sug = ALIAS_FLAG[sug] || sug;
  const pre = FLAG_REASONS.some(([k]) => k === sug) ? sug : 'field';
  modal(`<h2 style="font-size:19px">Bukan untukmu? Ceritakan kenapa.</h2>
    <p class="muted" style="margin-top:0;font-size:13.5px">${esc(o.title)}</p>
    <div class="stack" style="gap:6px">${FLAG_REASONS.map(([k, l]) => `<label class="radio"><input type="radio" name="fr" value="${k}" ${k === pre ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
    <label class="f" for="frNote">Catatan (boleh kosong)</label><input type="text" id="frNote">
    <div class="row" style="margin-top:14px"><button class="btn" id="frGo">Tandai dan sembunyikan</button><button class="btn ghost" data-close>Batal</button></div>`, (m, close) => {
    $('#frGo', m).onclick = () => {
      const reason = (m.querySelector('input[name=fr]:checked') || {}).value || 'other';
      S().flags[o.id] = { reason, note: $('#frNote', m).value.trim(), at: today(), title: o.title };
      save(); close(); toast('Ditandai. Sudah disembunyikan dari daftarmu.'); done && done();
    };
  });
}
function unflag(o) { delete S().flags[o.id]; if (S().seen[o.id] === 'skip') delete S().seen[o.id]; save(); }
const flagLabel = r => (FLAG_REASONS.find(x => x[0] === r) || [, r])[1];

/* ---------------- kartu ---------------- */
const chipHtml = t => `<span class="chip ${t.cls || ''}">${esc(t.label)}</span>`;
const typeChip = type => ({ label: { phd: '🎓 PhD', grant: '🌱 Hibah', fellowship: '✦ Fellowship', course: '📚 Kursus' }[type] || '✦ Peluang', cls: 't-' + (type || 'x') });
const applicantChip = ap => ap ? { label: { lembaga: '🏡 Sebagai Sokola', individu: '🙋 Pribadi', keduanya: '🤝 Dua-duanya bisa' }[ap], cls: 'a-' + ap } : null;
function deadlineChip(a) {
  if (a.daysLeft == null) return a.rolling ? { label: '♾ Dibuka terus', cls: 'good' } : null;
  if (a.daysLeft < 0) return { label: 'Sudah tutup', cls: 'bad' };
  return { label: `⏳ ${fmtDate(a.deadline)} · ${a.daysLeft === 0 ? 'hari ini' : 'sisa ' + a.daysLeft + ' hari'}`, cls: a.daysLeft < 14 ? 'warn' : '' };
}
function oppChips(o) {
  const a = o.an, V = VERDICT[a.verdict];
  const out = [{ label: `${V.icon} ${V.label}`, cls: 'v ' + V.cls }, typeChip(a.type || o.type), applicantChip(a.applicant), deadlineChip(a)];
  const money = a.stipend || a.amount; if (money) out.push({ label: '💰 ' + shorten(money, 34), cls: 'water' });
  const hi = a.blockers.find(b => b.sev === 'high'); if (hi) out.push({ label: '🚩 ' + shorten(hi.text, 46), cls: 'bad' });
  if (o.curated) out.push({ label: '✦ dari scout', cls: 'water' });
  if (o.mine) out.push({ label: '✍ tambahanmu' });
  return out.filter(Boolean);
}
const pri = n => n >= 68 ? 'p-top' : n >= 50 ? 'p-good' : n >= 34 ? 'p-maybe' : 'p-low';
const whyLine = o => o.why || o.an.whyRelevant;

/* ---------------- Arus ---------------- */
const FILTERS = [['all', 'Semua'], ['phd', 'PhD'], ['grant', 'Hibah & fellowship'], ['lembaga', 'Sebagai Sokola'], ['individu', 'Pribadi']];
const passFilter = (o, f) => f === 'all' ? true : f === 'phd' ? o.an.type === 'phd' : f === 'grant' ? ['grant', 'fellowship'].includes(o.an.type)
  : f === 'lembaga' ? ['lembaga', 'keduanya'].includes(o.an.applicant) : f === 'individu' ? ['individu', 'keduanya'].includes(o.an.applicant) : true;

function reportHtml(robot, agent) {
  const rep = robot.report || [];
  const ok = rep.filter(r => r.ok), bad = rep.filter(r => !r.ok);
  const nSrc = typeof robot.sources === 'number' ? robot.sources : Array.isArray(robot.sources) ? robot.sources.length : ok.length;
  const head = robot.updated ? `Robot terakhir jalan ${fmtDate(robot.updated)} · ${nSrc} sumber berisi` : 'Robot belum pernah jalan.';
  const sc = agent.updated ? ` · scout mingguan ${fmtDate(agent.updated)}` : '';
  if (!rep.length) return `<p class="muted small">${head}${sc}</p>`;
  return `<details class="rd-report"><summary class="muted small">${head}${sc}${bad.length ? ` · ${bad.length} sumber bermasalah` : ''}</summary>
    <ul class="plain small">${rep.map(r => `<li>${r.ok ? '✅' : '⚠️'} <b>${esc(r.name)}</b>: ${r.ok ? r.count + ' peluang' : esc(r.error || 'gagal')}</li>`).join('')}</ul></details>`;
}

async function feed(el) {
  el.innerHTML = '<p class="muted">Memuat peluang…</p>';
  await loadOpps(); await syncIndexFromDrive();
  const { items, robot, agent } = await loadOpps();
  items.forEach(applyAnalysis); items.sort((a, b) => b.priority - a.priority);
  const filter = { f: 'all', q: '', showFlagged: false };
  const draw = () => {
    const ranked = rankList(items); const rankOf = new Map(ranked.map((o, i) => [o.id, i + 1]));
    const flaggedN = items.filter(isFlagged).length;
    const q = filter.q.toLowerCase();
    const list = items.filter(o => (filter.showFlagged ? isFlagged(o) : !isFlagged(o)) && passFilter(o, filter.f) &&
      (!q || (o.title + ' ' + (o.summary || '') + ' ' + (o.org || '')).toLowerCase().includes(q)));
    const top = !filter.showFlagged && !q ? ranked.filter(o => passFilter(o, filter.f) && (o.an.verdict === 'top' || o.an.verdict === 'good')).slice(0, 3) : [];
    $('#startHere', el).innerHTML = top.length ? `<section class="card starthere"><div class="eyebrow">Mulai dari sini: ${top.length} teratas</div>${top.map((o, i) => `
      <a class="sh-item" href="#/radar/item/${enc(o.id)}"><span class="sh-n">${i + 1}</span><div><b>${esc(o.title)}</b><div class="muted small">${esc(o.org || o.source || '')}${o.an.deadline ? ' · tutup ' + fmtDate(o.an.deadline) : ''}</div><div class="why-line">${esc(shorten(whyLine(o), 140))}</div></div><span class="pri ${pri(o.priority)}" title="Prioritas untukmu, dari 99">${o.priority}</span></a>`).join('')}</section>` : '';
    $('#feedList', el).innerHTML = list.length ? list.slice(0, 80).map(o => oppRow(o, rankOf.get(o.id), filter.showFlagged)).join('') :
      `<div class="empty">${filter.showFlagged ? 'Belum ada yang ditandai.' : items.length ? 'Tidak ada yang cocok dengan saringan ini.' : 'Belum ada peluang. Robot di GitHub mengisi daftar ini setelah jalan pertama kali. Sementara itu, monggo coba <a href="#/radar/cari">Cari cepat</a> atau lihat <a href="#/radar/kalender">Kalender musim</a>.'}</div>`;
    const fb = $('#fFlag', el); fb.textContent = `🚩 Ditandai (${flaggedN})`; fb.classList.toggle('on', filter.showFlagged); fb.style.display = flaggedN || filter.showFlagged ? '' : 'none';
    bindOppActions(el, draw, items);
  };
  el.innerHTML = `
    <div class="rd-filters" role="group" aria-label="Saring peluang">
      ${FILTERS.map(([k, l]) => `<button class="chip ${k === 'all' ? 'on' : ''}" data-f="${k}" aria-pressed="${k === 'all'}">${l}</button>`).join('')}
      <button class="chip" id="fFlag" style="display:none"></button>
    </div>
    <div class="row between" style="margin:8px 0">
      <div class="searchbar" style="flex:1;min-width:200px"><input type="search" id="fq" placeholder="Saring dengan kata, mis. adat, Leiden, film…" aria-label="Saring dengan kata"></div>
      <button class="btn sm ghost" id="addOpp">+ Tambah yang kutemukan</button>
    </div>
    ${reportHtml(robot, agent)}
    <p class="muted small">${items.length} peluang</p>
    <div id="readStatus"></div>
    <div id="startHere"></div>
    <div class="card"><div id="feedList"></div></div>`;
  $$('[data-f]', el).forEach(b => b.onclick = () => { $$('[data-f]', el).forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); filter.f = b.dataset.f; draw(); });
  $('#fFlag', el).onclick = () => { filter.showFlagged = !filter.showFlagged; draw(); };
  $('#fq', el).oninput = e => { filter.q = e.target.value; draw(); };
  $('#addOpp', el).onclick = () => addOppModal(() => { cache = null; feed(el); });
  draw();
  pruneCache(items);
  const rs = $('#readStatus', el);
  if (!connected()) rs.innerHTML = `<div class="notice" style="margin:8px 0">Ini <b>bacaan cepat</b> dari ringkasan singkat tiap peluang. <a href="#/settings">Sambungkan Google Drive</a> supaya Fromodyssey bisa membuka laman aslinya, mengambil tenggat dan syaratnya, lalu mengurutkan ulang.</div>`;
  else {
    const n = await readTopAdverts(items, (d, tot) => { if (document.body.contains(rs)) rs.innerHTML = `<div class="notice" style="margin:8px 0">📖 Membaca laman lengkapnya… ${d} dari ${tot}</div>`; });
    if (document.body.contains(rs)) { rs.innerHTML = n ? `<p class="muted small">📖 ${n} laman dibaca lengkap, daftar sudah diurutkan ulang.</p>` : ''; if (n) { items.sort((a, b) => b.priority - a.priority); draw(); } }
  }
}

function oppRow(o, rank, flaggedView) {
  const fl = S().flags[o.id]; const tracked = S().tracker.some(t => t.oppId === o.id);
  return `<div class="opp ${flaggedView ? 'is-flagged' : ''}" data-id="${esc(o.id)}" tabindex="0" role="link" aria-label="Buka rincian: ${esc(o.title)}">
    <div class="opp-main"><div class="row" style="gap:8px;align-items:flex-start">${rank && !flaggedView ? `<span class="rank">#${rank}</span>` : ''}<h3>${esc(o.title)}</h3></div>
      <div class="meta">${esc(o.org || '')}${o.org && o.source ? ' · ' : ''}${esc(o.source || '')}</div>
      <div class="rd-chips">${oppChips(o).map(chipHtml).join('')}</div>
      ${flaggedView && fl ? `<div class="why muted">Ditandai: ${esc(flagLabel(fl.reason))}${fl.note ? ' · ' + esc(fl.note) : ''}</div>` : `<div class="why why-line">${esc(shorten(whyLine(o), 150))}</div>`}
    </div>
    <div class="acts"><span class="pri ${pri(o.priority)}" title="Prioritas untukmu, dari 99">${o.priority}</span>
      ${flaggedView ? `<button class="btn sm" data-act="restore">Kembalikan</button>` : `<button class="btn sm" data-act="track">${tracked ? '✓ Dilacak' : 'Lacak'}</button>
      <button class="btn sm ghost" data-act="flag">Bukan untukku</button>`}
    </div></div>`;
}
function bindOppActions(el, redraw, items) {
  $$('.opp', el).forEach(card => {
    const id = card.dataset.id; const go = () => { location.hash = '#/radar/item/' + enc(id); };
    card.onclick = e => { if (e.target.closest('[data-act]') || e.target.closest('a')) return; go(); };
    card.onkeydown = e => { if (e.key === 'Enter' && e.target === card) go(); };
  });
  $$('.opp [data-act]', el).forEach(b => b.onclick = e => {
    e.stopPropagation();
    const o = items.find(x => x.id === b.closest('.opp').dataset.id); if (!o) return;
    if (b.dataset.act === 'flag') return flagModal(o, redraw);
    if (b.dataset.act === 'restore') { unflag(o); toast('Dikembalikan'); }
    if (b.dataset.act === 'track') trackOpp(o);
    redraw();
  });
}

/* ---------------- Rincian: rangkuman dulu, laman asli sebagai tombol ---------------- */
async function detail(el, id) {
  const { items } = await loadOpps();
  const o = items.find(x => x.id === id);
  if (!o) { el.innerHTML = `<div class="card"><h2>Peluang ini sudah tidak ada di daftar</h2><p class="muted">Mungkin sudah tutup dan dibersihkan robot.</p><a class="btn" href="#/radar">Kembali ke daftar</a></div>`; return; }
  let note = '';
  const draw = () => {
    const a = o.an, V = VERDICT[a.verdict]; const ranked = rankList(items); const rk = ranked.findIndex(x => x.id === o.id) + 1;
    const fl = S().flags[o.id]; const R = a.requirements || {};
    const fact = (k, v) => v ? `<dt>${k}</dt><dd>${v}</dd>` : '';
    const reqs = [...(R.eligibility || []), ...(R.degree || []), ...(R.english || []), ...(R.skills || [])].slice(0, 6);
    const dana = [a.amount && `Dana: ${esc(a.amount)}`, a.stipend && `Stipend/gaji: ${esc(a.stipend)}`, a.fees && esc(a.fees), { full: 'Didanai penuh', partial: 'Didanai sebagian', none: 'Tidak didanai' }[a.funded]].filter(Boolean).join('<br>');
    const tracked = S().tracker.some(t => t.oppId === o.id);
    el.innerHTML = `
      <a href="#/radar" class="back">← Kembali ke daftar</a>
      <div class="verdict ${V.cls}"><div class="v-ico" aria-hidden="true">${V.icon}</div><div><div class="v-label">${V.label} · prioritas ${a.priority}/99${rk ? ` · #${rk} dari ${ranked.length} untukmu` : ''}</div><div class="v-text">${esc(a.summary || a.verdictText)}</div></div></div>
      <h1 class="d-title">${esc(o.title)}</h1>
      <div class="muted" style="margin-bottom:8px">${esc(o.org || '')}${o.org && o.source ? ' · ' : ''}${esc(o.source || '')}</div>
      <div class="rd-chips" style="margin-bottom:12px">${oppChips(o).slice(1).map(chipHtml).join('')}</div>
      <p class="why-line big">${esc(a.whyRelevant)}</p>
      ${o.why ? `<div class="notice" style="margin-bottom:12px"><b>Kata scout:</b> ${esc(o.why)}${o.checked ? ` <span class="muted small">(dicek ${fmtDate(o.checked)})</span>` : ''}</div>` : ''}
      ${fl ? `<div class="notice dew" style="margin-bottom:12px">Kamu menandai ini "bukan untukku" (${esc(flagLabel(fl.reason))}). <button class="btn sm" id="dRestore">Kembalikan</button></div>` : ''}
      ${a.blockers.length ? `<section class="card warn-card"><h2>Cek dulu sebelum mendaftar</h2>${a.blockers.map(b => `<div class="flagrow ${b.sev}"><span aria-hidden="true">${b.sev === 'high' ? '🚩' : '⚠️'}</span><div><b>${esc(b.text)}</b>${b.quote ? `<div class="muted quote">“${esc(b.quote)}”</div>` : ''}</div></div>`).join('')}</section>` : ''}
      <section class="card"><h2>Fakta penting</h2><dl class="facts">
        ${fact('Tenggat', a.deadline ? `<b>${fmtDate(a.deadline)}</b>${a.daysLeft != null ? ` <span class="chip ${a.daysLeft < 0 ? 'bad' : a.daysLeft < 14 ? 'warn' : ''}">${a.daysLeft < 0 ? 'sudah lewat' : 'sisa ' + a.daysLeft + ' hari'}</span>` : ''}` : a.rolling ? 'Dibuka terus (rolling)' : '<span class="muted">Tidak ketemu: cek di laman aslinya</span>')}
        ${fact('Mulai', esc(a.start))}${fact('Jenis', esc(a.level))}${fact('Dana', dana)}
        ${fact('Siapa yang mengajukan', esc(APPLICANT[a.applicant] || 'Belum jelas: cek di laman aslinya'))}
        ${fact('Syarat', reqs.length ? `<ul class="plain">${reqs.map(x => `<li>${esc(x)}</li>`).join('')}</ul>${a.notes.map(n => `<div class="muted small">• ${esc(n)}</div>`).join('')}` : (a.notes.length ? a.notes.map(n => esc(n)).join('<br>') : ''))}
        ${fact('Cara daftar', a.howToApply.length ? `<ul class="plain">${a.howToApply.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : '')}
        ${fact('Lokasi', esc(a.location))}
        ${fact('Kontak', (a.contacts || []).map(c => `<a href="mailto:${esc(c)}">${esc(c)}</a>`).join(', '))}
      </dl></section>
      ${a.positives.length ? `<section class="card"><h2>Yang menguntungkanmu</h2>${a.positives.map(p => `<div class="flagrow good"><span aria-hidden="true">✅</span><div>${esc(p.text)}${p.quote ? `<div class="muted quote">“${esc(p.quote)}”</div>` : ''}</div></div>`).join('')}</section>` : ''}
      ${o.steps && o.steps.length ? `<section class="card"><h2>Langkah dari scout</h2><ol class="steps">${o.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></section>` : ''}
      <section class="card"><p style="margin-top:0"><b>Langkah berikutnya:</b> ${esc(a.nextStep)}</p>
        <div class="row">
          <button class="btn" id="dTrack">${tracked ? '✓ Ada di Pelacak' : 'Lacak + checklist'}</button>
          ${fl ? '' : '<button class="btn ghost" id="dFlag">Bukan untukku</button>'}
          <button class="btn ghost" id="dMd">📖 Baca sebagai Markdown</button>
          ${o.link ? `<a class="btn ghost" href="${esc(o.link)}" target="_blank" rel="noopener">Buka laman aslinya ↗</a>` : ''}
        </div>
        <p class="muted small" style="margin:10px 0 0" id="dNote">${note || (a.source === 'page' ? `Dibaca dari laman lengkap pada ${fmtDate(a.analysedAt)}.` : 'Bacaan cepat dari ringkasan singkat saja.')} Cek lagi di laman aslinya untuk tanggal, kelayakan dan dana.</p>
      </section>`;
    $('#dTrack', el).onclick = () => { trackOpp(o); draw(); };
    $('#dMd', el).onclick = () => openReader({ title: o.title, md: toMarkdown(a), key: 'an:' + o.id, subtitle: 'Ringkasan peluang', filename: safeName(o.title) + ' (ringkasan).md' });
    const f = $('#dFlag', el); if (f) f.onclick = () => flagModal(o, draw);
    const r = $('#dRestore', el); if (r) r.onclick = () => { unflag(o); draw(); };
  };
  draw();
  if (o.an.source !== 'page' && /^https?:/.test(o.link || '')) {
    if (!connected()) { note = 'Bacaan cepat saja. Sambungkan Google Drive (Pengaturan) supaya laman aslinya bisa dibaca.'; draw(); }
    else {
      const n = $('#dNote', el); if (n) n.textContent = '📖 Membuka laman aslinya untuk dibaca lengkap…';
      try { await deepRead(o); note = ''; items.sort((a, b) => b.priority - a.priority); }
      catch (e) { note = e.message + ' Yang tampil bacaan cepat.'; }
      if (document.body.contains(el)) draw();
    }
  }
}

/* ---------------- Ringkas 5 menit ---------------- */
async function digest(el) {
  const { items } = await loadOpps();
  const queue = rankList(items).filter(o => !S().seen[o.id]).slice(0, 5);
  let i = 0;
  const show = () => {
    if (i >= queue.length) {
      el.innerHTML = `<div class="card celebrate"><div class="big" aria-hidden="true">🌿</div><h2>Ringkasan selesai</h2><p class="muted">${queue.length ? `Kamu sudah memilah ${queue.length} peluang. Cukup untuk hari ini, ora popo istirahat.` : 'Belum ada yang baru untuk dipilah. Cek lagi setelah robot jalan besok pagi.'}</p><a class="btn" href="#/radar/pelacak">Lihat Pelacak</a></div>`;
      if (queue.length) addXP(5);
      return;
    }
    const o = queue[i], a = o.an;
    el.innerHTML = `<div class="digest-card">
      <div class="row between"><span class="muted">${i + 1} dari ${queue.length}</span><span class="pri ${pri(o.priority)}">${o.priority}</span></div>
      <div class="progress" style="margin:8px 0 16px"><i style="width:${(i / queue.length) * 100}%"></i></div>
      <div class="card">
        <div class="rd-chips">${oppChips(o).map(chipHtml).join('')}</div>
        <div class="big-title">${esc(o.title)}</div>
        <div class="muted">${esc(o.org || o.source || '')}</div>
        <p class="why-line">${esc(a.whyRelevant)}</p>
        <p style="margin:10px 0 4px"><b>${esc(a.verdictText)}</b></p>
        ${o.why ? `<p><b>Kata scout:</b> ${esc(o.why)}</p>` : ''}
        <a href="#/radar/item/${enc(o.id)}">Lihat rincian lengkap →</a>
      </div>
      <div class="triage">
        <button class="btn ghost" data-t="skip">Bukan untukku</button>
        <button class="btn soft" data-t="later">Nanti</button>
        <button class="btn" data-t="saved">⭐ Lacak</button>
      </div>
      <p class="muted small" style="text-align:center;margin-top:10px">Tombol: <span class="kbd">←</span> lewati · <span class="kbd">↓</span> nanti · <span class="kbd">→</span> lacak</p>
    </div>`;
    $$('[data-t]', el).forEach(b => b.onclick = () => decide(b.dataset.t));
  };
  const decide = t => {
    const o = queue[i];
    if (t === 'skip') S().flags[o.id] = { reason: 'other', note: 'dilewati di ringkasan', at: today(), title: o.title }; else S().seen[o.id] = t;
    save();
    if (t === 'saved') trackOpp(o, true);
    i++; show();
  };
  const onKey = e => {
    if (!document.body.contains(el)) return document.removeEventListener('keydown', onKey);
    if (i >= queue.length || /input|textarea|select/i.test((e.target && e.target.tagName) || '')) return;
    if (e.key === 'ArrowLeft') decide('skip'); else if (e.key === 'ArrowRight') decide('saved'); else if (e.key === 'ArrowDown') { e.preventDefault(); decide('later'); }
  };
  document.addEventListener('keydown', onKey);
  show();
}

/* ---------------- Kalender musim (data/funders.json) ---------------- */
const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
async function calendar(el) {
  el.innerHTML = '<p class="muted">Memuat kalender…</p>';
  const d = await getJSON('data/funders.json', { funders: [] });
  const funders = (d && d.funders) || [];
  let q = '';
  const draw = () => {
    const ql = q.toLowerCase();
    const fs = funders.filter(f => !ql || [f.name, f.org, f.why, f.eligibility, f.region, f.notes, f.type].join(' ').toLowerCase().includes(ql));
    const cur = new Date().getMonth() + 1; const groups = [];
    for (let k = 0; k < 12; k++) {
      const m = ((cur - 1 + k) % 12) + 1;
      const list = fs.filter(f => (f.closeMonths || []).includes(m));
      if (list.length) groups.push({ title: `${BULAN[m - 1]}${k === 0 ? ' (bulan ini)' : ''}`, list });
    }
    const loose = fs.filter(f => !(f.closeMonths || []).length);
    if (loose.length) groups.push({ title: 'Dibuka terus / tanggal tidak tetap', list: loose });
    $('#calBody', el).innerHTML = groups.length ? groups.map(g => `<section class="cal-month"><h2>${esc(g.title)}</h2><div class="cal-grid">${g.list.map(funderCard).join('')}</div></section>`).join('')
      : `<div class="empty">${funders.length ? 'Tidak ada yang cocok dengan kata itu.' : 'Kalender belum terisi. Daftar penyandang dana (data/funders.json) diisi peneliti dan dirawat scout mingguan.'}</div>`;
    $$('[data-track-funder]', el).forEach(b => b.onclick = () => {
      const f = funders.find(x => x.id === b.dataset.trackFunder); if (!f) return;
      trackOpp({ id: 'funder-' + f.id, title: f.name, org: f.org, link: f.url, type: f.type, applicant: f.applicant, summary: [f.eligibility, f.notes].filter(Boolean).join(' '), why: f.why, deadline: '' });
      draw();
    });
  };
  el.innerHTML = `<p class="muted">Penyandang dana yang buka hampir tiap tahun, dikelompokkan menurut bulan biasanya tutup, mulai dari bulan ini. Bulan ini perkiraan dari tahun-tahun sebelumnya: <b>cek laman resmi untuk tanggal</b>.</p>
    <div class="searchbar" style="margin-bottom:12px"><input type="search" id="calQ" placeholder="Cari: LPDP, Belanda, film, lembaga…" aria-label="Cari di kalender"></div>
    <div id="calBody"></div>
    ${d && d.updated ? `<p class="muted small">Daftar diperbarui ${fmtDate(d.updated)}.</p>` : ''}`;
  $('#calQ', el).oninput = e => { q = e.target.value; draw(); };
  draw();
}
function funderCard(f) {
  const tracked = S().tracker.some(t => t.oppId === 'funder-' + f.id);
  const ap = applicantChip(f.applicant);
  return `<article class="card fcard">
    <div class="rd-chips">${chipHtml(typeChip(f.type))}${ap ? chipHtml(ap) : ''}${f.region ? chipHtml({ label: '📍 ' + f.region }) : ''}</div>
    <h3>${esc(f.name)}</h3>${f.org ? `<div class="muted small">${esc(f.org)}</div>` : ''}
    <dl class="facts small">
      ${f.amount ? `<dt>Dana</dt><dd>${esc(f.amount)}</dd>` : ''}${f.opens ? `<dt>Buka</dt><dd>${esc(f.opens)}</dd>` : ''}
      ${f.eligibility ? `<dt>Siapa</dt><dd>${esc(f.eligibility)}</dd>` : ''}
    </dl>
    ${f.why ? `<p class="why-line">${esc(f.why)}</p>` : ''}
    ${f.notes ? `<p class="muted small">${esc(f.notes)}</p>` : ''}
    <div class="row">${f.url ? `<a class="btn sm ghost" href="${esc(f.url)}" target="_blank" rel="noopener">Laman resmi ↗</a>` : ''}<button class="btn sm" data-track-funder="${esc(f.id)}">${tracked ? '✓ Dilacak' : 'Lacak'}</button></div>
    ${f.verified ? `<p class="muted tiny">Dicek ${fmtDate(f.verified)}</p>` : ''}
  </article>`;
}

/* ---------------- Rute (playbook langkah demi langkah) ---------------- */
export const ROUTES = [
  {
    id: 'lpdp', icon: '🇮🇩', title: 'Beasiswa LPDP: doktor di luar negeri', type: 'phd',
    who: 'Untuk WNI. LPDP membiayai studi doktor di perguruan tinggi tujuan yang ada di daftarnya; komponen dana (biaya kuliah, biaya hidup dan lainnya), syarat usia, bahasa dan dokumen diatur di buku panduan tiap tahun dan bisa berubah.',
    when: 'Biasanya dibuka dalam beberapa tahap per tahun. Cek laman resmi untuk tanggal.',
    link: 'https://lpdp.kemenkeu.go.id/',
    steps: [
      'Unduh buku panduan pendaftaran LPDP terbaru; catat syarat usia, IPK, bahasa, LoA dan daftar kampus tujuan.',
      'Pilih 3–5 kampus/program di daftar LPDP yang punya calon supervisor untuk temamu (masyarakat adat, bunyi, pendidikan adat).',
      'Kirim email singkat ke calon supervisor: CV, ringkasan riset 1 halaman, satu tulisannya yang kamu baca (template di Pelacak).',
      'Jadwalkan tes bahasa yang diterima (mis. IELTS/TOEFL iBT) jauh sebelum pendaftaran; cek skor minimum di panduan.',
      'Tulis rencana riset dan esai (kontribusi untuk Indonesia, rencana kembali); minta masukan dari 1–2 orang.',
      'Bila skema itu meminta LoA, urus pendaftaran ke kampus tujuan; kalau belum ada, cek apakah boleh menyusul.',
      'Siapkan dokumen (ijazah, transkrip, surat rekomendasi, dan surat lain yang diminta) lalu unggah di portal.',
      'Latih seleksi substansi/wawancara: jelaskan risetmu dalam 3 menit, siapkan cerita Sokola dan lapangan.',
    ],
  },
  {
    id: 'australia-awards', icon: '🇦🇺', title: 'Australia Awards Scholarship: jenjang doktor', type: 'phd',
    who: 'Beasiswa Pemerintah Australia untuk negara mitra termasuk Indonesia. Bidang prioritas dan apakah jenjang PhD dibuka bisa berbeda tiap putaran. Penerima biasanya wajib kembali ke negara asal setelah lulus untuk jangka waktu tertentu. Kalau S2-mu dibiayai beasiswa Pemerintah Australia, cek aturan jeda sebelum boleh mendaftar lagi.',
    when: 'Biasanya satu putaran per tahun. Cek laman resmi untuk tanggal.',
    link: 'https://www.australiaawardsindo.or.id/',
    steps: [
      'Baca panduan putaran terbaru: apakah jenjang doktor dibuka, bidang prioritas, dan aturan untuk alumni beasiswa Australia.',
      'Pastikan topikmu bisa dibingkai dalam bidang prioritas (mis. pendidikan, inklusi, lingkungan, tata kelola).',
      'Hubungi calon supervisor di Australia (mantan dosenmu di ANU bisa jadi pintu pertama) dan minta surat dukungan bila diminta.',
      'Siapkan skor bahasa sesuai syarat, ijazah, transkrip dan dua referensi.',
      'Tulis jawaban esai: masalah di Indonesia, bagaimana risetmu menjawabnya, rencana setelah pulang.',
      'Kirim lewat portal resmi sebelum tenggat; simpan salinan PDF di Berkas.',
      'Bila lolos tahap awal, latih wawancara dan siapkan tes bahasa lanjutan bila diminta.',
    ],
  },
  {
    id: 'anu-phd', icon: '🎓', title: 'PhD di ANU + beasiswa riset (HDR)', type: 'phd',
    who: 'Pelamar internasional mendaftar program PhD (Higher Degree by Research) dan biasanya dipertimbangkan untuk beasiswa universitas sekaligus. Supervisor yang bersedia hampir selalu jadi kunci; sebagian program meminta expression of interest (EOI) dulu.',
    when: 'Ada beberapa putaran penilaian beasiswa per tahun. Cek laman resmi untuk tanggal.',
    link: 'https://www.anu.edu.au/study/scholarships',
    steps: [
      'Cari calon supervisor di direktori peneliti ANU (mis. antropologi dan Asia-Pasifik); baca 2 tulisan terbarunya.',
      'Kirim email/EOI: 1 halaman ringkasan riset, CV, dan pertanyaan apakah ia mau membimbing (template di Pelacak).',
      'Kalau ia setuju, susun proposal 2–5 halaman bersama masukannya.',
      'Siapkan transkrip, ijazah S2 ANU, bukti bahasa bila diminta, dan dua-tiga referensi.',
      'Daftar online ke program PhD dan pastikan kamu ditandai untuk dipertimbangkan beasiswa.',
      'Sambil menunggu, siapkan juga rute LPDP sebagai cadangan pendanaan.',
    ],
  },
  {
    id: 'dutch-phd', icon: '🇳🇱', title: 'PhD di Belanda sebagai pegawai (UvA dan kampus lain)', type: 'phd',
    who: 'Di Belanda, PhD umumnya posisi kerja bergaji (PhD candidate / promovendus) dengan kontrak beberapa tahun. Posisi diiklankan seperti lowongan kerja, sering dalam proyek yang didanai NWO atau ERC. Pengalamanmu sebagai asisten riset proyek UvA tentang pendidikan Orang Rimba adalah modal nyata.',
    when: 'Lowongan muncul sepanjang tahun; tiap iklan punya tenggat sendiri. Cek di iklannya.',
    link: 'https://www.academictransfer.com/en/',
    steps: [
      'Pasang notifikasi di AcademicTransfer dan laman lowongan UvA (cari institut riset ilmu sosial seperti AISSR) dengan kata "anthropology", "PhD".',
      'Cek proyek NWO/ERC yang baru didanai di antropologi dan studi Asia Tenggara: posisi PhD sering diiklankan setelah proyek mulai.',
      'Kabari peneliti UvA yang pernah bekerja denganmu: tanyakan rencana proyek dan lowongan ke depan.',
      'Siapkan CV akademik dan motivation letter 1 halaman yang menjawab teks iklan satu per satu.',
      'Siapkan writing sample (bab tesis ANU) dan dua referensi yang siap dihubungi.',
      'Alternatif: PhD dengan beasiswa sendiri (mis. LPDP) di kampus Belanda — gabungkan dengan rute LPDP.',
    ],
  },
  {
    id: 'wenner-gren', icon: '🌍', title: 'Wenner-Gren Foundation (Wadsworth International Fellowship, dll.)', type: 'fellowship',
    who: 'Yayasan khusus antropologi. Wadsworth International Fellowship mendukung pelatihan doktoral antropolog dari negara yang kurang terwakili di bidang ini untuk belajar di institusi lain; biasanya perlu dukungan institusi asal dan institusi tujuan. Ada juga hibah lain, mis. untuk kerja lapangan disertasi bagi yang sudah terdaftar sebagai mahasiswa doktoral. Syarat persisnya cek di laman resmi.',
    when: 'Siklus tahunan, tiap program punya tenggatnya sendiri. Cek laman resmi untuk tanggal.',
    link: 'https://wennergren.org/',
    steps: [
      'Buka daftar program Wenner-Gren dan baca syarat Wadsworth International Fellowship versi terbaru.',
      'Pastikan siapa yang harus mencalonkan/mendukung (institusi asal dan kampus tujuan) dan dokumen apa yang mereka kirim.',
      'Bicarakan dengan calon supervisor dan kampus tujuan sejak awal: mereka biasanya ikut mengisi bagian lamaran.',
      'Siapkan proposal pelatihan + riset yang jelas tentang kontribusinya untuk antropologi di Indonesia.',
      'Catat hibah Wenner-Gren lain (mis. kerja lapangan disertasi) untuk tahap berikutnya setelah terdaftar PhD.',
    ],
  },
  {
    id: 'sokola-pribadi', icon: '🧭', title: 'Hibah lewat Sokola atau pribadi? Panduan singkat memilih', type: 'grant', guide: true,
    who: 'Banyak hibah bisa diajukan oleh lembaga atau perorangan. Pilih jalur yang paling masuk akal untuk dana itu, bukan yang paling cepat.',
    when: 'Putuskan sebelum mulai menulis proposal. Cek laman resmi untuk tanggal.',
    asOrg: [
      'Penyandang dana meminta badan hukum (yayasan/perkumpulan), NPWP lembaga, atau rekening atas nama lembaga.',
      'Dananya untuk program komunitas: sekolah rimba, kelompok perempuan, media komunitas, pelatihan.',
      'Mereka menilai rekam jejak lembaga: laporan program, laporan keuangan, audit, mitra sebelumnya.',
      'Kegiatannya melibatkan tim dan berjalan lebih lama dari satu orang bisa pegang.',
      'Ingat: perlu persetujuan pimpinan Sokola, pembagian peran yang jelas, dan siapa yang menulis laporan.',
    ],
    asMe: [
      'Fellowship, beasiswa PhD, residensi menulis, atau hibah riset untuk peneliti perorangan.',
      'Dana perjalanan, kerja lapangan untuk risetmu sendiri, konferensi, atau penulisan buku/artikel.',
      'Hasilnya berupa karya atas namamu (tesis, film, artikel) — tetap sebut dan hormati komunitas serta Sokola.',
      'Kalau syaratnya "afiliasi kampus" (dosen/NIDN atau PI universitas), cari mitra universitas sebagai pengusul utama.',
    ],
    steps: [
      'Baca bagian "who can apply / eligibility" dan catat: lembaga, perorangan, atau dua-duanya.',
      'Kalau dua-duanya: tanya dirimu, dana ini untuk program komunitas atau untuk perjalanan risetmu?',
      'Kalau jalur Sokola: cek dokumen lembaga yang diminta (akta, NPWP, rekening, laporan) dan bicarakan dengan pimpinan.',
      'Kalau jalur pribadi: siapkan CV, research statement, dan surat dukungan (bisa dari Sokola).',
      'Tulis concept note 1–2 halaman dulu (template di Pelacak), baru proposal lengkap.',
    ],
  },
];

function routes(el) {
  el.innerHTML = `<p class="muted">Tiap rute adalah playbook. Tanggal sengaja tidak ditulis: <b>cek laman resmi untuk tanggal</b>. Kalau kamu melacak peluang, checklist-nya disalin ke Pelacak supaya kamu hanya melihat satu langkah kecil berikutnya.</p>
  <div class="route-grid">${ROUTES.map(r => `
    <article class="card route ${r.guide ? 'route-guide' : ''}" id="rute-${r.id}"><h3><span aria-hidden="true">${r.icon}</span> ${esc(r.title)}</h3>
    <p>${esc(r.who)}</p>
    <p class="muted small"><b>Kapan:</b> ${esc(r.when)}</p>
    ${r.guide ? `<div class="guide-cols"><div><h4>🏡 Ajukan sebagai Sokola kalau…</h4><ul>${r.asOrg.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div><div><h4>🙋 Ajukan sebagai pribadi kalau…</h4><ul>${r.asMe.map(s => `<li>${esc(s)}</li>`).join('')}</ul></div></div>` : ''}
    <details><summary>Lihat ${r.steps.length} langkah</summary><ol class="steps">${r.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>
    ${r.link ? `<p style="margin-top:10px"><a href="${esc(r.link)}" target="_blank" rel="noopener">Laman resmi ↗</a></p>` : ''}
    </article>`).join('')}</div>
    <div class="spacer"></div>
    <div class="card water"><h3>Ritme mingguan yang masuk akal (sekitar 3 jam)</h3>
    <ul><li><b>Senin</b>: Ringkas 5 menit, lacak 1–2 peluang.</li><li><b>Selasa/Kamis</b>: satu langkah lamaran (satu email, satu paragraf proposal).</li><li><b>Rabu</b>: baca satu tulisan calon supervisor.</li><li><b>Minggu</b>: istirahat. Serius.</li></ul></div>`;
}

function routeFor(o) {
  if (o.route && ROUTES.some(r => r.id === o.route)) return o.route;
  const t = [o.title, o.org, o.summary, o.link].join(' ');
  if (/\bLPDP\b/i.test(t)) return 'lpdp';
  if (/australia awards/i.test(t)) return 'australia-awards';
  if (/\bANU\b|australian national university/i.test(t)) return 'anu-phd';
  if (/amsterdam|\buva\b|netherlands|leiden|utrecht|nwo\b|academictransfer/i.test(t)) return 'dutch-phd';
  if (/wenner|wadsworth/i.test(t)) return 'wenner-gren';
  const type = (o.an && o.an.type) || o.type;
  if (type === 'grant') return 'sokola-pribadi';
  return null;
}

/* ---------------- Checklist pelacak (berbeda untuk PhD dan hibah) ---------------- */
const CHECKLIST = {
  phd: [
    'Baca syarat kelayakan dan pendanaan di laman aslinya; catat tenggat di sini.',
    'Baca 2 tulisan terbaru calon supervisor.',
    'Kirim email ke calon supervisor (template di bawah) dengan CV dan ringkasan riset 1 halaman.',
    'Susun research statement / proposal (kerangka di bawah).',
    'Minta 2–3 surat rekomendasi; beri perekomendasi tenggat dan ringkasan risetmu.',
    'Siapkan tes bahasa / dokumen yang diminta (ijazah, transkrip, writing sample).',
    'Kirim lamaran (dan formulir beasiswa terpisah, bila ada) sebelum tenggat.',
    'Siapkan wawancara: presentasi 5 menit tentang riset dan pengalaman lapangan.',
  ],
  grant: [
    'Baca panduan hibah; catat tenggat, besaran dana, dan siapa yang boleh mengajukan.',
    'Putuskan: sebagai Sokola atau pribadi (lihat Rute → panduan singkat).',
    'Tulis concept note 1–2 halaman (kerangka di bawah) dan minta masukan.',
    'Susun anggaran sederhana sesuai aturan penyandang dana.',
    'Kumpulkan dokumen: CV / profil lembaga, surat dukungan komunitas atau mitra.',
    'Tulis proposal lengkap mengikuti formulir mereka, pertanyaan demi pertanyaan.',
    'Kirim sebelum tenggat; simpan salinan dan bukti kirim di Berkas.',
  ],
  lembaga: [
    'Baca panduan hibah; catat tenggat, besaran dana dan syarat lembaga.',
    'Bicarakan dengan pimpinan Sokola: siapa penanggung jawab, siapa penulis laporan.',
    'Cek dokumen lembaga: akta, NPWP, rekening atas nama lembaga, laporan program/keuangan terakhir.',
    'Tulis concept note 1–2 halaman bersama tim dan komunitas (kerangka di bawah).',
    'Susun anggaran dan rencana kegiatan yang realistis.',
    'Kumpulkan surat dukungan komunitas/mitra.',
    'Kirim lewat kanal resmi sebelum tenggat; arsipkan semuanya di Berkas.',
  ],
};
CHECKLIST.fellowship = CHECKLIST.phd.filter((_, i) => i !== 1).map(s => s.replace('calon supervisor', 'tuan rumah / mentor'));
CHECKLIST.course = ['Baca syarat dan biaya; cek apakah ada beasiswa peserta.', 'Siapkan CV dan surat motivasi singkat.', 'Kirim pendaftaran sebelum tenggat.'];

export function trackOpp(o, quiet) {
  normStages();
  if (S().tracker.some(t => t.oppId === o.id)) { if (!quiet) toast('Sudah ada di Pelacak'); return; }
  const type = (o.an && o.an.type) || o.type || 'grant';
  const applicant = (o.an && o.an.applicant) || o.applicant || null;
  const kind = type === 'phd' ? 'phd' : type === 'grant' && applicant === 'lembaga' ? 'lembaga' : CHECKLIST[type] ? type : 'grant';
  const steps = (o.steps && o.steps.length ? o.steps : CHECKLIST[kind]).map(t => ({ t, done: false }));
  const dl = (o.an && o.an.deadline) || o.deadline || '';
  S().tracker.unshift({ id: uid(), oppId: o.id, title: o.title, org: o.org || '', link: o.link || '', type, kind, applicant, route: routeFor(o), deadline: dl, stage: 'Saved', notes: '', steps, added: today() });
  S().seen[o.id] = 'saved'; save();
  if (connected() && o.an) putText(`${APPS_DIR}/${safeName((o.org ? o.org + ' - ' : '') + o.title)}/Ringkasan peluang.md`, toMarkdown(o.an), 'text/markdown').catch(() => {});
  if (!quiet) toast('Masuk Pelacak, lengkap dengan checklist');
}

/* ---------------- Pelacak ---------------- */
function tracker(el) {
  normStages();
  const t = S().tracker;
  el.innerHTML = `<div class="row between" style="margin-bottom:12px"><p class="muted" style="margin:0">Ketuk kartu untuk checklist, catatan dan template.</p><button class="btn sm ghost" id="addT">+ Tambah manual</button></div>
  <div class="board">${STAGES.map(([st, label]) => `<div class="col"><h4>${label} <span class="pill-n">${t.filter(x => x.stage === st).length}</span></h4>
    ${t.filter(x => x.stage === st).map(x => {
      const done = x.steps.filter(s => s.done).length; const dl = daysLeft(x.deadline);
      return `<div class="tcard" data-id="${x.id}" tabindex="0" role="button"><b>${esc(x.title)}</b><small class="muted">${esc(x.org)}</small>
      <div class="rd-chips">${chipHtml(typeChip(x.type))}${x.applicant ? chipHtml(applicantChip(x.applicant)) : ''}</div>
      <div class="progress" style="margin:7px 0 4px;height:5px"><i style="width:${x.steps.length ? done / x.steps.length * 100 : 0}%"></i></div>
      <small class="muted">${done}/${x.steps.length} langkah${dl != null ? ` · ${dl < 0 ? 'tenggat lewat' : 'sisa ' + dl + ' hari'}` : ''}</small></div>`;
    }).join('') || '<small class="muted" style="padding:4px">—</small>'}</div>`).join('')}</div>
  <div class="spacer"></div>
  <section class="card"><h3>Template</h3><p class="muted small">Ketuk untuk menyalin. Ganti bagian dalam [kurung siku].</p>
    <div class="row tpl-list">${TEMPLATES.map(([k, l]) => `<button class="btn sm soft" data-tpl="${k}">${l}</button>`).join('')}</div></section>`;
  $$('.tcard', el).forEach(c => { const open = () => openTracked(c.dataset.id, () => tracker(el)); c.onclick = open; c.onkeydown = e => { if (e.key === 'Enter') open(); }; });
  $('#addT', el).onclick = () => addOppModal(() => tracker(el), true);
  $$('[data-tpl]', el).forEach(b => b.onclick = () => copyText(template(b.dataset.tpl, { title: '[judul peluang]', org: '' })));
}

function openTracked(id, onChange) {
  const x = S().tracker.find(t => t.id === id); if (!x) return;
  const r = ROUTES.find(r => r.id === x.route);
  modal(`
    <div class="row between"><div class="eyebrow">${esc(r ? r.title : (TYPE_LABEL[x.type] || 'Rencana'))}</div><button class="btn sm ghost" data-close>Tutup</button></div>
    <h2>${esc(x.title)}</h2><p class="muted">${esc(x.org)} ${x.link ? `· <a href="${esc(x.link)}" target="_blank" rel="noopener">laman aslinya ↗</a>` : ''}${r ? ` · <a href="#/radar/rute" data-close>rute ${esc(r.title.split(':')[0])}</a>` : ''}</p>
    <div class="grid g2">
      <div><label class="f" for="tStage">Tahap</label><select id="tStage">${STAGES.map(([s, l]) => `<option value="${s}" ${s === x.stage ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div><label class="f" for="tDl">Tenggat</label><input type="date" id="tDl" value="${esc(x.deadline || '')}"></div>
    </div>
    <h3 style="margin-top:16px">Checklist</h3>
    <div id="tSteps">${x.steps.map((s, i) => `<label class="check ${s.done ? 'done' : ''}"><input type="checkbox" data-i="${i}" ${s.done ? 'checked' : ''}><span>${esc(s.t)}</span></label>`).join('')}</div>
    <label class="f" for="tNotes">Catatan</label><textarea id="tNotes" rows="3" placeholder="Nama calon supervisor, siapa yang sudah kamu hubungi, tanggal wawancara…">${esc(x.notes)}</textarea>
    <h3 style="margin-top:16px">Template</h3>
    <div class="row tpl-list">${TEMPLATES.filter(([k]) => x.type === 'phd' ? !/^concept/.test(k) : true).map(([k, l]) => `<button class="btn sm soft" data-tpl="${k}">${l}</button>`).join('')}</div>
    <div class="row between" style="margin-top:20px"><button class="btn ghost danger" id="tDel">Hapus</button><button class="btn" data-close>Selesai</button></div>
  `, (m, close) => {
    $$('#tSteps input', m).forEach(cb => cb.onchange = () => {
      const s = x.steps[cb.dataset.i]; s.done = cb.checked; cb.parentElement.classList.toggle('done', cb.checked);
      if (cb.checked) { addXP(3); toast('+3 XP — satu langkah lebih dekat'); }
      if (x.stage === 'Saved' && cb.checked) { x.stage = 'Preparing'; $('#tStage', m).value = 'Preparing'; }
      save(); onChange();
    });
    $('#tStage', m).onchange = e => { x.stage = e.target.value; save(); onChange(); };
    $('#tDl', m).onchange = e => { x.deadline = e.target.value; save(); onChange(); };
    $('#tNotes', m).oninput = e => { x.notes = e.target.value; save(); };
    $('#tDel', m).onclick = () => { if (confirm('Hapus dari Pelacak?')) { S().tracker = S().tracker.filter(t => t.id !== x.id); save(); close(); onChange(); } };
    $$('[data-tpl]', m).forEach(b => b.onclick = () => copyText(template(b.dataset.tpl, x)));
  });
}

const TEMPLATES = [['sup-en', 'Email calon supervisor (EN)'], ['sup-id', 'Email calon supervisor (ID)'], ['followup', 'Follow-up sopan (EN)'], ['statement', 'Kerangka research statement'], ['concept-id', 'Kerangka concept note (ID)'], ['concept-en', 'Concept note outline (EN)'], ['ai', 'Minta AI menyesuaikan CV']];
function template(kind, x) {
  const name = S().profile.name || '[Namamu]';
  const yr = new Date().getFullYear();
  if (kind === 'sup-en') return `Subject: Prospective PhD student: ${x.title}

Dear Dr [Surname],

My name is ${name}. I am an anthropologist working with Sokola Institute in Indonesia, and I recently completed the Master of Anthropology and Planetary Futures at the Australian National University.

I am writing because your work on [topic, e.g. indigenous education / sound and listening / multispecies worlds], especially "[title]" (${yr - 1}), speaks directly to the project I hope to develop: [one or two sentences on your research question, e.g. how Orang Rimba children learn through listening to the forest].

My background includes long-term work with Orang Rimba communities in Bukit Duabelas (Jambi), women's groups in Semarang and Sumba, and research assistance on a University of Amsterdam doctoral project on Orang Rimba education. I also work with multimodal methods (film, photography, sound).

Would you be open to supervising a PhD on this topic, and are there funding routes you would recommend (I am an Indonesian citizen)? I have attached my CV and a one-page research summary, and I would be glad to talk at a time that suits you.

With warm regards,
${name}`;
  if (kind === 'sup-id') return `Perihal: Calon mahasiswa doktor — ${x.title}

Yth. Bapak/Ibu [Nama],

Perkenalkan, saya ${name}, antropolog yang bekerja di Sokola Institute dan baru menyelesaikan Master of Anthropology and Planetary Futures di Australian National University.

Saya menulis karena kajian Bapak/Ibu tentang [topik], terutama "[judul]" (${yr - 1}), sangat dekat dengan rencana riset saya: [1–2 kalimat pertanyaan riset].

Pengalaman saya meliputi kerja panjang bersama Orang Rimba di Bukit Duabelas (Jambi), kelompok perempuan di Semarang dan Sumba, serta menjadi asisten riset proyek doktoral University of Amsterdam tentang pendidikan Orang Rimba. Saya juga memakai metode multimodal (film, foto, bunyi).

Apakah Bapak/Ibu bersedia menjadi pembimbing untuk topik ini, dan adakah jalur pendanaan yang Bapak/Ibu sarankan? Saya lampirkan CV dan ringkasan riset satu halaman. Saya senang sekali bila bisa berbincang di waktu yang Bapak/Ibu tentukan.

Hormat saya,
${name}`;
  if (kind === 'followup') return `Subject: Re: ${x.title}

Dear Dr [Surname],

I hope you are well. I am following up on my email of [date] about ${x.title}. I remain very keen, and I would be happy to send anything that helps, such as a short proposal or a writing sample.

Thank you for your time,
${name}`;
  if (kind === 'statement') return `KERANGKA RESEARCH STATEMENT (1–2 halaman) — ${x.title}

1. Pertanyaan riset (2–3 kalimat): apa yang ingin kamu pahami, dan kenapa sekarang.
2. Konteks & celah: perdebatan yang kamu masuki (mis. pendidikan adat, regenerative listening, pluriverse) dan apa yang belum terjawab.
3. Lapangan & relasi: komunitas/tempat (mis. Orang Rimba, Kampung Sodan), relasimu yang sudah ada, dan bagaimana persetujuan & etika dijaga.
4. Metode: etnografi jangka panjang, metode multimodal (film, foto, bunyi), metode partisipatif.
5. Kontribusi: untuk antropologi, untuk komunitas, untuk kebijakan/pendidikan di Indonesia.
6. Kenapa di sini & dengan supervisor ini: 2–3 kalimat yang spesifik.
7. Rencana waktu kasar (tahun 1–4) dan keluaran.

(Tulis dalam bahasa Inggris bila lamarannya berbahasa Inggris.)`;
  if (kind === 'concept-id') return `KERANGKA CONCEPT NOTE (1–2 halaman) — ${x.title}

Judul kegiatan:
Pengusul: [Sokola Institute / nama pribadi] — kontak penanggung jawab
1. Latar belakang & masalah (1 paragraf, dengan data atau cerita lapangan).
2. Tujuan (2–3 butir yang bisa diukur).
3. Siapa yang terlibat & mendapat manfaat (komunitas, perempuan, anak, guru).
4. Kegiatan utama & waktu (tabel singkat).
5. Hasil yang diharapkan (keluaran & perubahan).
6. Kenapa kami: rekam jejak Sokola / pengalamanmu, mitra.
7. Anggaran ringkas (total dan pos utama) + dana lain/pendamping bila ada.
8. Keberlanjutan & etika (persetujuan komunitas, kepemilikan data, pembagian manfaat).`;
  if (kind === 'concept-en') return `CONCEPT NOTE OUTLINE (1–2 pages) — ${x.title}

Title:
Applicant: [Sokola Institute / your name] — lead contact
1. Background and problem (one paragraph, grounded in field evidence).
2. Objectives (2–3 measurable points).
3. Participants and beneficiaries (communities, women's groups, children, teachers).
4. Main activities and timeline (short table).
5. Expected results (outputs and change).
6. Why us: Sokola's track record / your experience, partners.
7. Summary budget (total and main lines) + co-funding if any.
8. Sustainability and ethics (community consent, data ownership, benefit sharing).`;
  return `Aku sedang melamar "${x.title}"${x.org ? ` dari ${x.org}` : ''}.
Laman: ${x.link || '[tempel teks pengumuman di sini]'}

Ini CV-ku:
[tempel CV]

Tolong (1) daftar 5 syarat terpenting di pengumuman itu, (2) tunjukkan baris CV-ku yang membuktikan tiap syarat dan di mana kekurangannya, (3) tulis ulang ringkasan CV dan 6 poin teratas dengan bahasa pengumuman itu tanpa mengarang apa pun, (4) sarankan satu pertanyaan untuk wawancara.`;
}

/* ---------------- Cari cepat ---------------- */
const g = q => `https://www.google.com/search?q=${enc(q)}`;
const SITES = [
  { kind: 'phd', name: 'FindAPhD — antropologi', note: 'Saring "International" di hasilnya.', url: q => `https://www.findaphd.com/phds/?Keywords=${enc('anthropology ' + q)}` },
  { kind: 'phd', name: 'EURAXESS', note: 'Posisi riset & PhD di Eropa, sering bergaji.', url: q => `https://euraxess.ec.europa.eu/jobs/search?keywords=${enc(q)}` },
  { kind: 'phd', name: 'AcademicTransfer (Belanda)', note: 'Lowongan PhD bergaji di kampus Belanda.', url: q => `https://www.academictransfer.com/en/jobs/?q=${enc(q)}` },
  { kind: 'phd', name: 'ANU — beasiswa', note: 'Daftar beasiswa riset ANU.', url: () => 'https://www.anu.edu.au/study/scholarships' },
  { kind: 'phd', name: 'LPDP', note: 'Info pendaftaran dan buku panduan terbaru.', url: () => 'https://lpdp.kemenkeu.go.id/' },
  { kind: 'phd', name: 'Google Scholar — calon supervisor', note: 'Siapa yang menulis tentang temamu 3 tahun terakhir.', url: q => `https://scholar.google.com/scholar?q=${enc(q)}&as_ylo=${new Date().getFullYear() - 3}` },
  { kind: 'grant', name: 'Wenner-Gren Foundation', note: 'Hibah & fellowship khusus antropologi.', url: () => 'https://wennergren.org/' },
  { kind: 'grant', name: 'H-Net Job Guide', note: 'Lowongan & fellowship humaniora/ilmu sosial.', url: () => 'https://www.h-net.org/jobs/' },
  { kind: 'grant', name: 'EASA', note: 'Asosiasi antropolog Eropa: jobs & calls.', url: () => 'https://easaonline.org/' },
  { kind: 'grant', name: 'AAA Career Center', note: 'Asosiasi antropologi Amerika.', url: () => 'https://careers.americananthro.org/' },
  { kind: 'grant', name: 'FundsforNGOs — Indonesia', note: 'Hibah untuk lembaga; cocok untuk jalur Sokola.', url: () => 'https://www2.fundsforngos.org/tag/indonesia/' },
  { kind: 'google', name: 'Google: PhD berdana', note: 'Funded PhD + kata kuncimu.', url: q => g(`"funded PhD" anthropology ${q}`) },
  { kind: 'google', name: 'Google: fellowship', note: 'Fellowship terbuka internasional.', url: q => g(`fellowship ${q} "international applicants" ${new Date().getFullYear() + 1}`) },
  { kind: 'google', name: 'Google: hibah Indonesia', note: 'Hibah untuk lembaga/komunitas.', url: q => g(`hibah ${q} lembaga komunitas ${new Date().getFullYear() + 1}`) },
  { kind: 'google', name: 'Google: call for applications', note: 'Grant Asia Tenggara.', url: q => g(`"call for applications" grant ${q} "Southeast Asia"`) },
];
function search(el) {
  const kws = keywordsAll(); const mine = customWords();
  const presets = [...new Set([...mine, 'masyarakat adat', 'indigenous', 'soundscape', 'decolonial', 'multimodal ethnography', 'indigenous education', 'gender', ...kws])].slice(0, 18);
  let q = presets[0] || 'indigenous';
  const draw = () => {
    $('#links', el).innerHTML = [['phd', '🎓 PhD & beasiswa'], ['grant', '🌱 Hibah & fellowship'], ['google', '🔎 Pencarian Google dari kata kuncimu']].map(([kind, label]) => `
      <h3 style="margin:18px 0 8px">${label}</h3>
      <div class="linkgrid">${SITES.filter(s => s.kind === kind).map(s => `<a class="linkcard" href="${esc(s.url(q))}" target="_blank" rel="noopener"><b>${esc(s.name)} ↗</b><small class="muted">${esc(s.note)}</small></a>`).join('')}</div>`).join('');
  };
  el.innerHTML = `
    <div class="card">
      <p style="margin-top:0">Pilih atau ketik kata kunci. Tiap ubin membuka pencarian di situs itu yang sudah terisi. Kata yang kamu tambahkan sendiri ditandai ✍.</p>
      <div class="rd-filters" id="presets">${presets.map((p, i) => `<button class="chip ${i === 0 ? 'on' : ''}" data-q="${esc(p)}">${mine.includes(p) ? '✍ ' : ''}${esc(p)}</button>`).join('')}</div>
      <label class="f" for="sq">Kata pencarian</label><input type="text" id="sq" value="${esc(q)}">
      <div id="links"></div>
    </div>
    <div class="spacer"></div>
    <div class="card dew"><h3>Pasang notifikasi sekali, lalu biarkan datang sendiri</h3>
      <ol class="steps">
        <li>FindAPhD: cari → <b>Email me PhDs like these</b>.</li>
        <li>AcademicTransfer & EURAXESS: buat akun, simpan pencarian "anthropology" sebagai alert.</li>
        <li>Langganan buletin Wenner-Gren, EASA dan milis antropologi Asia Tenggara.</li>
        <li>Buat filter Gmail yang memberi label "Peluang" supaya kotak masuk tidak banjir, dan buka hanya saat Ringkas 5 menit.</li>
      </ol></div>`;
  $$('#presets .chip', el).forEach(b => b.onclick = () => { $$('#presets .chip', el).forEach(x => x.classList.remove('on')); b.classList.add('on'); q = b.dataset.q; $('#sq', el).value = q; draw(); });
  $('#sq', el).oninput = e => { q = e.target.value; draw(); };
  draw();
}

/* ---------------- Tambah sendiri ---------------- */
function addOppModal(onDone, toTracker) {
  modal(`<div class="row between"><h2 style="margin:0">Tambah peluang</h2><button class="btn sm ghost" data-close>Tutup</button></div>
  <label class="f" for="aT">Judul</label><input type="text" id="aT" placeholder="mis. PhD in Anthropology, Leiden">
  <label class="f" for="aO">Lembaga</label><input type="text" id="aO">
  <label class="f" for="aL">Tautan</label><input type="url" id="aL" placeholder="https://">
  <div class="grid g2"><div><label class="f" for="aY">Jenis</label><select id="aY"><option value="phd">PhD</option><option value="grant">Hibah</option><option value="fellowship">Fellowship</option><option value="course">Kursus</option></select></div>
  <div><label class="f" for="aD">Tenggat</label><input type="date" id="aD"></div></div>
  <label class="f" for="aA">Siapa yang mengajukan</label><select id="aA"><option value="">Belum tahu</option><option value="individu">Pribadi</option><option value="lembaga">Sebagai Sokola</option><option value="keduanya">Dua-duanya bisa</option></select>
  <label class="f" for="aS">Catatan / tempel deskripsinya (boleh kosong, dipakai untuk menilai)</label><textarea id="aS" rows="3"></textarea>
  <div class="spacer"></div><button class="btn" id="aGo">Tambah</button>`, (m, close) => {
    $('#aGo', m).onclick = () => {
      const o = { id: 'u' + uid(), title: $('#aT', m).value.trim(), org: $('#aO', m).value.trim(), link: $('#aL', m).value.trim(), type: $('#aY', m).value, deadline: $('#aD', m).value || null, applicant: $('#aA', m).value || null, summary: $('#aS', m).value, source: 'Ditambahkan olehmu', first_seen: today() };
      if (!o.title) return toast('Beri judul dulu');
      S().customOpps.push(o); save(); cache = null;
      if (toTracker) trackOpp(applyAnalysis({ ...o }));
      close(); onDone(); toast('Ditambahkan');
    };
  });
}
