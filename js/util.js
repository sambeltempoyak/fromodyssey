// Shared helpers: storage, escaping, toast, dates, modal
const KEY = 'fromodyssey.v1';

export const SLUG = 'fromodyssey';

export const DEFAULT_KEYWORDS = [
  'masyarakat adat', 'indigenous', 'adat', 'dekolonisasi', 'decolonial', 'pluriverse', 'ontologi', 'gender',
  'pendidikan adat', 'indigenous education', 'soundscape', 'bunyi', 'listening', 'multimodal', 'etnografi',
  'ethnography', 'planetary futures', 'multispecies', 'Orang Rimba', 'Sumba', 'Indonesia', 'Southeast Asia',
  'anthropology', 'antropologi',
];

const DEFAULT_STATE = {
  profile: {
    name: 'Berta',
    homeScheme: false,           // show the "own-country scholarship" route (see ROUTES in radar.js)
    background: 'antropolog; S2 Anthropology and Planetary Futures (ANU); peneliti di Sokola Institute',
    keywords: [...DEFAULT_KEYWORDS], // scoring + paper search
    avoid: [],                   // words that make an opportunity NOT for her
    location: '',
    places: ['Australia', 'Belanda', 'Indonesia'],
    readingInterests: 'indigenous OR "masyarakat adat" OR pluriverse OR decolonial OR soundscape',
  },
  customKeywords: [],          // words she adds in the app: {w, at:'YYYY-MM-DD'}; used by scoring, reading, scout
  projects: ['Orang Rimba', 'Sumba', 'Semarang'], // field projects (used to file field data)
  notes: {},                   // reflection answers: 'lessonId:stepIdx' -> {text, at}
  readDone: {},                // reading pointers ticked: 'lessonId:stepIdx' -> date
  sound: false,                // forest soundscape on the home scene
  energy: 'normal',            // 'low' | 'normal'
  xp: 0,
  streak: { count: 0, last: null },
  activity: {},                // 'YYYY-MM-DD': xp earned that day
  lessons: {},                 // id: {done:true, best:score, at:date}
  review: [],                  // missed questions for spaced review: {lesson, idx, due}
  seen: {},                    // opportunity id -> 'saved'|'skip'|'later'
  tracker: [],                 // tracked opportunities with plan
  papers: [],                  // saved papers
  customOpps: [],              // added manually
  flags: {},                   // opportunity id -> {reason, note, at}  (marked not relevant)
  updatedAt: 0,                // last change (for syncing between devices)
};

let state = load();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw) return structuredClone(DEFAULT_STATE);
    return deepMerge(structuredClone(DEFAULT_STATE), raw);
  } catch (e) {
    return structuredClone(DEFAULT_STATE);
  }
}
function deepMerge(base, add) {
  for (const k of Object.keys(add)) {
    if (add[k] && typeof add[k] === 'object' && !Array.isArray(add[k]) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = deepMerge(base[k], add[k]);
    } else base[k] = add[k];
  }
  return base;
}
export const S = () => state;

/* All keywords: profile keywords + the ones she added herself (lower-cased, unique, in order). */
export function allKeywords() {
  const out = [], seen = new Set();
  const add = w => { const k = String(w || '').trim().toLowerCase(); if (k && !seen.has(k)) { seen.add(k); out.push(k); } };
  (state.profile?.keywords || []).forEach(add);
  (state.customKeywords || []).forEach(c => add(typeof c === 'string' ? c : c && c.w));
  return out;
}
export function save() {
  state.updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(state)); window.dispatchEvent(new Event('fromodyssey:saved')); } catch (e) { toast('Gagal menyimpan: penyimpanan browser penuh atau diblokir'); }
}
export function replaceState(obj) { state = deepMerge(structuredClone(DEFAULT_STATE), obj); save(); }
export function resetState() { state = structuredClone(DEFAULT_STATE); save(); }

export const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const today = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); }; // local date
export function daysBetween(a, b) { return Math.round((new Date(b) - new Date(a)) / 86400000); }
export function fmtDate(d) {
  if (!d) return '';
  const x = new Date(d); if (isNaN(x)) return d;
  return x.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}
export function daysLeft(d) {
  if (!d) return null; const x = new Date(d); if (isNaN(x)) return null;
  return Math.ceil((x - new Date(today())) / 86400000);
}
export function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

let toastTimer;
export function toast(msg) {
  const t = document.getElementById('toast'); if (!t) return;
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

export function addXP(n) {
  state.xp += n;
  const d = today();
  state.activity[d] = (state.activity[d] || 0) + n;
  const last = state.streak.last;
  if (last !== d) {
    if (last && daysBetween(last, d) === 1) state.streak.count += 1;
    else state.streak.count = 1;
    state.streak.last = d;
  }
  save();
}
export function streakAlive() {
  const last = state.streak.last; if (!last) return 0;
  const gap = daysBetween(last, today());
  return gap <= 1 ? state.streak.count : 0;
}

export function modal(html, onMount) {
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => { bg.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = e => { if (e.key === 'Escape') close(); };
  bg.addEventListener('click', e => { if (e.target === bg || e.target.closest('[data-close]')) close(); });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(bg);
  onMount && onMount(bg.querySelector('.modal'), close);
  return close;
}

export async function copyText(txt) {
  try { await navigator.clipboard.writeText(txt); toast('Tersalin'); }
  catch (e) {
    const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Tersalin'); } catch (_) { toast('Gagal menyalin. Pilih teksnya lalu salin manual, ya'); }
    ta.remove();
  }
}

export async function getJSON(url, fallback = null) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(r.status);
    return await r.json();
  } catch (e) { return fallback; }
}

export function download(name, text, type = 'application/json') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

export function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Gagal memuat ' + src));
    document.head.appendChild(s);
  });
}
