// Beranda "Rimba": lukisan Ejak (Multispesies) yang hidup.
// Teknik (v1.1): lukisan digambar ulang seluruhnya dengan geometri di js/rimba-geo.js (tanpa berkas gambar):
// tiap satwa, pohon, air terjun dan langit adalah kurva dan rumus yang bergerak di satu kanvas.
// Berkas ini mengurus yang di atasnya: titik sentuh, gelembung ucapan, semprotan gajah, kunang-kunang, suara.
// Kalau kanvas gagal, lukisan asli (assets/rimba.webp) tampil sebagai cadangan.
//
// mountScene(el, ctx) -> { destroy() }   (kontrak ada di SPEC.md)

import { mountRimba } from './rimba-geo.js';

const IMG = 'assets/rimba.webp';
const IMG_SMALL = 'assets/rimba-kecil.webp';
const RATIO = 1600 / 1200;      // tinggi / lebar lukisan

// Koordinat dalam persen terhadap lukisan (x dari kiri, y dari atas; rx/ry = jari-jari tambalan).
const PATCHES = [];   // v1.0 memakai tambalan gambar; sekarang satwa digerakkan oleh rimba-geo.js

// Titik sentuh: satwa -> fungsi aplikasi. Koordinat dalam persen terhadap lukisan (x dari kiri, y dari atas, r = jari-jari).
const SPOTS = [
  { id: 'gajah', x: 69.2, y: 46.3, r: 8, label: 'Gajah: kabar peluang terbaru' },
  { id: 'orang', x: 15, y: 7, r: 7.5, label: 'Orangutan: sapa dan lelucon' },
  { id: 'cendera', x: 50, y: 29.5, r: 9, label: 'Cenderawasih: pengingat belajar' },
  { id: 'harimau', x: 22, y: 51.3, r: 7.5, label: 'Harimau: tenggat terdekat' },
  { id: 'tarsius', x: 90, y: 31.3, r: 5.5, label: 'Tarsius: bacaan hari ini' },
  { id: 'kakatua', x: 77.1, y: 17.5, r: 5, label: 'Kakatua: petuah lapangan' },
  { id: 'komodo', x: 26.7, y: 69.4, r: 5, label: 'Komodo: penjaga berkas' },
  { id: 'kura', x: 73.3, y: 92.5, r: 5, label: 'Kura-kura: atur tenaga hari ini' },
  { id: 'katak', x: 33.8, y: 90.3, r: 4, label: 'Katak: suara rimba' },
  { id: 'air', x: 46.3, y: 71.3, r: 6, label: 'Air terjun: arus hari ini' },
];

const FALL = { x0: 41.8, x1: 50.2, y0: 60.5, y1: 81.6 };   // air terjun di lukisan
const POOL = { x: 48, y: 90, rx: 12, ry: 5 };
const TRUNK = { x: 62.3, y: 34.3 };                      // ujung belalai

const PETUAH = [
  'Catat dulu, tafsir belakangan. Ingatan itu informan yang paling tidak bisa dipercaya.',
  'Kalau buntu, jalan kaki. Malinowski saja butuh tenda dan banyak jalan sore.',
  'Satu paragraf jelek hari ini lebih berguna daripada satu bab sempurna yang tidak pernah ditulis.',
  'Dengar dulu, baru tanya. Rimba tidak pernah buru-buru.',
  'Proposal bukan janji suci. Proposal itu peta: boleh salah, asal bikin kamu berangkat.',
  'Istirahat itu juga metode. Alon-alon asal kelakon.',
  'Tulis untuk satu pembaca yang kamu sayang, bukan untuk Reviewer 2.',
  'Pertanyaan riset yang bagus biasanya lahir dari hal yang bikin kamu kesal di lapangan.',
];

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cut = (s, n = 58) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s; };
const pick = a => a[Math.floor(Math.random() * a.length)];

function sapa() {
  const h = new Date().getHours();
  return h < 4 ? 'Masih melek' : h < 11 ? 'Selamat pagi' : h < 15 ? 'Selamat siang' : h < 18.5 ? 'Selamat sore' : 'Selamat malam';
}

export function mountScene(el, ctx = {}) {
  const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let alive = true, visible = true, raf = 0, W = 0, H = 0, dpr = 1;
  const timers = new Set();
  const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); if (alive) fn(); }, ms); timers.add(t); return t; };

  el.classList.add('rimba-wrap');
  el.innerHTML = `
    <div class="rimba" role="group" aria-label="Lukisan rimba yang bisa disentuh. Tiap satwa membuka sesuatu.">
      <div class="rimba-geo-host"></div>
      <div class="rimba-patches" aria-hidden="true"></div>
      <canvas class="rimba-fx" aria-hidden="true"></canvas>
      <div class="rimba-burung" aria-hidden="true">
        <svg viewBox="0 0 60 40" width="60" height="40">
          <g class="b-ekor"><path d="M14 22 C4 24 0 30 2 37 C6 30 10 27 17 25Z" fill="#E9C46A" stroke="#4a4332" stroke-width=".8"/></g>
          <ellipse cx="28" cy="21" rx="12" ry="6.2" fill="#C98A3B" stroke="#4a4332" stroke-width=".9"/>
          <circle cx="40" cy="17.5" r="4.6" fill="#6E9A4F" stroke="#4a4332" stroke-width=".9"/>
          <path d="M44 17 l7 1.4 -7 1.8z" fill="#3b3a30"/>
          <circle cx="41.4" cy="16.6" r=".9" fill="#1d1d18"/>
          <g class="b-sayap"><path d="M22 19 C24 6 34 2 40 3 C36 9 33 15 31 20Z" fill="#E7A560" stroke="#4a4332" stroke-width=".9"/></g>
          <g class="b-sayap b2"><path d="M20 20 C18 9 24 3 30 2 C29 9 28 15 27 20Z" fill="#D9924A" stroke="#4a4332" stroke-width=".8" opacity=".9"/></g>
        </svg>
      </div>
      <div class="rimba-spots"></div>
      <div class="rimba-bubble" role="status" aria-live="polite" hidden></div>
      <div class="rimba-bar">
        <button type="button" class="rimba-chip" data-act="suara" aria-pressed="false" title="Suara rimba">🔈 <span>Suara rimba</span></button>
        <button type="button" class="rimba-chip" data-act="petunjuk" title="Tunjukkan satwa yang bisa disentuh">✨ <span>Petunjuk</span></button>
      </div>
      <div class="rimba-credit">lukisan: Ejak · Multispesies</div>
    </div>`;

  const root = el.querySelector('.rimba');
  const patchBox = root.querySelector('.rimba-patches');
  const cv = root.querySelector('.rimba-fx');
  const g = cv.getContext('2d');
  const spotBox = root.querySelector('.rimba-spots');
  const bubble = root.querySelector('.rimba-bubble');
  const bird = root.querySelector('.rimba-burung');
  const patchEls = [];

  /* ---------- lukisan geometri ---------- */
  const host = root.querySelector('.rimba-geo-host');
  let geo = null;
  try { geo = mountRimba(host, { maxDpr: 2, maxPx: 1500, fps: 40 }); }
  catch (e) {
    console.error('rimba-geo', e);
    host.innerHTML = `<img class="rimba-img" src="${IMG}" alt="Lukisan cat air: hutan dengan air terjun di tengah, dikelilingi satwa langka." decoding="async">`;
  }
  function react(id) { if (geo) geo.poke(id); }

  /* ---------- titik sentuh ---------- */
  SPOTS.forEach(s => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'spot'; b.dataset.id = s.id;
    b.setAttribute('aria-label', s.label); b.title = s.label.split(':')[0];
    b.style.left = s.x + '%'; b.style.top = s.y + '%';
    b.style.width = (s.r * 2) + '%';
    b.innerHTML = '<i></i>';
    spotBox.appendChild(b);
  });
  const spotEl = id => spotBox.querySelector(`.spot[data-id="${id}"]`);
  function badge(id, n) {
    const b = spotEl(id); if (!b) return;
    let x = b.querySelector('.spot-badge');
    if (!n) { if (x) x.remove(); return; }
    if (!x) { x = document.createElement('span'); x.className = 'spot-badge'; b.appendChild(x); }
    x.textContent = n > 9 ? '9+' : String(n);
  }

  /* ---------- gelembung ucapan ---------- */
  let bubbleTimer = 0, bubbleFor = null;
  function say(id, html, { hold = 9000 } = {}) {
    const s = SPOTS.find(z => z.id === id) || { x: 47, y: 42, r: 6 };
    bubble.innerHTML = `<button type="button" class="bb-x" aria-label="Tutup">×</button><div class="bb-body">${html}</div>`;
    bubble.hidden = false; bubbleFor = id;
    const below = s.y < 34;
    bubble.classList.toggle('bawah', below);
    const bw = Math.min(W * 0.8, 310);
    bubble.style.width = bw + 'px';
    let left = (s.x / 100) * W - bw / 2;
    left = Math.max(8, Math.min(W - bw - 8, left));
    bubble.style.left = left + 'px';
    bubble.style.setProperty('--ekor', Math.max(18, Math.min(bw - 18, (s.x / 100) * W - left)) + 'px');
    const yPx = (s.y / 100) * H, rPx = (s.r / 100) * W;
    if (below) { bubble.style.top = (yPx + rPx * 0.9 + 10) + 'px'; bubble.style.bottom = 'auto'; }
    else { bubble.style.bottom = (H - yPx + rPx * 0.9 + 10) + 'px'; bubble.style.top = 'auto'; }
    // jangan sampai keluar dari lukisan
    const bh = bubble.offsetHeight;
    if (!below && yPx - rPx * 0.9 - 10 - bh < 6) {
      if (yPx + rPx * 0.9 + 10 + bh < H - 50) { bubble.classList.add('bawah'); bubble.style.top = (yPx + rPx * 0.9 + 10) + 'px'; bubble.style.bottom = 'auto'; }
      else { bubble.style.top = '6px'; bubble.style.bottom = 'auto'; bubble.style.setProperty('--ekor', '-40px'); }
    } else if (below && yPx + rPx * 0.9 + 10 + bh > H - 6) { bubble.style.top = Math.max(6, H - bh - 52) + 'px'; bubble.style.setProperty('--ekor', '-40px'); }
    bubble.classList.remove('muncul'); void bubble.offsetWidth; bubble.classList.add('muncul');
    clearTimeout(bubbleTimer);
    if (hold) bubbleTimer = later(hush, hold);
  }
  function hush() { bubble.hidden = true; bubbleFor = null; clearTimeout(bubbleTimer); }
  bubble.addEventListener('click', e => { if (e.target.closest('.bb-x')) hush(); const a = e.target.closest('[data-do]'); if (a) doAct(a.dataset.do); });

  /* ---------- isi tiap satwa ---------- */
  const name = esc(ctx.name || 'Berta');
  let energy = ctx.energy === 'low' ? 'low' : 'normal';
  let soundOn = false;

  const talk = {
    gajah() {
      spray(); react('gajah'); badge('gajah', 0);
      const o = (ctx.opps || []).slice(0, energy === 'low' ? 1 : 3);
      if (!o.length) return say('gajah', `<b>Gajah:</b> belum ada kabar baru yang pantas disemprotkan. Besok kucoba lagi. <a href="#/radar">Lihat semua peluang →</a>`);
      const n = ctx.newCount || 0;
      say('gajah', `<b>Gajah:</b> ${n ? `ada <b>${n}</b> kabar baru minggu ini.` : 'ini yang paling pas buatmu sekarang.'}
        <ul class="bb-list">${o.map(x => `<li><a href="${esc(x.href)}">${esc(cut(x.title))}</a>${x.verdict ? ` <em>${esc(x.verdict)}</em>` : ''}${x.deadlineText ? ` <small>${esc(x.deadlineText)}</small>` : ''}</li>`).join('')}</ul>
        <a class="bb-more" href="#/radar">Semua peluang →</a>`, { hold: 16000 });
    },
    orang() {
      react('orang');
      const j = typeof ctx.joke === 'function' ? ctx.joke() : '';
      say('orang', `<b>Orangutan:</b> ${sapa()}, ${name}! Sepupu jauhmu melambai. 👋<br><span class="bb-joke">${esc(j)}</span><br><button type="button" class="bb-btn" data-do="joke">Satu lagi</button>`, { hold: 14000 });
    },
    cendera() {
      react('cendera'); flyBird();
      const l = ctx.lesson, r = ctx.reviewCount || 0;
      let h = `<b>Cenderawasih:</b> `;
      if (l) h += `ayo terbang sebentar: <a href="${esc(l.href)}">${esc(cut(l.title, 64))}</a>. Sepuluh menit saja.`;
      else h += `semua pelajaran sudah kamu lalui. Mau mengulang? <a href="#/learn">Ke jalur belajar →</a>`;
      if (r) h += `<br><small>${r} soal menunggu diulang.</small>`;
      if (ctx.streak) h += `<br><small>🔥 ${ctx.streak} hari berturut-turut.</small>`;
      say('cendera', h, { hold: 12000 });
    },
    harimau() {
      react('harimau');
      const d = (ctx.deadlines || []).slice(0, 3);
      if (!d.length) return say('harimau', `<b>Harimau:</b> belum ada tenggat yang kujaga. Simpan satu peluang ke pelacak, nanti kuaum-kan kalau sudah dekat.`);
      say('harimau', `<b>Harimau:</b> ini yang paling dekat.
        <ul class="bb-list">${d.map(x => `<li><a href="${esc(x.href)}">${esc(cut(x.title, 50))}</a> <em>${x.days <= 0 ? 'hari ini!' : x.days + ' hari lagi'}</em></li>`).join('')}</ul>`, { hold: 14000 });
    },
    tarsius() {
      react('tarsius');
      const p = ctx.paper;
      say('tarsius', p ? `<b>Tarsius:</b> mataku besar buat baca. Hari ini: <a href="${esc(p.href)}">${esc(cut(p.title, 80))}</a>` : `<b>Tarsius:</b> mataku besar buat baca. <a href="#/read">Cari bacaan →</a>`);
    },
    kakatua() { react('kakatua'); say('kakatua', `<b>Kakatua:</b> ${esc(pick(PETUAH))}`); },
    komodo() { react('komodo'); say('komodo', `<b>Komodo:</b> aku tua dan sabar, cocok jaga arsip. Catatan lapangan, rekaman, draf: titip sini. <a href="#/files">Buka berkas →</a>`); },
    kura() {
      react('kura');
      const low = energy === 'low';
      say('kura', `<b>Kura-kura:</b> ${low ? 'sekarang <b>mode kura-kura</b>: satu langkah saja. Alon-alon asal kelakon.' : 'lagi capek? Pindah ke mode kura-kura: cuma satu langkah kecil hari ini.'}
        <br><button type="button" class="bb-btn" data-do="energi">${low ? 'Balik ke mode enggang' : 'Mode kura-kura'}</button>`, { hold: 12000 });
    },
    katak() { react('katak'); toggleSound(); say('katak', `<b>Katak:</b> ${soundOn ? 'kung… kung… suara rimba menyala. Pejamkan mata sebentar.' : 'baik, aku diam dulu.'}`, { hold: 5000 }); },
    air() {
      ripple(POOL.x, POOL.y, 3); react('air');
      const s = ctx.streak || 0;
      say('air', `<b>Air terjun:</b> ${s ? `sudah <b>${s}</b> hari kamu mengalir.` : 'hari ini mulai dari tetes pertama.'} Air tidak pernah memaksa batu, tapi selalu sampai.`, { hold: 8000 });
    },
  };
  function doAct(a) {
    if (a === 'joke') talk.orang();
    if (a === 'energi') { energy = energy === 'low' ? 'normal' : 'low'; ctx.onEnergy && ctx.onEnergy(energy); talk.kura(); }
  }
  spotBox.addEventListener('click', e => {
    const b = e.target.closest('.spot'); if (!b) return;
    root.classList.remove('petunjuk');
    const f = talk[b.dataset.id]; if (f) f();
  });
  root.querySelector('.rimba-bar').addEventListener('click', e => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'suara') toggleSound();
    if (b.dataset.act === 'petunjuk') { root.classList.add('petunjuk'); later(() => root.classList.remove('petunjuk'), 5200); }
  });

  /* ---------- burung kecil yang terbang ---------- */
  let flying = false;
  function flyBird() {
    if (reduce || flying || !W) return;
    flying = true;
    const rtl = Math.random() < 0.5;
    const y0 = H * (0.12 + Math.random() * 0.2), y1 = H * (0.08 + Math.random() * 0.25), mid = Math.min(y0, y1) - H * 0.06;
    bird.style.display = 'block';
    const a = bird.animate([
      { transform: `translate(${rtl ? W + 30 : -70}px, ${y0}px) scaleX(${rtl ? -1 : 1})` },
      { transform: `translate(${W * 0.5 - 30}px, ${mid}px) scaleX(${rtl ? -1 : 1})`, offset: 0.5 },
      { transform: `translate(${rtl ? -70 : W + 30}px, ${y1}px) scaleX(${rtl ? -1 : 1})` },
    ], { duration: 6200 + Math.random() * 1800, easing: 'ease-in-out' });
    a.onfinish = a.oncancel = () => { bird.style.display = 'none'; flying = false; };
  }
  bird.style.pointerEvents = 'none';

  /* ---------- kanvas: air, percikan, serbuk cahaya ---------- */
  const drops = [];     // air terjun
  const sprays = [];    // semprotan gajah
  const rings = [];     // riak kolam
  const motes = [];     // serbuk / kunang-kunang
  const dark = () => document.documentElement.dataset.theme === 'dark';

  function resize() {
    const r = root.getBoundingClientRect();
    W = r.width; H = r.height; if (!W) return;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    patchEls.forEach(({ p, el: d }) => {
      d.style.backgroundSize = `${W}px ${H}px`;
      d.style.backgroundPosition = `${-((p.x - p.rx) / 100) * W}px ${-((p.y - p.ry) / 100) * H}px`;
    });
    if (reduce) drawStatic();
  }
  function seed() {
    drops.length = 0; motes.length = 0;
    
    for (let i = 0; i < 12; i++) motes.push({ x: Math.random(), y: Math.random() * 0.9, r: 0.6 + Math.random() * 1.4, p: Math.random() * 6.28, s: 0.2 + Math.random() * 0.5 });
  }
  function newDrop(anywhere) {
    return { x: FALL.x0 + Math.random() * (FALL.x1 - FALL.x0), y: anywhere ? FALL.y0 + Math.random() * (FALL.y1 - FALL.y0) : FALL.y0, v: 5 + Math.random() * 6, l: 1.2 + Math.random() * 2.4, a: 0.25 + Math.random() * 0.45 };
  }
  function spray() {
    if (reduce) return;
    for (let i = 0; i < 70; i++) {
      const ang = -Math.PI / 2 - 0.55 + (Math.random() - 0.5) * 1.1, sp = 2.2 + Math.random() * 3.4;
      sprays.push({ x: TRUNK.x / 100 * W, y: TRUNK.y / 100 * H, vx: Math.cos(ang) * sp * (W / 400), vy: Math.sin(ang) * sp * (W / 400), r: 1 + Math.random() * 2.2, life: 1, t: i * 6 });
    }
  }
  function ripple(x, y, n = 1) { for (let i = 0; i < n; i++) rings.push({ x, y, t: -i * 0.35 }); }

  let last = 0, ringClock = 0;
  function frame(ts) {
    if (!alive) return;
    raf = requestAnimationFrame(frame);
    if (!visible || !W) return;
    const dt = Math.min(50, ts - (last || ts)) / 1000; last = ts;
    g.clearRect(0, 0, W, H);

    // air terjun: garis-garis tipis jatuh
    g.lineCap = 'round';
    for (const d of drops) {
      d.y += d.v * dt * 2.2;
      if (d.y > FALL.y1) Object.assign(d, newDrop(false));
      const x = d.x / 100 * W, y = d.y / 100 * H;
      g.strokeStyle = `rgba(255,255,255,${d.a})`; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + d.l / 100 * H); g.stroke();
    }
    // riak kolam
    ringClock += dt;
    if (ringClock > 2.6) { ringClock = 0; ripple(POOL.x - 6 + Math.random() * 12, POOL.y - 3 + Math.random() * 7); }
    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i]; r.t += dt * 0.5;
      if (r.t > 1) { rings.splice(i, 1); continue; }
      if (r.t < 0) continue;
      g.strokeStyle = `rgba(255,255,255,${0.5 * (1 - r.t)})`; g.lineWidth = 1;
      g.beginPath(); g.ellipse(r.x / 100 * W, r.y / 100 * H, r.t * W * 0.06, r.t * W * 0.022, 0, 0, 6.3); g.stroke();
    }
    // semprotan gajah
    for (let i = sprays.length - 1; i >= 0; i--) {
      const s = sprays[i];
      if (s.t > 0) { s.t -= dt * 1000; continue; }
      s.vy += 9 * dt * (W / 400); s.x += s.vx; s.y += s.vy; s.life -= dt * 0.75;
      if (s.life <= 0 || s.y > H) { sprays.splice(i, 1); continue; }
      g.fillStyle = `rgba(214,244,247,${Math.max(0, s.life) * 0.9})`;
      g.beginPath(); g.arc(s.x, s.y, s.r, 0, 6.3); g.fill();
      g.fillStyle = `rgba(255,255,255,${Math.max(0, s.life) * 0.7})`;
      g.beginPath(); g.arc(s.x - s.r * 0.3, s.y - s.r * 0.3, s.r * 0.4, 0, 6.3); g.fill();
    }
    // serbuk cahaya (siang) / kunang-kunang (malam)
    const night = dark();
    for (const m of motes) {
      m.p += dt * m.s; m.y -= dt * 0.006 * m.s; m.x += Math.sin(m.p) * 0.0006;
      if (m.y < -0.02) { m.y = 0.95; m.x = Math.random(); }
      const a = (night ? 0.55 : 0.32) * (0.5 + 0.5 * Math.sin(m.p * 2.3));
      g.fillStyle = night ? `rgba(255,236,150,${a})` : `rgba(255,255,240,${a})`;
      g.beginPath(); g.arc(m.x * W, m.y * H, m.r * (night ? 1.5 : 1), 0, 6.3); g.fill();
    }
  }
  function drawStatic() { g.clearRect(0, 0, W, H); }

  /* ---------- suara rimba (disintesis, tanpa berkas audio) ---------- */
  let ac = null, master = null, chirpTimer = 0;
  function toggleSound(force) {
    const on = typeof force === 'boolean' ? force : !soundOn;
    if (on === soundOn) return;
    soundOn = on;
    const chip = root.querySelector('[data-act=suara]');
    chip.setAttribute('aria-pressed', String(on)); chip.firstChild.textContent = on ? '🔊 ' : '🔈 ';
    if (on) startSound(); else stopSound();
    ctx.onSound && ctx.onSound(on);
  }
  function startSound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ac = ac || new AC(); if (ac.state === 'suspended') ac.resume();
      master = ac.createGain(); master.gain.value = 0; master.connect(ac.destination);
      master.gain.linearRampToValueAtTime(0.9, ac.currentTime + 1.5);
      // air terjun: derau yang disaring
      const len = ac.sampleRate * 2, buf = ac.createBuffer(1, len, ac.sampleRate), ch = buf.getChannelData(0);
      let b0 = 0; for (let i = 0; i < len; i++) { const w = Math.random() * 2 - 1; b0 = 0.985 * b0 + 0.15 * w; ch[i] = b0 * 1.6 + w * 0.08; }
      const src = ac.createBufferSource(); src.buffer = buf; src.loop = true;
      const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1500;
      const hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 180;
      const wg = ac.createGain(); wg.gain.value = 0.11;
      src.connect(hp); hp.connect(lp); lp.connect(wg); wg.connect(master); src.start();
      master._src = src;
      const loop = () => { if (!soundOn || !alive) return; Math.random() < 0.72 ? chirp() : croak(); chirpTimer = later(loop, 900 + Math.random() * 3800); };
      chirpTimer = later(loop, 700);
    } catch (e) { soundOn = false; }
  }
  function chirp() {
    if (!ac || !master) return;
    const t = ac.currentTime, n = 1 + Math.floor(Math.random() * 4), base = 2200 + Math.random() * 2400;
    const pan = ac.createStereoPanner ? ac.createStereoPanner() : null; if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(master); }
    for (let i = 0; i < n; i++) {
      const o = ac.createOscillator(), gn = ac.createGain(), s = t + i * (0.09 + Math.random() * 0.05);
      o.type = 'sine'; o.frequency.setValueAtTime(base, s); o.frequency.exponentialRampToValueAtTime(base * (1.15 + Math.random() * 0.5), s + 0.06);
      gn.gain.setValueAtTime(0, s); gn.gain.linearRampToValueAtTime(0.035, s + 0.012); gn.gain.exponentialRampToValueAtTime(0.0005, s + 0.09);
      o.connect(gn); gn.connect(pan || master); o.start(s); o.stop(s + 0.11);
    }
  }
  function croak() {
    if (!ac || !master) return;
    const t = ac.currentTime;
    for (let i = 0; i < 2; i++) {
      const o = ac.createOscillator(), gn = ac.createGain(), f = ac.createBiquadFilter(), s = t + i * 0.22;
      o.type = 'sawtooth'; o.frequency.setValueAtTime(150, s); o.frequency.linearRampToValueAtTime(110, s + 0.14);
      f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 3;
      gn.gain.setValueAtTime(0, s); gn.gain.linearRampToValueAtTime(0.03, s + 0.02); gn.gain.exponentialRampToValueAtTime(0.0005, s + 0.16);
      o.connect(f); f.connect(gn); gn.connect(master); o.start(s); o.stop(s + 0.18);
    }
  }
  function stopSound() {
    clearTimeout(chirpTimer);
    if (ac && master) { const m = master; try { m.gain.cancelScheduledValues(ac.currentTime); m.gain.linearRampToValueAtTime(0, ac.currentTime + 0.5); } catch (_) {} setTimeout(() => { try { m._src && m._src.stop(); m.disconnect(); } catch (_) {} }, 650); master = null; }
  }

  /* ---------- hidup-mati ---------- */
  const ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(root); else window.addEventListener('resize', resize);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { visible = es[0].isIntersecting && !document.hidden; root.classList.toggle('tidur', !visible); }) : null;
  if (io) io.observe(root);
  const onVis = () => { visible = !document.hidden; if (document.hidden && soundOn) toggleSound(false); };
  document.addEventListener('visibilitychange', onVis);
  const onDocClick = e => { if (!bubble.hidden && !e.target.closest('.rimba')) hush(); };
  document.addEventListener('click', onDocClick);

  resize(); seed();
  if (!reduce) raf = requestAnimationFrame(frame);
  if (ctx.newCount) badge('gajah', ctx.newCount);
  if ((ctx.deadlines || []).some(d => d.days <= 7)) badge('harimau', ctx.deadlines.filter(d => d.days <= 7).length);

  // pembukaan: sapaan, lalu gajah menyemprot bila ada kabar baru
  later(() => {
    if (bubbleFor) return;
    say('air', `${sapa()}, <b>${name}</b>. Rimbamu sudah bangun. Sentuh satwa mana saja.`, { hold: 5200 });
    let seen = false; try { seen = localStorage.getItem('fromodyssey.rimba') === '1'; localStorage.setItem('fromodyssey.rimba', '1'); } catch (_) {}
    if (!seen) { root.classList.add('petunjuk'); later(() => root.classList.remove('petunjuk'), 6000); }
  }, 700);
  if (ctx.newCount) later(() => { if (!bubbleFor || bubbleFor === 'air') spray(); }, 2600);
  const birdLoop = () => { flyBird(); later(birdLoop, 21000 + Math.random() * 16000); };
  later(birdLoop, 4200);

  return {
    destroy() {
      alive = false; cancelAnimationFrame(raf);
      if (geo) { try { geo.destroy(); } catch (_) {} geo = null; }
      timers.forEach(clearTimeout); timers.clear();
      if (ro) ro.disconnect(); else window.removeEventListener('resize', resize);
      if (io) io.disconnect();
      document.removeEventListener('visibilitychange', onVis);
      document.removeEventListener('click', onDocClick);
      stopSound(); if (ac) { try { ac.close(); } catch (_) {} ac = null; }
      el.classList.remove('rimba-wrap'); el.innerHTML = '';
    },
  };
}
