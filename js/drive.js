// Klien Google Drive. Bicara dengan Apps Script (apps-script/Code.gs, API v3).
import { S, replaceState, toast, modal } from './util.js';
import * as U from './util.js';
import { DIR_MAP } from './folders.js';
import { CFG } from './config.js';

const CFG_KEY = 'fromodyssey.drive';

/* ---- peta folder (semua di bawah folder utama Drive) ---- */
export const DIR = { ...DIR_MAP, cache: '99 Sistem/cache-peluang' };
export const FILE_INDEX = DIR.sys + '/files-index.json';
export const STATE_FILE = DIR.sys + '/progress.json';
export const KEYWORDS_FILE = DIR.sys + '/kata-kunci.json';

/* ---- pengaturan sambungan (hanya di browser ini, tidak pernah masuk repo GitHub) ---- */
export const driveCfg = () => { try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); } catch (_) { return null; } };
export const setDriveCfg = c => { if (c) localStorage.setItem(CFG_KEY, JSON.stringify(c)); else localStorage.removeItem(CFG_KEY); };
export const driveUrl = () => { const c = driveCfg(); return (c && c.url) || (CFG && CFG.DRIVE_URL) || ''; };
export const sessionValid = c => !!(c && c.session && Number(c.exp) > Date.now());
export const connected = () => { const c = driveCfg(); return !!(driveUrl() && c && (sessionValid(c) || c.key)); };
export function clearSession() {
  const c = driveCfg(); if (!c) return;
  const next = { ...c, session: '', email: '', exp: 0 };
  if (!next.key && !next.url) setDriveCfg(null); else setDriveCfg(next);
}

export async function call(action, payload = {}) {
  const c = driveCfg() || {};
  const url = driveUrl();
  if (!url) throw new Error('Drive belum disiapkan di aplikasi ini.');
  const auth = sessionValid(c) ? { session: c.session } : c.key ? { key: c.key } : {};
  if (!auth.session && !auth.key && action !== 'login') throw new Error('Kamu belum masuk. Masuk dengan Google dulu di halaman Aku.');
  let r;
  try {
    // Sengaja tanpa header khusus: tetap "simple request", jadi browser tidak perlu pre-flight CORS.
    r = await fetch(url, { method: 'POST', body: JSON.stringify({ ...auth, action, ...payload }) });
  } catch (e) { throw new Error('Tidak bisa menjangkau skrip Drive (offline, atau alamatnya keliru).'); }
  let j;
  try { j = await r.json(); } catch (_) { throw new Error('Skrip Drive menjawab dengan sesuatu yang tak terduga. Cek alamat Web app dan pastikan aksesnya "Anyone".'); }
  if (!j.ok) {
    if (j.auth || /sesi (tidak valid|sudah habis)|invalid session|session expired|expired session/i.test(j.error || '')) {
      if (auth.session) { clearSession(); try { window.dispatchEvent(new Event('fromodyssey:signedout')); } catch (_) {} }
    }
    const err = new Error(j.error || 'Kesalahan Drive'); err.notFound = !!j.notFound; err.tooBig = !!j.tooBig; err.url = j.url; err.auth = !!j.auth; throw err;
  }
  return j;
}

export const ping = () => call('ping');
export const list = path => call('list', { path: path || '' }).then(j => j.files);
export const tree = () => call('tree');
export const mkdir = path => call('mkdir', { path }).then(j => j.folder);
export const putText = (path, text, mime = 'text/plain') => call('put', { path, text, mime }).then(j => j.file);
export const getText = async path => { try { return (await call('get', { path })).text; } catch (e) { if (e.notFound) return null; throw e; } };
export const del = path => call('del', { path });
export const delById = id => call('del', { id });
export const move = (from, to) => call('move', { from, to }).then(j => j.file);
export const moveById = (id, toPath, opts = {}) => call('move', { id, to: toPath, ...opts }).then(j => j.file || j.folder);
export const fetchPage = url => call('fetch', { url });

export function blobToB64(blob) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onload = () => res(String(fr.result).split(',')[1] || '');
    fr.onerror = () => rej(fr.error);
    fr.readAsDataURL(blob);
  });
}
export function b64ToBlob(b64, mime) {
  const bin = atob(b64); const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: mime || 'application/octet-stream' });
}
export async function putFile(path, blob, mime) {
  return call('put', { path, b64: await blobToB64(blob), mime: mime || blob.type || 'application/octet-stream' }).then(j => j.file);
}
export async function getBlob(path, mime) {
  const j = await call('get', { path, as: 'b64' });
  return b64ToBlob(j.b64, mime || j.mime);
}
/** Ambil berkas lewat id. as='b64' -> Blob; selain itu teks (null kalau tak ada). */
export async function getById(id, as) {
  try {
    const j = await call('get', as === 'b64' ? { id, as: 'b64' } : { id });
    return as === 'b64' ? b64ToBlob(j.b64, j.mime) : j.text;
  } catch (e) { if (e.notFound && as !== 'b64') return null; throw e; }
}

const SMALL = 6 * 1024 * 1024, CHUNK = 4 * 1024 * 1024; // CHUNK kelipatan 256 KB
/** Unggah berkas besar per potongan 4 MB (di bawah 6 MB pakai put biasa). Mengembalikan info berkas Drive. */
export async function uploadLarge(path, blob, onProgress = () => {}) {
  const mime = blob.type || 'application/octet-stream';
  if (blob.size < SMALL) { onProgress(0, blob.size); const f = await putFile(path, blob, mime); onProgress(blob.size, blob.size); return f; }
  const { uploadId } = await call('upStart', { path, mime, size: blob.size });
  let offset = 0, fails = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + CHUNK, blob.size);
    const b64 = await blobToB64(blob.slice(offset, end));
    let j;
    try { j = await call('upChunk', { uploadId, offset, b64, last: end >= blob.size }); }
    catch (e) { if (e.auth || ++fails > 3) throw e; await new Promise(r => setTimeout(r, 800 * fails)); continue; }
    fails = 0;
    if (j.done) { onProgress(blob.size, blob.size); return j.file; }
    offset = Number.isFinite(j.received) && j.received > 0 ? j.received : end;
    onProgress(Math.min(offset, blob.size), blob.size);
  }
  throw new Error('Unggahan selesai tetapi Drive belum mengonfirmasi berkasnya.');
}

/* ---- aset (gambar) disimpan di cache supaya muncul juga saat offline ---- */
const ASSET_CACHE = 'fromodyssey-assets';
export async function getAsset(name) {
  const key = '/__fromodyssey_asset/' + encodeURIComponent(name);
  let cache = null;
  try { cache = await caches.open(ASSET_CACHE); const hit = await cache.match(key); if (hit) return URL.createObjectURL(await hit.blob()); } catch (_) {}
  const j = await call('asset', { name });
  const blob = b64ToBlob(j.b64, j.mime);
  try { if (cache) await cache.put(key, new Response(blob, { headers: { 'Content-Type': blob.type } })); } catch (_) {}
  return URL.createObjectURL(blob);
}

/* ---- JSON ---- */
export async function getJSONFile(path, fallback = null) {
  const t = await getText(path); if (t == null) return fallback;
  try { return JSON.parse(t); } catch (_) { return fallback; }
}
export const putJSONFile = (path, obj) => putText(path, JSON.stringify(obj), 'application/json');

/* ---- kata kunci untuk "scout" mingguan ---- */
export function currentKeywords() {
  if (typeof U.allKeywords === 'function') return U.allKeywords();
  const st = S(); const out = new Set();
  [...(st.profile && st.profile.keywords || []), ...((st.customKeywords || []).map(k => k && k.w))].forEach(w => { const x = String(w || '').trim().toLowerCase(); if (x) out.add(x); });
  return [...out];
}
export async function pushKeywords() {
  if (!connected()) return;
  try { await putJSONFile(KEYWORDS_FILE, { updated: new Date().toISOString(), keywords: currentKeywords() }); } catch (_) {}
}

/* ---- sinkron progres (HP dan laptop sama) ---- */
let pushTimer = null, syncing = false, lastPushed = 0;
export function autoSyncOn() { const c = driveCfg(); return !!(connected() && c.sync !== false); }

export async function pushState(manual) {
  if (!connected()) return;
  syncing = true;
  try {
    const st = S();
    await putJSONFile(STATE_FILE, { app: 'fromodyssey', updatedAt: st.updatedAt || Date.now(), state: st });
    pushKeywords();
    lastPushed = Date.now();
    if (manual) toast('Progres tersimpan di Drive-mu');
  } catch (e) { if (manual) toast(e.message); }
  finally { syncing = false; }
}
export async function pullState() {
  const j = await getJSONFile(STATE_FILE, null);
  if (!j || !j.state) return null;
  return j;
}
window.addEventListener('fromodyssey:saved', () => {
  if (!autoSyncOn() || syncing) return;
  clearTimeout(pushTimer); pushTimer = setTimeout(() => pushState(false), 9000);
});

/** Saat aplikasi dibuka: kalau Drive menyimpan progres yang lebih baru, tawarkan memuatnya. */
export async function initSync() {
  if (!autoSyncOn()) return;
  try {
    const remote = await pullState();
    const mine = S().updatedAt || 0;
    if (!remote) { if (mine) pushState(false); return; }
    if (remote.updatedAt > mine + 2000) {
      modal(`<h2>Ada progres yang lebih baru di Drive</h2>
        <p class="muted">Drive-mu menyimpan progres dari ${new Date(remote.updatedAt).toLocaleString('id-ID')} (mungkin dari perangkat lain, misalnya HP).</p>
        <div class="row"><button class="btn" id="dLoad">Pakai di perangkat ini</button><button class="btn ghost" data-close>Tetap pakai yang di sini</button></div>`, (m, close) => {
        m.querySelector('#dLoad').onclick = () => { replaceState(remote.state); close(); toast('Progres dimuat dari Drive'); location.reload(); };
      });
    } else if (mine > remote.updatedAt + 2000) pushState(false);
  } catch (e) { /* offline atau belum terjangkau: diam saja */ }
}

/* ---- indeks berkas (apa disimpan di mana), kunci = id berkas Drive ---- */
let indexMem = null;
export async function loadIndex(force) {
  if (indexMem && !force) return indexMem;
  indexMem = (await getJSONFile(FILE_INDEX, { files: [] })) || { files: [] };
  if (!Array.isArray(indexMem.files)) indexMem.files = [];
  return indexMem;
}
export async function saveIndex(idx) { indexMem = idx; await putJSONFile(FILE_INDEX, idx); }

export const safeName = s => String(s || 'tanpa judul').replace(/[\\/<>:"|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 90) || 'tanpa judul';
