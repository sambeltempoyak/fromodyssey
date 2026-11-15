/**
 * Fromodyssey - server Google Drive (Google Apps Script), API v3
 * ---------------------------------------------------------------
 * Skrip kecil ini membiarkan aplikasi web Fromodyssey menyimpan dan membaca berkas di SATU folder Drive
 * (ROOT_ID di bawah). Ia berjalan di akun Google pemilik folder (Execute as: Me).
 *
 * ISI 4 KONSTANTA DI BAWAH (hanya ini yang perlu diubah):
 *   ROOT_ID        id folder Drive yang jadi "server" (kode panjang di akhir tautan folder)
 *   CLIENT_ID      OAuth Client ID (Web application) dari Google Cloud Console, untuk "Masuk dengan Google"
 *   ALLOWED_EMAILS daftar email yang boleh masuk (huruf kecil)
 *   PASSCODE       '' = login kode sandi dimatikan (disarankan). Isi frasa panjang kalau mau jalur cadangan.
 *
 * MANIFEST (appsscript.json): skrip ini butuh izin untuk Drive dan permintaan eksternal. Aktifkan
 * "Show appsscript.json" di Project Settings, lalu pastikan ada:
 *   "oauthScopes": ["https://www.googleapis.com/auth/drive",
 *                   "https://www.googleapis.com/auth/script.external_request"],
 *   "webapp": {"executeAs": "USER_DEPLOYING", "access": "ANYONE_ANONYMOUS"}
 * Jalankan authorizeOnce() sekali dari editor supaya Google meminta izin tersebut.
 *
 * Deploy > New deployment > Web app > Execute as: Me > Who has access: Anyone. Salin URL /exec.
 * Setelah mengubah file ini: Deploy > Manage deployments > pensil > Version: New version > Deploy.
 */
var ROOT_ID = 'PASTE-ROOT-FOLDER-ID-HERE';
var CLIENT_ID = 'PASTE-GOOGLE-OAUTH-CLIENT-ID.apps.googleusercontent.com';
var ALLOWED_EMAILS = ['paste-email@example.com'];
var PASSCODE = '';

var VERSION = 3;
var SYS_NAME = '99 Sistem';
var MAX_FETCH_CHARS = 700000;
var MAX_B64_BYTES = 25 * 1024 * 1024;
var TREE_CAP = 5000;
var SESSION_DAYS = 30;
var UP_TTL = 21600; // 6 jam

function doGet() { return out_({ ok: false, error: 'Gunakan POST.' }); }
function doPost(e) {
  var body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'Isi permintaan tidak terbaca' }); }
  return handle_(body);
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
function fail_(msg, extra) { var o = { ok: false, error: msg }; if (extra) for (var k in extra) o[k] = extra[k]; return o; }

function handle_(req) {
  try {
    if (!req || typeof req !== 'object') return out_(fail_('Permintaan tidak valid'));
    if (ROOT_ID === 'PASTE-ROOT-FOLDER-ID-HERE' || !ROOT_ID) return out_(fail_('ROOT_ID di Code.gs belum diisi'));
    var action = String(req.action || '');
    if (action === 'login') return out_(login_(req));
    var who = auth_(req);
    if (!who) return out_(fail_('Sesi tidak valid atau sudah habis. Silakan masuk lagi.', { auth: true }));
    switch (action) {
      case 'ping': return out_({ ok: true, version: VERSION, root: DriveApp.getFolderById(ROOT_ID).getName(), email: who });
      case 'tree': return out_(tree_());
      case 'list': return out_({ ok: true, files: list_(req.path || '') });
      case 'put': return out_(put_(req));
      case 'get': return out_(get_(req));
      case 'del': return out_(del_(req));
      case 'move': return out_(move_(req));
      case 'mkdir': return out_(mkdir_(req));
      case 'fetch': return out_(fetch_(req.url));
      case 'upStart': return out_(upStart_(req));
      case 'upChunk': return out_(upChunk_(req));
      case 'asset': return out_(asset_(req));
      default: return out_(fail_('Aksi tidak dikenal: ' + action));
    }
  } catch (err) {
    return out_(fail_(String(err && err.message ? err.message : err)));
  }
}

/* ---------- auth ---------- */
function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SESSION_SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid() + Utilities.getUuid(); props.setProperty('SESSION_SECRET', s); }
  return s;
}
function b64u_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function strBytes_(s) { return Utilities.newBlob(s).getBytes(); }
function sign_(data) { return b64u_(Utilities.computeHmacSha256Signature(strBytes_(data), strBytes_(secret_()))); }
function safeEq_(a, b) {
  a = String(a); b = String(b);
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
function allowed_(email) {
  email = String(email || '').toLowerCase();
  for (var i = 0; i < ALLOWED_EMAILS.length; i++) if (String(ALLOWED_EMAILS[i]).toLowerCase() === email && email) return true;
  return false;
}
function makeSession_(email, exp) {
  var payload = b64u_(strBytes_(email + '|' + exp));
  return payload + '.' + sign_(payload);
}
/** Mengembalikan email bila sesi sah, selain itu ''. */
function checkSession_(session) {
  var parts = String(session || '').split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return '';
  if (!safeEq_(sign_(parts[0]), parts[1])) return '';
  var raw;
  try { raw = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[0] + '===='.slice(0, (4 - parts[0].length % 4) % 4))).getDataAsString(); } catch (e) { return ''; }
  var i = raw.lastIndexOf('|'); if (i < 1) return '';
  var email = raw.slice(0, i).toLowerCase(), exp = Number(raw.slice(i + 1));
  if (!(exp > Date.now())) return '';
  if (!allowed_(email)) return '';
  return email;
}
function auth_(req) {
  if (req.session) { var e = checkSession_(req.session); if (e) return e; }
  if (PASSCODE && req.key && safeEq_(req.key, PASSCODE)) return 'passcode';
  return '';
}
function login_(req) {
  if (req.key !== undefined && !req.idToken) {
    if (PASSCODE && safeEq_(req.key, PASSCODE)) return { ok: true, session: '', email: 'passcode', name: '', exp: 0, passcode: true };
    return fail_('Kode sandi salah atau tidak aktif');
  }
  var tok = String(req.idToken || '');
  if (!tok || tok.length > 4000) return fail_('Token Google tidak ada');
  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(tok), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return fail_('Token Google ditolak');
  var info = JSON.parse(res.getContentText());
  if (info.aud !== CLIENT_ID) return fail_('Token ini bukan untuk aplikasi ini (CLIENT_ID tidak cocok)');
  if (String(info.email_verified) !== 'true') return fail_('Email Google belum terverifikasi');
  var email = String(info.email || '').toLowerCase();
  if (!allowed_(email)) return fail_('Email ini belum diizinkan mengakses folder.');
  var exp = Date.now() + SESSION_DAYS * 86400000;
  return { ok: true, session: makeSession_(email, exp), email: email, name: info.name || '', exp: exp };
}

/* ---------- folder / path helpers ---------- */
function parts_(path) {
  return String(path || '').split('/').map(function (s) { return s.replace(/[\\<>:"|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim(); })
    .filter(function (s) { return s && s !== '.' && s !== '..'; });
}
function child_(folder, name, create) {
  var it = folder.getFoldersByName(name);
  if (it.hasNext()) return it.next();
  return create ? folder.createFolder(name) : null;
}
function sysId_() { return PropertiesService.getScriptProperties().getProperty('SYS_ID') || ''; }
/** Folder sistem dicari lewat id yang disimpan; dibuat kalau belum ada. */
function sysFolder_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SYS_ID');
  if (id) {
    try { var f = DriveApp.getFolderById(id); if (!f.isTrashed() && inRoot_(f)) return f; } catch (e) { /* dibuat ulang */ }
  }
  var root = DriveApp.getFolderById(ROOT_ID);
  var found = child_(root, SYS_NAME, true);
  props.setProperty('SYS_ID', found.getId());
  return found;
}
function folderAt_(segs, create) {
  var f, start = 0;
  if (segs.length && segs[0] === SYS_NAME) { f = sysFolder_(); start = 1; }
  else f = DriveApp.getFolderById(ROOT_ID);
  for (var i = start; i < segs.length; i++) {
    f = child_(f, segs[i], create);
    if (!f) return null;
  }
  return f;
}
function fileAt_(path) {
  var segs = parts_(path); if (!segs.length) return null;
  var name = segs.pop(); var f = folderAt_(segs, false); if (!f) return null;
  var it = f.getFilesByName(name);
  return it.hasNext() ? it.next() : null;
}
/** Benar bila item ada di dalam ROOT (menelusuri induk). Root sendiri juga dianggap di dalam. */
function inRoot_(item) {
  var cur = item;
  for (var depth = 0; depth < 60; depth++) {
    if (cur.getId() === ROOT_ID) return true;
    var ps = cur.getParents();
    if (!ps.hasNext()) return false;
    cur = ps.next();
  }
  return false;
}
function isProtected_(item) { var id = item.getId(); return id === ROOT_ID || id === sysId_(); }
function getItem_(id) {
  id = String(id || ''); if (!/^[A-Za-z0-9_\-]{10,}$/.test(id)) throw new Error('Id tidak valid');
  var item, isFolder = false;
  try { item = DriveApp.getFileById(id); } catch (e) { try { item = DriveApp.getFolderById(id); isFolder = true; } catch (e2) { return null; } }
  if (!inRoot_(item)) throw new Error('Berkas ini di luar folder Fromodyssey');
  return { item: item, isFolder: isFolder };
}
function pathOf_(item) {
  var names = [], cur = item;
  for (var d = 0; d < 60; d++) {
    if (cur.getId() === ROOT_ID) break;
    names.unshift(cur.getName());
    var ps = cur.getParents(); if (!ps.hasNext()) break;
    cur = ps.next();
  }
  return names.join('/');
}
function parentId_(item) { var ps = item.getParents(); return ps.hasNext() ? ps.next().getId() : ''; }
function info_(file) {
  return { id: file.getId(), name: file.getName(), parent: parentId_(file), path: pathOf_(file), mime: file.getMimeType(),
           size: file.getSize(), updated: file.getLastUpdated().toISOString(), url: file.getUrl() };
}
function resolveTarget_(req, idKey, pathKey) {
  if (req[idKey]) { var r = getItem_(req[idKey]); return r; }
  var p = req[pathKey];
  var segs = parts_(p); if (!segs.length) return null;
  var file = fileAt_(p); if (file) return { item: file, isFolder: false };
  var folder = folderAt_(segs, false); if (folder) return { item: folder, isFolder: true };
  return null;
}

/* ---------- actions ---------- */
function tree_() {
  var root = DriveApp.getFolderById(ROOT_ID);
  var folders = [], files = [], count = 0;
  var queue = [{ f: root, path: '' }];
  while (queue.length && count < TREE_CAP) {
    var cur = queue.shift();
    var fid = cur.f.getId();
    var subs = cur.f.getFolders();
    while (subs.hasNext() && count < TREE_CAP) {
      var s = subs.next(); var sp = cur.path ? cur.path + '/' + s.getName() : s.getName();
      folders.push({ id: s.getId(), name: s.getName(), parent: fid === ROOT_ID ? '' : fid, path: sp });
      queue.push({ f: s, path: sp }); count++;
    }
    var it = cur.f.getFiles();
    while (it.hasNext() && count < TREE_CAP) {
      var fl = it.next();
      files.push({ id: fl.getId(), name: fl.getName(), parent: fid === ROOT_ID ? '' : fid, path: cur.path ? cur.path + '/' + fl.getName() : fl.getName(),
                   mime: fl.getMimeType(), size: fl.getSize(), updated: fl.getLastUpdated().toISOString(), url: fl.getUrl() });
      count++;
    }
  }
  return { ok: true, folders: folders, files: files, truncated: count >= TREE_CAP, sysId: sysId_() };
}

function list_(path) {
  var segs = parts_(path); var base = folderAt_(segs, false); var res = [];
  if (!base) return res;
  (function walk(folder, prefix) {
    var files = folder.getFiles();
    while (files.hasNext() && res.length < 3000) {
      var f = files.next(); res.push({ id: f.getId(), name: f.getName(), path: prefix + f.getName(), mime: f.getMimeType(), size: f.getSize(),
        updated: f.getLastUpdated().toISOString(), url: f.getUrl() });
    }
    var subs = folder.getFolders();
    while (subs.hasNext() && res.length < 3000) { var s = subs.next(); walk(s, prefix + s.getName() + '/'); }
  })(base, segs.length ? segs.join('/') + '/' : '');
  return res;
}

function trashSameName_(folder, name, exceptId) {
  var ex = folder.getFilesByName(name);
  while (ex.hasNext()) { var o = ex.next(); if (o.getId() !== exceptId) o.setTrashed(true); }
}

function put_(req) {
  var segs = parts_(req.path); if (!segs.length) return fail_('Path kosong');
  var name = segs.pop(); var folder = folderAt_(segs, true);
  trashSameName_(folder, name, '');
  var file;
  if (req.b64 != null) {
    var bytes = Utilities.base64Decode(req.b64);
    file = folder.createFile(Utilities.newBlob(bytes, req.mime || 'application/octet-stream', name));
  } else {
    file = folder.createFile(name, req.text == null ? '' : String(req.text), req.mime || MimeType.PLAIN_TEXT);
  }
  return { ok: true, file: info_(file) };
}

function get_(req) {
  var t;
  if (req.id) { t = getItem_(req.id); if (!t) return fail_('Tidak ditemukan', { notFound: true }); if (t.isFolder) return fail_('Ini folder, bukan berkas'); }
  else { var f = fileAt_(req.path); if (!f) return fail_('Tidak ditemukan', { notFound: true }); t = { item: f }; }
  var file = t.item;
  if (req.as === 'b64') {
    if (file.getSize() > MAX_B64_BYTES) return fail_('Berkas terlalu besar untuk dikirim (batas 25 MB). Buka langsung di Drive.', { tooBig: true, url: file.getUrl() });
    return { ok: true, b64: Utilities.base64Encode(file.getBlob().getBytes()), mime: file.getMimeType(), name: file.getName(), id: file.getId(), url: file.getUrl() };
  }
  return { ok: true, text: file.getBlob().getDataAsString('UTF-8'), updated: file.getLastUpdated().toISOString(), url: file.getUrl(), id: file.getId(), name: file.getName() };
}

function del_(req) {
  var t = resolveTarget_(req, 'id', 'path');
  if (!t) return { ok: true, deleted: 0 };
  if (isProtected_(t.item)) return fail_('Folder utama dan folder sistem tidak boleh dihapus');
  t.item.setTrashed(true);
  return { ok: true, deleted: 1 };
}

function move_(req) {
  var t = resolveTarget_(req, 'id', 'from');
  if (!t) return fail_('Sumber tidak ditemukan', { notFound: true });
  var item = t.item;
  if (isProtected_(item)) return fail_('Folder utama dan folder sistem tidak boleh dipindah atau diganti namanya');
  var segs = parts_(req.to); if (!segs.length) return fail_('Tujuan kosong');
  var name = segs.pop(); var dest = folderAt_(segs, true);
  if (t.isFolder) {
    // jangan memasukkan folder ke dalam dirinya sendiri atau turunannya
    var cur = dest;
    for (var d = 0; d < 60; d++) {
      if (cur.getId() === item.getId()) return fail_('Folder tidak bisa dipindah ke dalam dirinya sendiri');
      var ps = cur.getParents(); if (!ps.hasNext()) break; cur = ps.next();
    }
    var same = dest.getFoldersByName(name);
    while (same.hasNext()) { var sf = same.next(); if (sf.getId() !== item.getId()) return fail_('Sudah ada folder bernama "' + name + '" di tujuan'); }
    if (parentId_(item) !== dest.getId()) item.moveTo(dest);
    item.setName(name);
    return { ok: true, folder: { id: item.getId(), name: item.getName(), parent: dest.getId() === ROOT_ID ? '' : dest.getId(), path: pathOf_(item) } };
  }
  var clash = dest.getFilesByName(name);
  while (clash.hasNext()) {
    var c = clash.next();
    if (c.getId() !== item.getId()) { if (req.overwrite) c.setTrashed(true); else return fail_('Sudah ada berkas bernama "' + name + '" di tujuan'); }
  }
  if (parentId_(item) !== dest.getId()) item.moveTo(dest);
  item.setName(name);
  return { ok: true, file: info_(item) };
}

function mkdir_(req) {
  var segs = parts_(req.path); if (!segs.length) return fail_('Path kosong');
  var f = folderAt_(segs, true);
  return { ok: true, folder: { id: f.getId(), name: f.getName(), path: pathOf_(f) } };
}

function fetch_(url) {
  if (!/^https?:\/\//i.test(url || '')) return fail_('Hanya tautan http(s)');
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true, followRedirects: true,
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Fromodyssey/1.0; personal advert reader)', 'Accept-Language': 'en-GB,en;q=0.8,id;q=0.7' }
  });
  var h = res.getHeaders();
  var type = String(h['Content-Type'] || h['content-type'] || '');
  var text = /pdf|octet|image|zip/i.test(type) ? '' : res.getContentText();
  return { ok: true, status: res.getResponseCode(), contentType: type, text: text.slice(0, MAX_FETCH_CHARS) };
}

/* ---------- unggahan besar (resumable) ---------- */
function hdr_(res, name) {
  var h = res.getAllHeaders() || {}; var lname = name.toLowerCase();
  for (var k in h) if (String(k).toLowerCase() === lname) { var v = h[k]; return Array.isArray(v) ? v[0] : v; }
  return '';
}
function upStart_(req) {
  var segs = parts_(req.path); if (!segs.length) return fail_('Path kosong');
  var size = Number(req.size); if (!(size > 0)) return fail_('Ukuran berkas tidak valid');
  var name = segs.pop(); var folder = folderAt_(segs, true);
  var mime = req.mime || 'application/octet-stream';
  var res = UrlFetchApp.fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
    method: 'post', muteHttpExceptions: true, contentType: 'application/json; charset=UTF-8',
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'X-Upload-Content-Type': mime, 'X-Upload-Content-Length': String(size) },
    payload: JSON.stringify({ name: name, parents: [folder.getId()], mimeType: mime })
  });
  if (res.getResponseCode() !== 200) return fail_('Drive menolak memulai unggahan (' + res.getResponseCode() + ')');
  var url = hdr_(res, 'Location'); if (!url) return fail_('Drive tidak memberi alamat unggahan');
  var uploadId = Utilities.getUuid();
  CacheService.getScriptCache().put('up:' + uploadId, JSON.stringify({ url: url, size: size, name: name, folder: folder.getId() }), UP_TTL);
  return { ok: true, uploadId: uploadId };
}
function upChunk_(req) {
  var cache = CacheService.getScriptCache();
  var raw = cache.get('up:' + String(req.uploadId || ''));
  if (!raw) return fail_('Sesi unggahan sudah habis. Mulai lagi.');
  var s = JSON.parse(raw);
  var bytes = Utilities.base64Decode(req.b64 || '');
  var offset = Number(req.offset) || 0, n = bytes.length;
  if (!n) return fail_('Potongan kosong');
  var res = UrlFetchApp.fetch(s.url, {
    method: 'put', muteHttpExceptions: true, contentType: 'application/octet-stream', payload: bytes,
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken(), 'Content-Range': 'bytes ' + offset + '-' + (offset + n - 1) + '/' + s.size }
  });
  var code = res.getResponseCode();
  if (code === 308) {
    var rg = String(hdr_(res, 'Range') || ''); var m = /bytes=0-(\d+)/.exec(rg);
    var received = m ? Number(m[1]) + 1 : 0;
    if (req.last && received < s.size) return fail_('Unggahan belum lengkap (' + received + ' dari ' + s.size + ' byte)', { received: received });
    return { ok: true, received: received };
  }
  if (code === 200 || code === 201) {
    var meta = JSON.parse(res.getContentText());
    cache.remove('up:' + req.uploadId);
    var file = DriveApp.getFileById(meta.id);
    var par = DriveApp.getFolderById(s.folder);
    trashSameName_(par, file.getName(), file.getId());
    return { ok: true, done: true, received: s.size, file: info_(file) };
  }
  return fail_('Drive menolak potongan unggahan (' + code + ')');
}

/* ---------- gambar/aset ---------- */
function asset_(req) {
  var segs = parts_(req.name); if (!segs.length) return fail_('Nama aset kosong');
  var name = segs.join('/');
  var f = fileAt_(SYS_NAME + '/aset/' + name) || fileAt_(name);
  if (!f) return fail_('Aset tidak ditemukan', { notFound: true });
  if (f.getSize() > 8 * 1024 * 1024) return fail_('Aset terlalu besar');
  return { ok: true, b64: Utilities.base64Encode(f.getBlob().getBytes()), mime: f.getMimeType() };
}

/** Jalankan sekali dari editor (Run > authorizeOnce) agar Google meminta izin Drive + permintaan eksternal. */
function authorizeOnce() {
  if (ROOT_ID === 'PASTE-ROOT-FOLDER-ID-HERE') throw new Error('Isi ROOT_ID dulu.');
  Logger.log('Folder utama: ' + DriveApp.getFolderById(ROOT_ID).getName());
  Logger.log('Folder sistem: ' + sysFolder_().getName());
  UrlFetchApp.fetch('https://www.google.com/generate_204', { muteHttpExceptions: true });
  Logger.log('OK, sekarang deploy sebagai Web app.');
}
