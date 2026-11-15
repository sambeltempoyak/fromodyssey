import assert from 'node:assert/strict';
const store = {};
globalThis.localStorage = { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
const listeners = {};
globalThis.window = { addEventListener: (e, f) => { (listeners[e] = listeners[e] || []).push(f); }, dispatchEvent: e => { (listeners[e.type] || []).forEach(f => f(e)); return true; } };
globalThis.Event = class { constructor(t) { this.type = t; } };
globalThis.document = { getElementById: () => null };
globalThis.FileReader = class { readAsDataURL(b) { b.arrayBuffer().then(ab => { this.result = 'data:;base64,' + Buffer.from(ab).toString('base64'); this.onload(); }); } };
const { handle } = await import('./fake-drive.mjs');
globalThis.fetch = async (url, o) => ({ json: async () => handle(JSON.parse(o.body)) });
const D = await import('../js/drive.js');
const F = await import('../js/files.js');
// not signed in
assert.equal(D.connected(), false);
await assert.rejects(() => D.ping(), /masuk/i);
// login
const j = await D.call('login', { idToken: 'test' });
D.setDriveCfg({ url: '', key: '', sync: true, session: j.session, email: j.email, exp: j.exp });
assert.equal(D.connected(), true);
assert.equal((await D.ping()).version, 3);
// put/get/mkdir/move/del by id
const f = await D.putText('02 Dokumen Pribadi/CV & Surat/cv.md', '# hai');
assert.equal(await D.getById(f.id), '# hai');
await D.mkdir('04 Bacaan/Pendidikan');
const m = await D.moveById(f.id, '04 Bacaan/Pendidikan/cv-baru.md');
assert.equal(m.path, '04 Bacaan/Pendidikan/cv-baru.md');
// system folder protection
const t0 = await D.tree(); assert.ok(t0.sysId);
await assert.rejects(() => D.delById(t0.sysId), /tidak boleh/);
await assert.rejects(() => D.moveById(t0.sysId, 'x'), /tidak boleh/);
// large upload (14 MB, chunks of 4 MB)
const big = new Blob([Buffer.alloc(14 * 1024 * 1024, 7)], { type: 'audio/mp4' });
const prog = []; const bf = await D.uploadLarge('03 Data Lapangan/Sumba/Rekaman/rek.m4a', big, (d, t) => prog.push(d));
assert.equal(bf.size, big.size); assert.ok(prog.length >= 3);
const back = await D.getById(bf.id, 'b64'); assert.equal(back.size, big.size);
// small upload falls to put
const sm = await D.uploadLarge('05 Tulisan Sendiri/a.txt', new Blob(['halo']), () => {}); assert.equal(sm.name, 'a.txt');
// index + reconcile: unknown files adopted, deleted dropped, moved updated
await D.putText('00 Kotak Masuk/Catatan lapangan Sodan.docx', 'x');
await D.putText('Transkrip wawancara Makekal.txt', 'x');
await D.putText('99 Sistem/files-index.json', JSON.stringify({ files: [{ id: 'GONE000000000000', name: 'x.pdf', title: 'x', cat: 'cv' }] }));
const idx = await D.loadIndex(true);
const t = await D.tree();
const r = F.reconcile(idx, t, ['Orang Rimba', 'Sumba', 'Semarang']);
assert.equal(r.removed, 1);
const names = idx.files.map(e => e.name).sort();
assert.deepEqual(names, ['Catatan lapangan Sodan.docx', 'Transkrip wawancara Makekal.txt', 'a.txt', 'cv-baru.md', 'rek.m4a']);
const rek = idx.files.find(e => e.name === 'rek.m4a'); assert.equal(rek.cat, 'rekaman'); assert.equal(rek.project, 'Sumba');
assert.equal(idx.files.find(e => e.name === 'cv-baru.md').topic, 'Pendidikan');
assert.equal(idx.files.find(e => /Makekal/.test(e.name)).project, 'Orang Rimba');
// user moves file in Drive -> index follows
await D.moveById(rek.id, '03 Data Lapangan/Orang Rimba/Rekaman/rek.m4a');
const r2 = F.reconcile(idx, await D.tree(), []);
assert.equal(idx.files.find(e => e.id === rek.id).project, 'Orang Rimba'); assert.ok(r2.updated >= 1);
// session expiry -> signedout event
let fired = 0; window.addEventListener('fromodyssey:signedout', () => fired++);
D.setDriveCfg({ url: '', key: '', session: 'fake.1', email: 'a', exp: Date.now() + 1e6 });
await assert.rejects(() => D.ping(), /Sesi/); assert.equal(fired, 1); assert.equal(D.connected(), false);
// passcode fallback
D.setDriveCfg({ url: '', key: 'test' }); assert.equal(D.connected(), true); assert.ok((await D.ping()).ok);
// assets
await D.putText('99 Sistem/aset/a.txt', 'z');
console.log('semua tes drive lulus');
