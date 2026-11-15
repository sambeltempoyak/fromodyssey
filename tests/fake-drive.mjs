// Tiruan dalam-memori dari server Drive API v3 (apps-script/Code.gs). Untuk tes Node dan tes browser.
//   import { handle } from './fake-drive.mjs'      -> handle(reqObj) => responseObj
//   node tests/fake-drive.mjs 8787                  -> server HTTP: POST JSON, CORS longgar
// Login: idToken 'test' diterima. Kunci (passcode) 'test' diterima.
import http from 'node:http';
import { fileURLToPath } from 'node:url';

const ROOT = 'ROOT0000000000';
const SYS_NAME = '99 Sistem';
let seq = 1;
const nid = () => 'FAKE' + String(seq++).padStart(10, '0');
const nodes = new Map();
nodes.set(ROOT, { id: ROOT, name: 'Fromodyssey (tiruan)', parent: null, folder: true });
const uploads = new Map();
export const EMAIL = 'tester@example.com';

const segsOf = p => String(p || '').split('/').map(s => s.replace(/[\\<>:"|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim()).filter(s => s && s !== '.' && s !== '..');
const kids = (pid, folder) => [...nodes.values()].filter(n => n.parent === pid && !n.trashed && !!n.folder === folder);
let sysId = '';
function sys() {
  if (sysId && nodes.has(sysId) && !nodes.get(sysId).trashed) return nodes.get(sysId);
  let f = kids(ROOT, true).find(n => n.name === SYS_NAME);
  if (!f) { f = { id: nid(), name: SYS_NAME, parent: ROOT, folder: true }; nodes.set(f.id, f); }
  sysId = f.id; return f;
}
function folderAt(segs, create) {
  let cur, i = 0;
  if (segs[0] === SYS_NAME) { cur = sys(); i = 1; } else cur = nodes.get(ROOT);
  for (; i < segs.length; i++) {
    let nx = kids(cur.id, true).find(n => n.name === segs[i]);
    if (!nx) { if (!create) return null; nx = { id: nid(), name: segs[i], parent: cur.id, folder: true }; nodes.set(nx.id, nx); }
    cur = nx;
  }
  return cur;
}
function fileAt(path) {
  const s = segsOf(path); const name = s.pop(); if (!name) return null;
  const f = folderAt(s, false); if (!f) return null;
  return kids(f.id, false).find(n => n.name === name) || null;
}
function pathOf(n) { const out = []; let c = n; while (c && c.id !== ROOT) { out.unshift(c.name); c = nodes.get(c.parent); } return out.join('/'); }
function inRoot(n) { let c = n; for (let i = 0; i < 60 && c; i++) { if (c.id === ROOT) return true; c = nodes.get(c.parent); } return false; }
const isProt = n => n.id === ROOT || n.id === sysId;
const pub = n => n.folder ? { id: n.id, name: n.name, parent: n.parent === ROOT ? '' : n.parent, path: pathOf(n) }
  : { id: n.id, name: n.name, parent: n.parent === ROOT ? '' : n.parent, path: pathOf(n), mime: n.mime, size: n.bytes.length, updated: new Date(n.updated).toISOString(), url: 'https://drive.fake/' + n.id };
const fail = (error, extra) => ({ ok: false, error, ...(extra || {}) });
function createFile(folder, name, bytes, mime) {
  for (const o of kids(folder.id, false)) if (o.name === name) o.trashed = true;
  const n = { id: nid(), name, parent: folder.id, folder: false, mime: mime || 'application/octet-stream', bytes, updated: Date.now() };
  nodes.set(n.id, n); return n;
}
function target(req, idKey, pathKey) {
  if (req[idKey]) { const n = nodes.get(req[idKey]); if (!n || n.trashed) return null; if (!inRoot(n)) throw new Error('Berkas ini di luar folder Fromodyssey'); return n; }
  const s = segsOf(req[pathKey]); if (!s.length) return null;
  return fileAt(req[pathKey]) || folderAt(s, false);
}
function authOK(req) {
  if (req.session) { const m = /^fake\.(\d+)$/.exec(req.session); if (m && Number(m[1]) > Date.now()) return EMAIL; }
  if (req.key === 'test') return 'passcode';
  return '';
}

export function handle(req) {
  try {
    if (req.action === 'login') {
      if (req.idToken === 'test') { const exp = Date.now() + 30 * 86400000; return { ok: true, session: 'fake.' + exp, email: EMAIL, name: 'Tester', exp }; }
      return fail('Token Google ditolak');
    }
    if (!authOK(req)) return fail('Sesi tidak valid atau sudah habis. Silakan masuk lagi.', { auth: true });
    switch (req.action) {
      case 'ping': return { ok: true, version: 3, root: nodes.get(ROOT).name, email: EMAIL };
      case 'tree': {
        sys();
        const folders = [], files = [];
        const walk = id => { for (const f of kids(id, true)) { folders.push(pub(f)); walk(f.id); } for (const f of kids(id, false)) files.push(pub(f)); };
        walk(ROOT);
        return { ok: true, folders, files, truncated: false, sysId };
      }
      case 'list': {
        const s = segsOf(req.path); const base = folderAt(s, false); if (!base) return { ok: true, files: [] };
        const res = []; const walk = id => { for (const f of kids(id, false)) res.push(pub(f)); for (const d of kids(id, true)) walk(d.id); };
        walk(base.id); return { ok: true, files: res };
      }
      case 'put': {
        const s = segsOf(req.path); if (!s.length) return fail('Path kosong');
        const name = s.pop(); const folder = folderAt(s, true);
        const bytes = req.b64 != null ? Buffer.from(req.b64, 'base64') : Buffer.from(req.text == null ? '' : String(req.text), 'utf8');
        return { ok: true, file: pub(createFile(folder, name, bytes, req.mime || 'text/plain')) };
      }
      case 'get': {
        const n = req.id ? target(req, 'id') : fileAt(req.path);
        if (!n || n.trashed) return fail('Tidak ditemukan', { notFound: true });
        if (n.folder) return fail('Ini folder, bukan berkas');
        if (req.as === 'b64') {
          if (n.bytes.length > 25 * 1024 * 1024) return fail('Berkas terlalu besar', { tooBig: true, url: 'https://drive.fake/' + n.id });
          return { ok: true, b64: n.bytes.toString('base64'), mime: n.mime, name: n.name, id: n.id };
        }
        return { ok: true, text: n.bytes.toString('utf8'), updated: new Date(n.updated).toISOString(), url: 'https://drive.fake/' + n.id, id: n.id, name: n.name };
      }
      case 'del': {
        const n = target(req, 'id', 'path'); if (!n) return { ok: true, deleted: 0 };
        if (isProt(n)) return fail('Folder utama dan folder sistem tidak boleh dihapus');
        n.trashed = true; return { ok: true, deleted: 1 };
      }
      case 'move': {
        const n = target(req, 'id', 'from'); if (!n) return fail('Sumber tidak ditemukan', { notFound: true });
        if (isProt(n)) return fail('Folder utama dan folder sistem tidak boleh dipindah atau diganti namanya');
        const s = segsOf(req.to); const name = s.pop(); if (!name) return fail('Tujuan kosong');
        const dest = folderAt(s, true);
        if (n.folder) {
          for (let c = dest; c; c = nodes.get(c.parent)) if (c.id === n.id) return fail('Folder tidak bisa dipindah ke dalam dirinya sendiri');
          if (kids(dest.id, true).some(f => f.name === name && f.id !== n.id)) return fail(`Sudah ada folder bernama "${name}" di tujuan`);
          n.parent = dest.id; n.name = name; return { ok: true, folder: pub(n) };
        }
        for (const o of kids(dest.id, false)) if (o.name === name && o.id !== n.id) { if (req.overwrite) o.trashed = true; else return fail(`Sudah ada berkas bernama "${name}" di tujuan`); }
        n.parent = dest.id; n.name = name; n.updated = Date.now(); return { ok: true, file: pub(n) };
      }
      case 'mkdir': { const s = segsOf(req.path); if (!s.length) return fail('Path kosong'); return { ok: true, folder: pub(folderAt(s, true)) }; }
      case 'fetch': return { ok: true, status: 200, contentType: 'text/html', text: '<html><body>halaman tiruan ' + String(req.url).slice(0, 80) + '</body></html>' };
      case 'upStart': {
        const s = segsOf(req.path); if (!s.length) return fail('Path kosong');
        const size = Number(req.size); if (!(size > 0)) return fail('Ukuran berkas tidak valid');
        const name = s.pop(); const folder = folderAt(s, true);
        const uploadId = 'UP' + nid(); uploads.set(uploadId, { name, folder: folder.id, size, mime: req.mime, chunks: [], got: 0 });
        return { ok: true, uploadId };
      }
      case 'upChunk': {
        const u = uploads.get(req.uploadId); if (!u) return fail('Sesi unggahan sudah habis. Mulai lagi.');
        const buf = Buffer.from(req.b64 || '', 'base64'); if (!buf.length) return fail('Potongan kosong');
        if (Number(req.offset) !== u.got) return { ok: true, received: u.got };
        u.chunks.push(buf); u.got += buf.length;
        if (u.got >= u.size) { uploads.delete(req.uploadId); return { ok: true, done: true, received: u.size, file: pub(createFile(nodes.get(u.folder), u.name, Buffer.concat(u.chunks), u.mime)) }; }
        if (req.last) return fail('Unggahan belum lengkap', { received: u.got });
        return { ok: true, received: u.got };
      }
      case 'asset': {
        const n = fileAt(SYS_NAME + '/aset/' + segsOf(req.name).join('/')) || fileAt(req.name);
        if (!n) return fail('Aset tidak ditemukan', { notFound: true });
        return { ok: true, b64: n.bytes.toString('base64'), mime: n.mime };
      }
      default: return fail('Aksi tidak dikenal: ' + req.action);
    }
  } catch (e) { return fail(String(e && e.message || e)); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 8787;
  http.createServer((rq, rs) => {
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS', 'Access-Control-Allow-Headers': '*' };
    if (rq.method === 'OPTIONS') { rs.writeHead(204, cors); return rs.end(); }
    let body = ''; rq.on('data', c => { body += c; if (body.length > 80e6) rq.destroy(); });
    rq.on('end', () => {
      let out; try { out = handle(JSON.parse(body || '{}')); } catch (e) { out = fail('Isi permintaan tidak terbaca'); }
      rs.writeHead(200, { ...cors, 'Content-Type': 'application/json' }); rs.end(JSON.stringify(out));
    });
  }).listen(port, () => console.log('fake-drive di http://localhost:' + port));
}
