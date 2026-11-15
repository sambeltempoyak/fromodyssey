import { S, save, esc, $, $$, toast, streakAlive, today, download, replaceState, resetState, fmtDate, daysLeft, DEFAULT_KEYWORDS } from './util.js';
import { renderRadar, topOpportunities, nextTrackerSteps } from './radar.js';
import { renderLearn, renderLesson, nextLesson, reviewCount } from './learn.js';
import { renderRead, paperOfDay } from './read.js';
import { jokeOfDay, randomJoke } from './jokes.js';
import { renderFiles } from './files.js';
import * as drive from './drive.js';
import { VERDICT } from './analyze.js';
import { mountScene } from './scene.js';
import { renderAkunCard, connectLink } from './akun.js';
import { CFG } from './config.js';

/* ---- tema: ikut HP / terang / malam ---- */
const THEME_KEY = 'fromodyssey.theme';
export const themePref = () => localStorage.getItem(THEME_KEY) || 'auto';
export function applyTheme() {
  const p = themePref();
  const dark = p === 'dark' || (p === 'auto' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = dark ? '#101812' : '#22756E';
}
const themeIcon = () => ({ auto: '🌗', dark: '🌙', light: '☀️' }[themePref()]);
const THEME_MSG = { auto: 'Tema: ikut pengaturan HP', dark: 'Mode malam menyala', light: 'Mode terang menyala' };
function cycleTheme() {
  const next = { auto: 'dark', dark: 'light', light: 'auto' }[themePref()];
  localStorage.setItem(THEME_KEY, next); applyTheme();
  toast(THEME_MSG[next]);
  document.querySelectorAll('[data-theme-btn]').forEach(b => b.textContent = themeIcon());
}
applyTheme();
if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

const app = document.getElementById('app');
let scene = null;            // current home scene instance
let homeToken = 0;           // guards async home renders after navigation

function killScene() {
  if (scene) { try { scene.destroy(); } catch (e) { console.warn(e); } scene = null; }
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '') || 'home';
  const [page, ...rest] = hash.split('/');
  $$('[data-nav]').forEach(a => {
    const on = a.dataset.nav === page || (page === 'lesson' && a.dataset.nav === 'learn') || (page === 'connect' && a.dataset.nav === 'settings') || (!['radar', 'learn', 'lesson', 'read', 'files', 'settings', 'connect'].includes(page) && a.dataset.nav === 'home');
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  killScene();
  homeToken++;
  app.innerHTML = '';
  document.querySelectorAll('.modal-bg').forEach(m => m.remove());
  window.scrollTo(0, 0);
  const sub = rest.map(decodeURIComponent);
  try {
    switch (page) {
      case 'home': renderHome(app); break;
      case 'radar': renderRadar(app, sub); break;
      case 'learn': renderLearn(app); break;
      case 'lesson': renderLesson(app, sub[0]); break;
      case 'setup': location.hash = '#/learn'; return;
      case 'read': renderRead(app, sub); break;
      case 'files': renderFiles(app, sub); break;
      case 'connect': connectLink(rest.join('/')); break;
      case 'settings': renderSettings(app); break;
      default: renderHome(app);
    }
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card"><h2>Waduh, ada yang tersandung</h2><p class="muted">${esc(e.message)}</p><a class="btn" href="#/home">Kembali ke Rimba</a></div>`;
  }
  sideStats();
  app.focus({ preventScroll: true });
}
window.addEventListener('hashchange', route);
window.addEventListener('fromodyssey:stats', sideStats);

function sideStats() {
  const s = S();
  const el = document.getElementById('sideStats');
  if (el) el.innerHTML = `<div>🔥 <b>${streakAlive()}</b> hari berturut-turut</div><div>✦ <b>${s.xp}</b> XP</div><div style="margin-top:8px;opacity:.85">Datamu tersimpan di browser ini${drive.connected && drive.connected() ? ' dan disinkronkan ke Drive' : '. Cadangkan di menu Aku'}.</div>`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 19 ? 'Selamat sore' : 'Selamat malam';
}
const priCls = p => p >= 68 ? 'p-top' : p >= 50 ? 'p-good' : p >= 34 ? 'p-maybe' : 'p-low';
const vOf = o => VERDICT[o.an?.verdict] || VERDICT.low || { label: '', icon: '', cls: '' };
const deadlineText = d => { const n = daysLeft(d); if (n == null) return ''; return n === 0 ? 'tutup hari ini' : n < 0 ? 'sudah tutup' : `tutup ${n} hari lagi`; };

/* ---------------- Beranda (#/home) ---------------- */
function renderHome(el) {
  const s = S();
  const token = homeToken;
  const low = s.energy === 'low';
  const nl = nextLesson();
  const rc = reviewCount();
  const steps = nextTrackerSteps(low ? 1 : 3);
  const done = Object.values(s.lessons).filter(l => l.done).length;
  const deadlines = (s.tracker || []).filter(t => t.stage !== 'Outcome').map(t => ({ title: t.title, href: `#/radar/item/${encodeURIComponent(t.id)}`, days: daysLeft(t.deadline) }))
    .filter(t => t.days != null && t.days >= 0 && t.days <= 30).sort((a, b) => a.days - b.days).slice(0, 4);

  el.innerHTML = `
  <div id="scene"></div>
  <div class="hello">
    <div>
      <div class="eyebrow">${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })}</div>
      <h1>${greeting()}${s.profile.name ? ', ' + esc(s.profile.name) : ''}.</h1>
      <p class="muted" style="margin:0">${low ? 'Mode kura-kura: satu langkah saja hari ini, alon-alon. Itu sudah dihitung.' : 'Tiga langkah kecil hari ini: satu peluang, satu pelajaran, satu bacaan.'}</p>
    </div>
    <div class="row">
      <button class="theme-btn" data-theme-btn type="button" aria-label="Ganti tema terang / malam">${themeIcon()}</button>
      <div class="energy" role="group" aria-label="Energi hari ini">
        <button type="button" data-energy="low" class="${low ? 'on' : ''}" aria-pressed="${low}">🐢 Mode kura-kura<small>satu langkah saja, alon-alon</small></button>
        <button type="button" data-energy="normal" class="${!low ? 'on' : ''}" aria-pressed="${!low}">🪶 Mode enggang<small>tiga langkah, terbang jauh</small></button>
      </div>
    </div>
  </div>
  <div class="statline" style="margin-bottom:18px">
    <div class="stat"><b>🔥 ${streakAlive()}</b><small>hari berturut-turut</small></div>
    <div class="stat"><b>${s.xp}</b><small>total XP</small></div>
    <div class="stat"><b>${done}</b><small>pelajaran selesai</small></div>
    <div class="stat"><b>${s.tracker.length}</b><small>lamaran dipantau</small></div>
  </div>
  <div class="home-grid">
    <section class="card leaf" aria-labelledby="hNext">
      <div class="row between"><h2 id="hNext" style="margin:0">Langkah berikutnya</h2><a href="#/radar/tracker" class="btn sm ghost">Pantauan</a></div>
      <div id="homeSteps">${steps.length ? steps.map(st => `<div class="check"><span class="pill-n">${st.days == null ? '•' : st.days < 0 ? '!' : st.days}</span><div><b style="color:var(--head)">${esc(st.step)}</b><br><small>${esc(st.title)}${st.deadline ? ' · tenggat ' + fmtDate(st.deadline) : ''}</small></div></div>`).join('')
        : `<div class="empty">Belum ada lamaran yang dipantau. Simpan satu peluang, nanti dipecah jadi langkah-langkah kecil.</div>`}</div>
    </section>
    <section class="card dark">
      <div class="eyebrow">Belajar · 5 menit</div>
      ${nl ? `<h2>${esc(nl.lesson.title)}</h2><p class="muted">${esc(nl.unit.title)}${nl.lesson.blurb ? ' · ' + esc(nl.lesson.blurb) : ''}</p>
      <div class="row"><a class="btn dew big" href="#/lesson/${encodeURIComponent(nl.lesson.id)}">${nl.started ? 'Lanjutkan' : 'Mulai'} pelajaran →</a>${rc ? `<a class="btn ghost" style="color:var(--on-deep);border-color:var(--on-deep-muted)" href="#/lesson/review">Ulang ${rc} soal</a>` : ''}</div>`
      : `<h2>Jalur setapak tuntas 🌺</h2><p class="muted">Semua pelajaran sudah kamu lewati. Ulangi unit mana saja kapan pun.</p><a class="btn dew" href="#/learn">Buka jalur</a>`}
    </section>
  </div>
  <div class="spacer"></div>
  <section class="card">
    <div class="row between"><div><div class="eyebrow">Peluang</div><h2 style="margin:0">Paling cocok sekarang</h2></div><div class="row"><a class="btn soft" href="#/radar/digest">Intip 5 menit</a><a class="btn ghost" href="#/radar">Semua</a></div></div>
    <div id="homeOpps"><p class="muted">Sedang memuat…</p></div>
  </section>
  <div class="spacer"></div>
  <div class="home-grid">
    <section class="card dew">
      <div class="eyebrow">Bacaan hari ini</div>
      <div id="homePaper"><p class="muted">Mencari satu bacaan akses terbuka sesuai minatmu…</p></div>
    </section>
    <section class="card joke">
      <div class="joke-ico" aria-hidden="true">🦧</div>
      <div style="flex:1"><div class="eyebrow">Senyum kecil hari ini</div><p id="joke" style="margin:0">${esc(jokeOfDay())}</p></div>
      <button class="btn sm soft" id="jokeBtn" type="button">Satu lagi</button>
    </section>
  </div>`;

  $('[data-theme-btn]', el).onclick = cycleTheme;
  $('#jokeBtn', el).onclick = () => { $('#joke', el).textContent = randomJoke(); };
  const setEnergy = v => { if (S().energy === v) return; S().energy = v; save(); route(); };
  $$('[data-energy]', el).forEach(b => b.onclick = () => setEnergy(b.dataset.energy));

  const ctx = {
    name: s.profile.name || '', energy: low ? 'low' : 'normal',
    opps: [], newCount: 0,
    joke: () => randomJoke(),
    lesson: nl ? { title: nl.lesson.title, href: `#/lesson/${encodeURIComponent(nl.lesson.id)}` } : null,
    reviewCount: rc, streak: streakAlive(), deadlines, paper: null,
    onEnergy: v => setEnergy(v === 'low' ? 'low' : 'normal'),
    onSound: on => { S().sound = !!on; save(); },
    sound: !!s.sound,
  };
  const mount = () => {
    if (token !== homeToken) return;
    killScene();
    const box = $('#scene', el); if (!box) return;
    try { scene = mountScene(box, ctx); } catch (e) { console.error('scene', e); box.remove(); }
  };
  mount();

  Promise.all([topOpportunities(50).catch(() => []), paperOfDay().catch(() => null)]).then(([all, p]) => {
    if (token !== homeToken) return;
    const list = all.slice(0, low ? 1 : 3);
    ctx.opps = list.map(o => ({ title: o.title, href: `#/radar/item/${encodeURIComponent(o.id)}`, pr: o.priority, verdict: vOf(o).label, deadlineText: deadlineText(o.an?.deadline || o.deadline) }));
    ctx.newCount = all.length;
    ctx.paper = p ? { title: p.title, href: `#/read/paper/${encodeURIComponent(p.key)}` } : null;
    // the scene reads ctx lazily (on tap), so filling it in place is enough; no remount, no flicker

    const box = $('#homeOpps', el);
    if (box) box.innerHTML = list.length ? list.map(o => { const V = vOf(o); return `
      <a class="opp" href="#/radar/item/${encodeURIComponent(o.id)}" style="text-decoration:none;color:inherit"><div class="opp-main"><h3>${esc(o.title)}</h3>
      <div class="meta">${esc(o.org || o.source || '')} ${o.an?.deadline ? '· tutup ' + fmtDate(o.an.deadline) : ''}</div>
      <div class="why"><span class="chip v ${V.cls}">${V.icon} ${esc(V.label)}</span> ${esc((o.an?.verdictText || '').slice(0, 120))}</div></div>
      <div class="acts"><span class="pri ${priCls(o.priority)}" title="Prioritas untukmu, dari 99">${o.priority}</span></div></a>`; }).join('')
      : `<div class="empty">Belum ada peluang terkumpul. Begitu robot harian di GitHub berjalan, yang cocok muncul di sini. Sementara itu, coba <a href="#/radar">halaman Peluang</a>.</div>`;
    const pb = $('#homePaper', el);
    if (pb) pb.innerHTML = p ? `<h3 style="margin:2px 0 4px">${esc(p.title)}</h3><p class="muted" style="margin:0 0 10px">${esc(p.journal || '')}${p.year ? ' · ' + esc(p.year) : ''}</p>
      <div class="row"><a class="btn" href="#/read/paper/${encodeURIComponent(p.key)}">Baca ringkasannya</a></div>`
      : `<p>Belum bisa menjangkau sumber bacaan sekarang. <a href="#/read">Buka ruang baca</a>.</p>`;
  });
}

/* ---------------- Aku & pengaturan (#/settings) ---------------- */
function pushKw() {
  try { if (typeof drive.pushKeywords === 'function') Promise.resolve(drive.pushKeywords()).catch(e => console.warn('pushKeywords', e)); } catch (e) { console.warn(e); }
}

function renderSettings(el) {
  const s = S();
  s.customKeywords = s.customKeywords || []; s.projects = s.projects || [];
  el.innerHTML = `
  <div class="eyebrow">Aku &amp; pengaturan</div><h1>Profil, kata kunci &amp; data</h1>
  <p class="lede">Kata-kata di sini menentukan peluang mana yang naik ke atas dan bacaan apa yang muncul. Semuanya tersimpan di browser ini, dan di Drive-mu kalau tersambung.</p>
  <div class="grid g2">
    <section class="card">
      <h2>Profil</h2>
      <label class="f" for="pName">Nama</label><input type="text" id="pName" value="${esc(s.profile.name)}">
      <label class="f" for="pBg">Latar belakang dalam satu kalimat (dipakai di templat surat dan prompt AI)</label>
      <input type="text" id="pBg" value="${esc(s.profile.background || '')}" placeholder="mis. antropolog; S2 Anthropology and Planetary Futures (ANU)">
      <label class="f" for="pAvoid">Kata yang membuat peluang TIDAK cocok (pisahkan dengan koma)</label>
      <input type="text" id="pAvoid" value="${esc((s.profile.avoid || []).join(', '))}">
      <label class="f" for="pRead">Minat bacaan (sintaks pencarian, mis. indigenous OR pluriverse)</label>
      <input type="text" id="pRead" value="${esc(s.profile.readingInterests || '')}">
      <label class="f" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="pHome" ${s.profile.homeScheme ? 'checked' : ''}> Tampilkan jalur beasiswa dalam negeri</label>
      <div class="spacer"></div><button class="btn" id="saveProfile" type="button">Simpan profil</button>
    </section>
    <section class="card" id="kwCard">
      <h2>Kata kunci-ku</h2>
      <p class="muted" style="margin-top:0">Kata-kata ini mengarahkan urutan peluang, pilihan bacaan, dan pencarian mingguan si pengintai (scout). Hapus yang tidak relevan, tambahkan yang baru.</p>
      <div class="eyebrow" style="margin-top:6px">Bawaan</div>
      <div class="kw-chips" id="kwDefault"></div>
      <div class="eyebrow" style="margin-top:12px">Tambahanku</div>
      <div class="kw-chips" id="kwMine"></div>
      <form class="addrow" id="kwForm"><label class="sr-only" for="kwIn">Kata kunci baru</label><input type="text" id="kwIn" placeholder="mis. ekologi suara, film etnografi" autocomplete="off"><button class="btn" type="submit">Tambah</button></form>
      <div class="row" style="margin-top:10px"><button class="btn sm ghost" id="kwRestore" type="button">Kembalikan kata bawaan</button></div>
    </section>
    <section class="card">
      <h2>Proyek lapangan</h2>
      <p class="muted" style="margin-top:0">Dipakai untuk menata data lapangan di Berkas (<i>03 Data Lapangan/&lt;Proyek&gt;</i>).</p>
      <div class="kw-chips" id="projList"></div>
      <form class="addrow" id="projForm"><label class="sr-only" for="projIn">Proyek baru</label><input type="text" id="projIn" placeholder="mis. Kampung Sodan" autocomplete="off"><button class="btn" type="submit">Tambah</button></form>
    </section>
    <section class="card" id="akunCard"><p class="muted">Memuat akun…</p></section>
    <section class="card">
      <h2>Tampilan</h2>
      <p class="muted" style="margin-top:0">Mode malam lebih ramah mata saat membaca di malam hari.</p>
      <div class="seg" id="themeSeg" role="group" aria-label="Tema">${[['auto', '🌗 Ikut HP'], ['light', '☀️ Terang'], ['dark', '🌙 Malam']].map(([v, l]) => `<button type="button" data-v="${v}" class="${themePref() === v ? 'on' : ''}" aria-pressed="${themePref() === v}">${l}</button>`).join('')}</div>
    </section>
    <section class="card">
      <h2>Cadangan &amp; pindah perangkat</h2>
      <p class="muted">Unduh cadangan sesekali, lalu muat di laptop atau HP lain.</p>
      <div class="row"><button class="btn soft" id="exp" type="button">Unduh cadangan</button>
      <label class="btn ghost" style="cursor:pointer">Muat cadangan<input type="file" id="imp" accept=".json,application/json" hidden></label></div>
      <hr>
      <h3>Mulai dari awal</h3>
      <p class="muted">Menghapus pelajaran, XP, pantauan, catatan refleksi, dan bacaan tersimpan di browser ini. Berkas di Drive tidak tersentuh.</p>
      <button class="btn danger" id="reset" type="button">Hapus semuanya</button>
      <hr>
      <h3>Tentang <small class="muted">fromodyssey v${esc((CFG && CFG.VERSION) || '1')}</small></h3>
      <p class="muted" style="font-size:13.5px">Rimba kecil untuk mencari beasiswa PhD dan hibah riset, belajar antropologi, membaca, dan menyimpan berkas. Peluang dikumpulkan robot harian dari sumber publik dan si pengintai mingguan; bacaan dari indeks akses terbuka. Dibuat bersama Claude. Pelan-pelan, sampai juga.</p>
    </section>
  </div>`;

  /* theme */
  $$('#themeSeg button').forEach(b => b.onclick = () => {
    localStorage.setItem(THEME_KEY, b.dataset.v); applyTheme();
    $$('#themeSeg button').forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b); });
    toast(THEME_MSG[b.dataset.v]);
  });

  /* profile */
  $('#saveProfile').onclick = () => {
    const split = v => v.split(',').map(x => x.trim()).filter(Boolean);
    s.profile.name = $('#pName').value.trim();
    s.profile.background = $('#pBg').value.trim();
    s.profile.avoid = split($('#pAvoid').value);
    s.profile.readingInterests = $('#pRead').value.trim();
    s.profile.homeScheme = $('#pHome').checked;
    save(); toast('Profil disimpan'); sideStats();
  };

  /* keywords */
  const drawKw = () => {
    $('#kwDefault').innerHTML = (s.profile.keywords || []).map((w, i) => `<span class="chip">${esc(w)}<button type="button" class="x" data-kd="${i}" aria-label="Hapus ${esc(w)}">×</button></span>`).join('') || '<small class="muted">Kosong.</small>';
    $('#kwMine').innerHTML = s.customKeywords.map((c, i) => `<span class="chip mine" title="ditambahkan ${esc(fmtDate(c.at))}">${esc(c.w)}<button type="button" class="x" data-km="${i}" aria-label="Hapus ${esc(c.w)}">×</button></span>`).join('') || '<small class="muted">Belum ada. Tambahkan kata yang sedang kamu kejar.</small>';
    $$('[data-kd]').forEach(b => b.onclick = () => { s.profile.keywords.splice(+b.dataset.kd, 1); save(); drawKw(); pushKw(); toast('Kata kunci dihapus'); });
    $$('[data-km]').forEach(b => b.onclick = () => { s.customKeywords.splice(+b.dataset.km, 1); save(); drawKw(); pushKw(); toast('Kata kunci dihapus'); });
  };
  drawKw();
  $('#kwForm').onsubmit = e => {
    e.preventDefault();
    const words = $('#kwIn').value.split(',').map(x => x.trim()).filter(Boolean);
    if (!words.length) return;
    const have = new Set([...(s.profile.keywords || []), ...s.customKeywords.map(c => c.w)].map(x => x.toLowerCase()));
    let n = 0;
    for (const w of words) if (!have.has(w.toLowerCase())) { s.customKeywords.push({ w, at: today() }); have.add(w.toLowerCase()); n++; }
    $('#kwIn').value = '';
    if (!n) return toast('Kata itu sudah ada');
    save(); drawKw(); pushKw(); toast(n > 1 ? `${n} kata kunci ditambahkan` : 'Kata kunci ditambahkan');
  };
  $('#kwRestore').onclick = () => {
    const have = new Set(s.profile.keywords.map(x => x.toLowerCase()));
    const add = DEFAULT_KEYWORDS.filter(w => !have.has(w.toLowerCase()));
    if (!add.length) return toast('Semua kata bawaan sudah ada');
    s.profile.keywords.push(...add); save(); drawKw(); pushKw(); toast(`${add.length} kata bawaan dikembalikan`);
  };

  /* field projects */
  const drawProj = () => {
    $('#projList').innerHTML = s.projects.map((p, i) => `<span class="chip">${esc(p)}<button type="button" class="x" data-pj="${i}" aria-label="Hapus ${esc(p)}">×</button></span>`).join('') || '<small class="muted">Belum ada proyek.</small>';
    $$('[data-pj]').forEach(b => b.onclick = () => {
      if (!confirm(`Hapus “${s.projects[+b.dataset.pj]}” dari daftar? Folder di Drive tetap ada.`)) return;
      s.projects.splice(+b.dataset.pj, 1); save(); drawProj(); toast('Proyek dihapus dari daftar');
    });
  };
  drawProj();
  $('#projForm').onsubmit = e => {
    e.preventDefault();
    const v = $('#projIn').value.trim().replace(/[\\/]/g, ' ');
    if (!v) return;
    if (s.projects.some(p => p.toLowerCase() === v.toLowerCase())) return toast('Proyek itu sudah ada');
    s.projects.push(v); $('#projIn').value = ''; save(); drawProj(); toast('Proyek ditambahkan');
  };

  /* account / drive (owner: akun.js) */
  try { renderAkunCard($('#akunCard')); }
  catch (e) { console.error(e); $('#akunCard').innerHTML = `<h2>Akun &amp; Drive</h2><p class="muted">Kartu akun belum bisa dimuat: ${esc(e.message)}</p>`; }

  /* backup / reset */
  $('#exp').onclick = () => download(`fromodyssey-cadangan-${today()}.json`, JSON.stringify(S(), null, 1));
  $('#imp').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const j = JSON.parse(await f.text());
      if (!j || typeof j !== 'object' || !('profile' in j || 'xp' in j)) throw new Error('bukan cadangan');
      replaceState(j); toast('Cadangan dimuat'); route();
    } catch (_) { toast('Berkas itu bukan cadangan fromodyssey'); }
  };
  $('#reset').onclick = () => { if (confirm('Hapus semua data fromodyssey di browser ini?')) { resetState(); toast('Sudah bersih, mulai lagi pelan-pelan'); route(); } };
}

route();
try { drive.initSync && drive.initSync(); } catch (e) { console.warn(e); }
