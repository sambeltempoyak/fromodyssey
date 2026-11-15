// Kartu "Akun & Drive" di halaman Aku: masuk dengan Google, keluar, sinkron, sambungan manual.
import { esc, $, toast, loadScript, replaceState } from './util.js';
import { CFG } from './config.js';
import { driveCfg, setDriveCfg, driveUrl, sessionValid, connected, call, ping, pushState, pullState, pushKeywords, clearSession, initSync } from './drive.js';

let current = null; // elemen kartu yang sedang tampil
const GSI = 'https://accounts.google.com/gsi/client';
const urlOk = u => /^https:\/\/script\.google\.com\//.test(u);

async function loadGsi() {
  await loadScript(GSI);
  for (let i = 0; i < 40 && !(window.google && window.google.accounts && window.google.accounts.id); i++) await new Promise(r => setTimeout(r, 100));
  if (!(window.google && window.google.accounts && window.google.accounts.id)) throw new Error('Google Sign-In belum termuat');
}

async function loginWithCredential(credential) {
  const j = await call('login', { idToken: credential });
  const c = driveCfg() || {};
  setDriveCfg({ url: c.url || '', key: c.key || '', sync: c.sync !== false, session: j.session, email: j.email, exp: j.exp });
  return j;
}

export function renderAkunCard(el) {
  current = el;
  const c = driveCfg();
  const url = driveUrl();
  const signed = sessionValid(c);
  const hasManualKey = !!(c && c.key);
  const needsSetup = !url;

  el.innerHTML = `
    <h2>Akun &amp; Drive</h2>
    <div class="ak-privacy notice dew">
      <b>Sebelum mengunggah, ini penting:</b> berkas yang kamu simpan lewat aplikasi ini disimpan di sebuah folder Google Drive
      milik <b>Ejak</b>, orang yang menyiapkan aplikasi ini untuk kamu. Ejak bisa membuka folder itu dan semua isinya.
      Kalau ada berkas yang tidak ingin dibaca orang lain, jangan diunggah, atau tanyakan dulu ke Ejak. Hanya akun Google
      yang diizinkan yang bisa masuk, dan data tidak dikirim ke tempat lain.
    </div>
    <div class="drive-state" id="akState"><span class="dot ${connected() ? '' : 'bad'}"></span>${
      needsSetup ? 'Drive belum disiapkan.' : signed ? `Masuk sebagai <b>${esc(c.email || '')}</b>` : hasManualKey ? 'Tersambung lewat kode sandi.' : 'Belum masuk.'}</div>
    ${needsSetup ? `<p class="muted">Folder Drive belum disiapkan di aplikasi ini. Minta Ejak menyelesaikan penyiapan (mengisi alamat skrip di <code>config.js</code>), atau pakai "Sambungan manual" di bawah kalau kamu sudah punya alamat dan kode sandinya. Sementara itu semua tetap bisa dibaca dan disimpan di browser ini.</p>` : ''}
    ${!needsSetup && !signed ? `
      <p class="muted">Masuk dengan akun Google yang sudah didaftarkan, supaya berkas dan progresmu sama di HP dan laptop.</p>
      <div id="akGbtn" class="ak-gbtn" style="min-height:44px"></div>
      <p class="muted" id="akGmsg" style="font-size:13px"></p>` : ''}
    ${signed || hasManualKey ? `
      <label class="ak-check"><input type="checkbox" id="akSync" ${c.sync !== false ? 'checked' : ''}> Sinkronkan progresku antar perangkat secara otomatis</label>
      <div class="row" style="margin-top:10px">
        <button class="btn" id="akPush">Simpan progres ke Drive</button>
        <button class="btn soft" id="akPull">Muat progres dari Drive</button>
        ${signed ? '<button class="btn ghost" id="akOut">Keluar</button>' : '<button class="btn ghost" id="akOut">Putuskan</button>'}
      </div>
      <div class="ak-prog" id="akProg" hidden><i></i></div>
      <p class="muted" id="akMsg" style="font-size:13px"></p>` : ''}
    <details class="ak-manual" ${needsSetup && !hasManualKey ? 'open' : ''}>
      <summary>Sambungan manual</summary>
      <p class="muted" style="font-size:13px">Cadangan kalau Google Sign-In bermasalah. Tempel alamat Web app dan kode sandi (kalau skripnya memakai kode sandi).</p>
      <label class="f">Alamat Web app</label>
      <input type="text" id="akUrl" placeholder="https://script.google.com/macros/s/…/exec" value="${esc((c && c.url) || '')}" autocomplete="off">
      <label class="f">Kode sandi</label>
      <input type="password" id="akKey" placeholder="kode sandi dari skrip" value="${esc((c && c.key) || '')}" autocomplete="off">
      <div class="row" style="margin-top:10px"><button class="btn" id="akSave">Simpan &amp; coba</button></div>
    </details>`;

  const msg = $('#akMsg', el);
  const say = t => { if (msg) msg.textContent = t || ''; };

  if (signed || hasManualKey) {
    ping().then(r => { $('#akState', el).innerHTML = `<span class="dot ok"></span>${signed ? `Masuk sebagai <b>${esc(c.email || r.email || '')}</b>` : 'Tersambung'} · folder “${esc(r.root)}”`; })
      .catch(e => { const s = $('#akState', el); if (s) s.innerHTML = `<span class="dot bad"></span>${esc(e.message)}`; });
    $('#akSync', el).onchange = e => { const cc = driveCfg(); if (cc) setDriveCfg({ ...cc, sync: e.target.checked }); };
    $('#akPush', el).onclick = async () => {
      const bar = $('#akProg', el); bar.hidden = false; bar.firstElementChild.style.width = '35%'; say('Menyimpan…');
      try { await pushState(false); await pushKeywords(); bar.firstElementChild.style.width = '100%'; say('Progres tersimpan di Drive-mu.'); }
      catch (e) { say(e.message); }
      setTimeout(() => { bar.hidden = true; }, 1200);
    };
    $('#akPull', el).onclick = async () => {
      const bar = $('#akProg', el); bar.hidden = false; bar.firstElementChild.style.width = '35%'; say('Mengambil…');
      try {
        const j = await pullState(); bar.firstElementChild.style.width = '100%';
        if (!j) { say('Belum ada progres tersimpan di Drive.'); }
        else if (confirm('Ganti progres di perangkat ini dengan versi yang tersimpan pada ' + new Date(j.updatedAt).toLocaleString('id-ID') + '?')) { replaceState(j.state); toast('Progres dimuat'); location.reload(); }
        else say('Dibatalkan.');
      } catch (e) { say(e.message); }
      setTimeout(() => { bar.hidden = true; }, 1200);
    };
    $('#akOut', el).onclick = () => {
      if (!confirm(signed ? 'Keluar dari akun di perangkat ini? Tidak ada yang dihapus dari Drive.' : 'Putuskan sambungan Drive di perangkat ini? Tidak ada yang dihapus dari Drive.')) return;
      if (signed) { clearSession(); try { window.google && window.google.accounts.id.disableAutoSelect(); } catch (_) {} const cc = driveCfg(); if (cc && !cc.key && !cc.url) setDriveCfg(null); }
      else setDriveCfg(null);
      renderAkunCard(el);
    };
  }

  $('#akSave', el).onclick = async () => {
    const u = $('#akUrl', el).value.trim(), k = $('#akKey', el).value.trim();
    if (u && !urlOk(u)) return toast('Alamatnya harus diawali https://script.google.com');
    if (!u && !k) { const cc = driveCfg(); if (cc) setDriveCfg({ ...cc, url: '', key: '' }); return renderAkunCard(el); }
    if (!u && !CFG.DRIVE_URL) return toast('Isi alamat Web app dulu');
    const prev = driveCfg() || {};
    setDriveCfg({ ...prev, url: u, key: k, sync: prev.sync !== false });
    try { const r = await ping(); toast('Tersambung ke ' + r.root); initSync(); }
    catch (e) { setDriveCfg(prev.url || prev.key || prev.session ? prev : null); toast(e.message); }
    renderAkunCard(el);
  };

  const gb = $('#akGbtn', el);
  if (gb) {
    const gm = $('#akGmsg', el);
    if (!CFG.GOOGLE_CLIENT_ID) { gm.textContent = 'Google Client ID belum diisi di config.js, jadi tombol masuk belum bisa dipakai.'; return; }
    loadGsi().then(() => {
      if (current !== el) return;
      const cb = async resp => {
        try { gm.textContent = 'Memeriksa…'; await loginWithCredential(resp.credential); toast('Berhasil masuk'); initSync(); }
        catch (e) { if (current === el) gm.textContent = e.message; return; }
        renderAkunCard(el);
      };
      window.google.accounts.id.initialize({ client_id: CFG.GOOGLE_CLIENT_ID, callback: cb, auto_select: true, cancel_on_tap_outside: false });
      window.google.accounts.id.renderButton(gb, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', locale: 'id', width: 260 });
      try { window.google.accounts.id.prompt(); } catch (_) {}
    }).catch(() => { gm.textContent = 'Tombol Google belum bisa dimuat (cek koneksi internet). Pakai "Sambungan manual" kalau perlu.'; });
  }
}

/** Rute lama #/connect/<base64url {u,k}>. */
export function connectLink(code) {
  try {
    const j = JSON.parse(decodeURIComponent(escape(atob(String(code || '').replace(/-/g, '+').replace(/_/g, '/')))));
    if (!urlOk(j.u) || !j.k) throw new Error('bad');
    const prev = driveCfg() || {};
    setDriveCfg({ ...prev, url: j.u, key: j.k, sync: true });
    history.replaceState(null, '', location.pathname + '#/settings');
    toast('Google Drive tersambung di perangkat ini');
    window.dispatchEvent(new HashChangeEvent('hashchange')); initSync();
  } catch (_) { location.hash = '#/settings'; toast('Tautan sambungan itu tidak berfungsi. Tempel alamat dan kode sandi di halaman Aku.'); }
}

window.addEventListener('fromodyssey:signedout', () => {
  if (current && current.isConnected) { renderAkunCard(current); toast('Sesi habis. Silakan masuk lagi.'); }
});
