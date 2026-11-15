// Belajar: jalur setapak pelajaran antropologi + pemutar pelajaran (learn, mcq, fill, order, reflect, read).
import { S, save, esc, $, $$, toast, addXP, today, fmtDate, download } from './util.js';
import { UNITS, ALL_LESSONS } from './lessons.js';
import { randomJoke } from './jokes.js';

const GRADED = new Set(['mcq', 'fill', 'order']);
const noteKey = (lessonId, i) => `${lessonId}:${i}`;

/* ---------------- progress helpers ---------------- */
const isDone = id => !!S().lessons[id]?.done;
function isOpen(lesson) {
  const u = UNITS.find(u => u.lessons.some(l => l.id === lesson.id));
  if (!u) return true;
  const i = u.lessons.findIndex(l => l.id === lesson.id);
  return i === 0 || isDone(u.lessons[i - 1].id) || isDone(lesson.id);
}
export function nextLesson() {
  for (const u of UNITS) for (const l of u.lessons) if (!isDone(l.id) && isOpen(l)) return { unit: u, lesson: l, started: !!S().lessons[l.id] };
  return null;
}
export function reviewCount() { return S().review.length; }

/* kept so older imports do not break: the laptop-setup page no longer exists */
export function renderSetup() { location.hash = '#/learn'; }

/* ---------------- reflections notebook ---------------- */
function reflections() {
  const notes = S().notes || {};
  return Object.entries(notes).filter(([, v]) => v && v.text).map(([k, v]) => {
    const [lid, idx] = [k.slice(0, k.lastIndexOf(':')), +k.slice(k.lastIndexOf(':') + 1)];
    const lesson = ALL_LESSONS.find(l => l.id === lid);
    const st = lesson?.steps?.[idx];
    return { key: k, lesson, q: st?.q || '(pertanyaan tidak ditemukan)', text: v.text, at: v.at };
  }).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}
function notebookMarkdown() {
  const list = reflections();
  let md = `---\njudul: "Buku catatan refleksi"\ndiunduh: ${today()}\njumlah: ${list.length}\n---\n\n# Buku catatan refleksi\n\n`;
  for (const r of list) {
    md += `## ${r.lesson ? r.lesson.title : r.key}\n\n`;
    if (r.lesson?.unit) md += `*${r.lesson.unit.title}* · ${r.at || ''}\n\n`;
    md += `> ${String(r.q).replace(/<[^>]+>/g, '').replace(/\n/g, '\n> ')}\n\n${r.text}\n\n`;
  }
  return md;
}

/* ---------------- path view: jalur setapak ---------------- */
export function renderLearn(el) {
  const s = S();
  const total = ALL_LESSONS.length, done = ALL_LESSONS.filter(l => isDone(l.id)).length;
  const rc = reviewCount();
  const refl = reflections();
  const streak = s.streak?.last && (new Date(today()) - new Date(s.streak.last)) / 864e5 <= 1 ? s.streak.count : 0;
  el.innerHTML = `
  <div class="eyebrow">Belajar</div><h1>Jalur setapak antropologi</h1>
  <p class="lede">Lima menit sekali jalan. Ada bacaan pendek, pertanyaan kecil, dan sesekali ajakan menulis catatan refleksi. Alon-alon asal kelakon.</p>
  <div class="grid g3 learn-stats">
    <div class="card"><div class="eyebrow">Perjalananmu</div><b class="big-num">${done}/${total}</b> pelajaran
      <div class="progress" style="margin-top:8px"><i style="width:${total ? done / total * 100 : 0}%"></i></div>
      <small class="muted">✦ ${s.xp} XP · 🔥 ${streak} hari berturut-turut</small></div>
    ${rc ? `<a class="card dew" href="#/lesson/review" style="text-decoration:none;color:inherit"><div class="eyebrow">Ulang sebentar</div><b class="head">${rc} pertanyaan untuk diulang →</b><br><small class="muted">Yang meleset kembali lagi sampai nempel.</small></a>`
      : `<div class="card dew"><div class="eyebrow">Ulang sebentar</div><b class="head">Belum ada yang perlu diulang</b><br><small class="muted">Pertanyaan yang meleset akan terkumpul di sini.</small></div>`}
    <a class="card water" href="#notebook" style="text-decoration:none;color:inherit"><div class="eyebrow">Buku catatan refleksi</div><b class="head">${refl.length} catatan</b><br><small class="muted">Jawaban refleksimu, siap diunduh jadi Markdown.</small></a>
  </div>
  <div class="trail">${UNITS.map((u, ui) => `
    <section class="trail-unit">
      <div class="unit leaf"><div class="row between"><h2>${u.icon || '🌿'} ${esc(u.title)}</h2><small>${u.lessons.filter(l => isDone(l.id)).length}/${u.lessons.length}</small></div><small>${esc(u.blurb || '')}</small></div>
      <ol class="nodes">${u.lessons.map((l, li) => {
        const cls = isDone(l.id) ? 'done' : isOpen(l) ? 'open' : 'locked';
        const ic = cls === 'done' ? '✓' : cls === 'locked' ? '·' : l.steps.some(x => x.t === 'reflect') ? '✎' : l.steps.some(x => x.t === 'read') ? '📖' : '★';
        const best = s.lessons[l.id]?.best;
        return `<li class="node ${cls} side-${li % 4}">${cls === 'locked'
          ? `<span class="node-in" aria-disabled="true"><span class="disc" aria-hidden="true">${ic}</span><span class="node-txt"><b>${esc(l.title)}</b><small class="muted">Terbuka setelah pelajaran sebelumnya</small></span></span>`
          : `<a class="node-in" href="#/lesson/${encodeURIComponent(l.id)}"><span class="disc" aria-hidden="true">${ic}</span><span class="node-txt"><b>${esc(l.title)}</b><small class="muted">${esc(l.blurb || '')}${best != null ? ` · terbaik ${best}%` : ''}</small></span></a>`}</li>`;
      }).join('')}</ol>
    </section>`).join('') || '<div class="empty">Pelajaran sedang disiapkan.</div>'}
  </div>
  <div class="spacer"></div>
  <section class="card" id="notebook">
    <div class="row between"><div><div class="eyebrow">Buku catatan refleksi</div><h2 style="margin:0">Catatan lapanganmu dari pelajaran</h2></div>
      ${refl.length ? '<button class="btn soft" id="dlNotes" type="button">⬇ Unduh semua (.md)</button>' : ''}</div>
    ${refl.length ? `<div class="notebook">${refl.map(r => `
      <article class="note">
        <div class="note-q">${esc(String(r.q).replace(/<[^>]+>/g, ''))}</div>
        <div class="note-a">${esc(r.text).replace(/\n/g, '<br>')}</div>
        <small class="muted">${esc(r.lesson ? r.lesson.title : r.key)}${r.at ? ' · ' + esc(fmtDate(r.at)) : ''}</small>
        <div class="row" style="margin-top:6px"><button class="btn sm ghost" data-del="${esc(r.key)}" type="button">Hapus</button>${r.lesson ? `<a class="btn sm ghost" href="#/lesson/${encodeURIComponent(r.lesson.id)}">Buka pelajaran</a>` : ''}</div>
      </article>`).join('')}</div>`
      : '<div class="empty">Belum ada catatan. Saat pelajaran mengajakmu merenung, jawabanmu disimpan di sini. Ora popo kalau dilewati dulu.</div>'}
  </section>`;
  const dl = $('#dlNotes', el);
  if (dl) dl.onclick = () => download(`buku-catatan-refleksi-${today()}.md`, notebookMarkdown(), 'text/markdown');
  $$('[data-del]', el).forEach(b => b.onclick = () => {
    if (!confirm('Hapus catatan refleksi ini?')) return;
    delete S().notes[b.dataset.del]; save(); toast('Catatan dihapus'); renderLearn(el);
  });
  drawTrail(el);
  const nb = el.querySelector('a[href="#notebook"]');
  if (nb) nb.onclick = e => { e.preventDefault(); $('#notebook', el).scrollIntoView({ behavior: 'smooth' }); };
}

/* winding footpath: a dashed curve through the node discs, redrawn when the layout changes */
function drawTrail(el) {
  const draw = () => {
    $$('.nodes', el).forEach(ol => {
      ol.querySelector('svg.trail-line')?.remove();
      const box = ol.getBoundingClientRect();
      const pts = $$('.disc', ol).map(d => { const r = d.getBoundingClientRect(); return [r.left + r.width / 2 - box.left, r.top + r.height / 2 - box.top]; });
      if (pts.length < 2) return;
      let d = `M${pts[0][0]},0 L${pts[0][0]},${pts[0][1]}`;
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], my = (y0 + y1) / 2;
        d += ` C${x0},${my} ${x1},${my} ${x1},${y1}`;
      }
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'trail-line'); svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('width', box.width); svg.setAttribute('height', box.height);
      svg.innerHTML = `<path d="${d}" />`;
      ol.prepend(svg);
    });
  };
  requestAnimationFrame(draw);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => el.isConnected && draw());
  if (window.ResizeObserver) {
    const t = el.querySelector('.trail'); if (!t) return;
    let w = t.clientWidth;
    const ro = new ResizeObserver(() => { if (!t.isConnected) return ro.disconnect(); if (t.clientWidth !== w) { w = t.clientWidth; draw(); } });
    ro.observe(t);
  }
}

/* ---------------- lesson runner ---------------- */
export async function renderLesson(el, id) {
  let lesson, isReview = id === 'review';
  if (isReview) {
    const items = S().review.slice(0, 8).map(r => {
      const l = ALL_LESSONS.find(x => x.id === r.lesson); const st = l?.steps[r.idx];
      return st && GRADED.has(st.t) ? { ...st, _ref: r } : null;
    }).filter(Boolean);
    if (!items.length) { S().review = S().review.filter(r => { const l = ALL_LESSONS.find(x => x.id === r.lesson); return l && GRADED.has(l.steps[r.idx]?.t); }); save(); location.hash = '#/learn'; return; }
    lesson = { id: 'review', title: 'Ulang sebentar', steps: items };
  } else {
    lesson = ALL_LESSONS.find(l => l.id === id);
    if (!lesson) { el.innerHTML = '<div class="empty">Pelajaran tidak ditemukan. <a href="#/learn">Kembali ke jalur</a></div>'; return; }
  }

  const queue = lesson.steps.map((_, i) => i);
  const firstTry = {}; const retried = new Set();
  let pos = 0;
  const questions = lesson.steps.filter(s => GRADED.has(s.t)).length;

  el.innerHTML = `<div class="lesson">
    <div class="lesson-top"><a href="#/learn" title="Keluar dari pelajaran" aria-label="Keluar dari pelajaran">✕</a><div class="progress" role="progressbar" aria-label="Kemajuan pelajaran"><i id="lp" style="width:0%"></i></div><span class="muted" id="lcount"></span></div>
    <div class="lesson-title muted">${esc(lesson.title)}</div>
    <div id="stepBox"></div>
    <div class="lesson-foot"><button class="btn ghost" id="skipBtn" type="button">Lewati</button><button class="btn big" id="mainBtn" type="button">Lanjut</button></div>
  </div>`;
  const box = $('#stepBox', el), main = $('#mainBtn', el), skip = $('#skipBtn', el);

  const finish = () => {
    const correct = Object.values(firstTry).filter(Boolean).length;
    const pct = questions ? Math.round(correct / questions * 100) : 100;
    const xp = 10 + correct * 2;
    addXP(xp);
    if (!isReview) {
      const prev = S().lessons[lesson.id];
      S().lessons[lesson.id] = { done: true, best: Math.max(pct, prev?.best || 0), at: today() };
      lesson.steps.forEach((s, i) => {
        if (GRADED.has(s.t) && firstTry[i] === false && !S().review.some(r => r.lesson === lesson.id && r.idx === i))
          S().review.push({ lesson: lesson.id, idx: i, due: today() });
      });
    }
    save();
    window.dispatchEvent(new Event('fromodyssey:stats'));
    const nl = nextLesson();
    el.innerHTML = `<div class="lesson"><div class="card celebrate leaf">
      <div class="big" aria-hidden="true">${pct >= 80 ? '🌺' : pct >= 50 ? '🌱' : '🐢'}</div>
      <h2>${isReview ? 'Ulangan selesai' : 'Pelajaran selesai'}</h2>
      <div class="xp">+${xp} XP</div>
      <p class="muted">${questions ? `${correct} dari ${questions} benar di percobaan pertama (${pct}%).` : ''} ${pct < 60 ? 'Yang meleset akan kembali di "Ulang sebentar", begitulah cara ingatan menempel.' : 'Bagus sekali, pelan-pelan tapi sampai.'}</p>
      <div class="joke-done"><span class="hand">sambil istirahat…</span><p>${esc(randomJoke())}</p></div>
      <div class="row" style="justify-content:center">${nl ? `<a class="btn big" href="#/lesson/${encodeURIComponent(nl.lesson.id)}">Berikutnya: ${esc(nl.lesson.title)} →</a>` : ''}<a class="btn ghost" href="#/learn">Kembali ke jalur</a></div>
    </div></div>`;
  };

  const show = () => {
    if (pos >= queue.length) return finish();
    const i = queue[pos], st = lesson.steps[i];
    $('#lp', el).style.width = (pos / queue.length * 100) + '%';
    $('#lcount', el).textContent = `${pos + 1}/${queue.length}`;
    skip.style.visibility = GRADED.has(st.t) ? 'visible' : 'hidden';
    skip.textContent = 'Lewati';
    box.innerHTML = '';
    const step = document.createElement('div'); step.className = 'step'; box.appendChild(step);
    const done = (ok) => {
      if (GRADED.has(st.t) && !(i in firstTry)) firstTry[i] = ok;
      if (isReview && ok && st._ref) { S().review = S().review.filter(r => !(r.lesson === st._ref.lesson && r.idx === st._ref.idx)); save(); }
      if (!ok && GRADED.has(st.t) && !retried.has(i)) { retried.add(i); queue.push(i); }
      main.textContent = 'Lanjut'; main.disabled = false;
      main.onclick = () => { pos++; show(); };
    };
    skip.onclick = () => { if (GRADED.has(st.t) && !(i in firstTry)) firstTry[i] = false; pos++; show(); };
    const fn = STEP[st.t];
    if (!fn) { step.innerHTML = `<div class="notice">Jenis langkah “${esc(st.t)}” belum dikenal. Lewati saja.</div>`; main.textContent = 'Lanjut'; main.disabled = false; main.onclick = () => { pos++; show(); }; return; }
    const ref = st._ref ? st._ref : { lesson: lesson.id, idx: i };
    fn(step, st, main, done, ref, { pos, next: () => { pos++; show(); } });
  };
  show();
}

function feedback(step, ok, why, extra = '') {
  const f = document.createElement('div');
  f.className = 'feedback ' + (ok ? 'ok' : 'no');
  f.setAttribute('role', 'status');
  f.innerHTML = `<b>${ok ? pick(['Betul!', 'Tepat.', 'Nah, itu dia.', 'Mantap.', 'Iya, persis.']) : 'Belum pas.'}</b>${why || ''}${extra}`;
  step.appendChild(f);
  f.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}
const pick = a => a[Math.floor(Math.random() * a.length)];
const shuffle = a => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };

const STEP = {
  learn(step, st, main, done) {
    step.innerHTML = `<div class="card leaf"><h2>${st.title || ''}</h2><div class="learn-body">${st.body || ''}</div></div>`;
    main.textContent = 'Paham →'; main.disabled = false;
    main.onclick = () => { done(true); main.click(); };
  },
  mcq(step, st, main, done) {
    const order = shuffle(st.options.map((o, k) => k));
    step.innerHTML = `<div class="prompt">${st.q}</div><div class="opts">${order.map(k => `<button class="opt" type="button" data-k="${k}">${st.options[k]}</button>`).join('')}</div>`;
    let sel = null, checked = false;
    main.textContent = 'Periksa'; main.disabled = true;
    $$('.opt', step).forEach(b => b.onclick = () => { if (checked) return; $$('.opt', step).forEach(x => x.classList.remove('sel')); b.classList.add('sel'); sel = +b.dataset.k; main.disabled = false; });
    main.onclick = () => {
      checked = true;
      const ok = sel === st.a;
      $$('.opt', step).forEach(b => { b.disabled = true; if (+b.dataset.k === st.a) b.classList.add('right'); else if (+b.dataset.k === sel) b.classList.add('wrong'); });
      feedback(step, ok, st.why ? ' ' + st.why : ''); done(ok);
    };
  },
  fill(step, st, main, done) {
    step.innerHTML = `<div class="prompt">${st.q}</div><input type="text" id="fillIn" placeholder="Ketik jawabanmu" autocomplete="off" aria-label="Jawaban">`;
    const inp = $('#fillIn', step); inp.focus();
    main.textContent = 'Periksa'; main.disabled = true;
    inp.oninput = () => main.disabled = !inp.value.trim();
    const norm = v => String(v).trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[.\s]+$/, '').replace(/\s+/g, ' ');
    const check = () => {
      const v = norm(inp.value);
      const ok = st.answers.some(a => norm(a) === v);
      inp.disabled = true;
      feedback(step, ok, ' ' + (ok ? '' : `Jawabannya: <b>${esc(st.answers[0])}</b>. `) + (st.why || '')); done(ok);
    };
    inp.onkeydown = e => { if (e.key === 'Enter' && inp.value.trim() && !inp.disabled) check(); };
    main.onclick = check;
  },
  order(step, st, main, done) {
    const pool = shuffle(st.items.map((t, k) => k));
    const ans = []; let checked = false;
    step.innerHTML = `<div class="prompt">${st.q}</div><div class="order-ans" id="oa" aria-label="Urutanmu"></div><div class="order-pool" id="op"></div><small class="muted">Ketuk sesuai urutan. Ketuk yang sudah ditaruh untuk mengembalikannya.</small>`;
    const draw = () => {
      $('#oa', step).innerHTML = ans.map(k => `<button class="opt" type="button" data-k="${k}">${esc(st.items[k])}</button>`).join('') || '<span class="muted" style="padding:6px">…</span>';
      $('#op', step).innerHTML = pool.filter(k => !ans.includes(k)).map(k => `<button class="opt" type="button" data-k="${k}">${esc(st.items[k])}</button>`).join('');
      $$('#oa .opt', step).forEach(b => b.onclick = () => { if (checked) return; ans.splice(ans.indexOf(+b.dataset.k), 1); draw(); });
      $$('#op .opt', step).forEach(b => b.onclick = () => { if (checked) return; ans.push(+b.dataset.k); draw(); });
      main.disabled = ans.length !== st.items.length;
    };
    main.textContent = 'Periksa'; draw();
    main.onclick = () => {
      checked = true;
      const ok = ans.every((k, idx) => k === idx);
      $$('#oa .opt', step).forEach((b, idx) => b.classList.add(+b.dataset.k === idx ? 'right' : 'wrong'));
      feedback(step, ok, ' ' + (ok ? '' : `Urutan yang tepat: ${st.items.map(esc).join(' → ')}. `) + (st.why || '')); done(ok);
    };
  },
  /* reflect {q, hint}: free-text field note, never graded, can be skipped */
  reflect(step, st, main, done, ref, nav) {
    const key = noteKey(ref.lesson, ref.idx);
    const prev = S().notes?.[key];
    step.innerHTML = `<div class="reflect leaf">
      <div class="eyebrow">Catatan lapangan · refleksi</div>
      <div class="prompt">${st.q}</div>
      ${st.hint ? `<p class="margin-note">${esc(st.hint)}</p>` : ''}
      <textarea id="refIn" rows="6" aria-label="Catatan refleksimu" placeholder="Tulis sebebasnya. Tidak dinilai, hanya untukmu.">${esc(prev?.text || '')}</textarea>
      ${prev ? `<small class="muted">Tersimpan ${esc(fmtDate(prev.at))}. Ubah kalau mau.</small>` : ''}
      <div class="row" style="margin-top:8px"><button class="btn ghost sm" id="refSkip" type="button">Lewati dulu</button></div>
    </div>`;
    const ta = $('#refIn', step);
    main.textContent = 'Simpan catatan →'; main.disabled = !ta.value.trim();
    ta.oninput = () => { main.disabled = !ta.value.trim(); };
    $('#refSkip', step).onclick = () => nav.next();
    main.onclick = () => {
      const text = ta.value.trim(); if (!text) return;
      S().notes = S().notes || {};
      S().notes[key] = { text, at: today() };
      save(); toast('Catatan disimpan di buku refleksi');
      nav.next();
    };
  },
  /* read {title, author, year, why, url?}: reading pointer card */
  read(step, st, main, done, ref, nav) {
    const key = noteKey(ref.lesson, ref.idx);
    const isRead = () => !!S().readDone?.[key];
    const draw = () => {
      step.innerHTML = `<article class="readcard leaf">
        <div class="eyebrow">Bacaan pilihan</div>
        <h2>${esc(st.title || '')}</h2>
        <div class="muted">${esc(st.author || '')}${st.year ? ' · ' + esc(st.year) : ''}</div>
        ${st.why ? `<p class="read-why">${st.why}</p>` : ''}
        <div class="row">
          ${st.url ? `<a class="btn soft" href="${esc(st.url)}" target="_blank" rel="noopener">Buka bacaan ↗</a>` : ''}
          <button class="btn ${isRead() ? '' : 'ghost'}" id="readTog" type="button" aria-pressed="${isRead()}">${isRead() ? '✓ Sudah kubaca' : 'Sudah kubaca'}</button>
        </div>
        ${isRead() ? `<small class="muted">Ditandai ${esc(fmtDate(S().readDone[key]))}.</small>` : '<small class="muted">Tidak harus sekarang. Tandai kalau sudah sempat.</small>'}
      </article>`;
      $('#readTog', step).onclick = () => {
        S().readDone = S().readDone || {};
        if (isRead()) delete S().readDone[key]; else S().readDone[key] = today();
        save(); toast(isRead() ? 'Ditandai sudah dibaca' : 'Tanda dibaca dihapus'); draw();
      };
    };
    draw();
    main.textContent = 'Lanjut →'; main.disabled = false;
    main.onclick = () => nav.next();
  },
};
