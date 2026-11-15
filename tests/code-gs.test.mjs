// Tes ringan Code.gs di Node dengan tiruan Utilities/PropertiesService (bukan pengganti uji di Apps Script asli).
import fs from 'node:fs'; import vm from 'node:vm'; import crypto from 'node:crypto'; import assert from 'node:assert/strict';
const props = {};
const ctx = {
  console, JSON, Date, Math, String, Number, Array, Object, parseInt,
  PropertiesService: { getScriptProperties: () => ({ getProperty: k => props[k] ?? null, setProperty: (k, v) => { props[k] = v; } }) },
  Utilities: {
    getUuid: () => crypto.randomUUID(),
    newBlob: s => ({ getBytes: () => [...Buffer.from(s)], getDataAsString: () => Buffer.from(s).toString() }),
    computeHmacSha256Signature: (v, k) => [...crypto.createHmac('sha256', Buffer.from(k)).update(Buffer.from(v)).digest()],
    base64EncodeWebSafe: b => Buffer.from(b).toString('base64url'),
    base64DecodeWebSafe: s => [...Buffer.from(s, 'base64url')],
  },
  ContentService: { createTextOutput: t => ({ t, setMimeType() { return this; } }), MimeType: { JSON: 1 } },
};
vm.createContext(ctx);
let src = fs.readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
vm.runInContext(src + `\nthis.__t={handle_,makeSession_,checkSession_,setRoot:r=>{ROOT_ID=r},setAllowed:a=>{ALLOWED_EMAILS=a}};`, ctx);
const T = ctx.__t;
// placeholder ROOT_ID refuses
assert.match(JSON.parse(T.handle_({ action: 'ping' }).t).error, /ROOT_ID/);
T.setAllowed(['Ejak@Example.com']);
const exp = Date.now() + 1e6;
const s = T.makeSession_('ejak@example.com', exp);
assert.equal(T.checkSession_(s), 'ejak@example.com');
assert.equal(T.checkSession_(s.slice(0, -2) + 'xx'), '');
assert.equal(T.checkSession_(T.makeSession_('ejak@example.com', Date.now() - 5)), '');
assert.equal(T.checkSession_(T.makeSession_('other@example.com', exp)), '');
assert.match(JSON.parse(T.handle_((T.setRoot('A'.repeat(20)), { action: 'tree', session: 'bad.bad' })).t).error, /Sesi/);
console.log('code.gs: logika sesi lulus');
