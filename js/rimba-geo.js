// ───────────────────────── inti: angka acak, derau, kurva, kuas ─────────────────────────
const TAU = Math.PI * 2, W0 = 1200, H0 = 1600;
const clamp = (x, a = 0, b = 1) => x < a ? a : x > b ? b : x;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth01 = t => t * t * (3 - 2 * t);
const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));

function RNG(seed) {
  let a = (seed * 2654435761) >>> 0 || 1;
  const f = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  f.r = (a, b) => a + (b - a) * f();
  f.g = () => (f() + f() + f() - 1.5) / 1.5;      // kira-kira gauss, -1..1
  f.pick = arr => arr[Math.floor(f() * arr.length)];
  return f;
}
function h2(x, y, s) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 1442695041); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = smooth01(x - xi), fy = smooth01(y - yi);
  const a = h2(xi, yi, s), b = h2(xi + 1, yi, s), c = h2(xi, yi + 1, s), d = h2(xi + 1, yi + 1, s);
  return lerp(lerp(a, b, fx), lerp(c, d, fx), fy);
}
function fbm(x, y, s = 0, oct = 4) { let v = 0, a = 0.5, f = 1, n = 0; for (let i = 0; i < oct; i++) { v += a * vnoise(x * f, y * f, s + i * 17); n += a; a *= 0.5; f *= 2; } return v / n; }
const n1 = (x, s = 0) => vnoise(x, 0.5, s) * 2 - 1;            // derau 1D, -1..1

// ── warna ──
function hex(c) { if (Array.isArray(c)) return c; c = c.replace('#', ''); if (c.length === 3) c = c.replace(/./g, m => m + m); const n = parseInt(c, 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(c1, c2, t) { const a = hex(c1), b = hex(c2); return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)]; }
function css(c, a = 1) { const v = hex(c); return `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${a})`; }
const INK = '#1e3442', INK2 = '#2d4b5c', PAPER = '#f1f1ea';

// ── titik & kurva ──
// P('x y, x y, …') -> [[x,y],…]
function P(s) { return s.trim().split(/\s*,\s*/).map(q => q.trim().split(/\s+/).map(Number)); }
function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return [0.5 * ((2 * p1[0]) + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
          0.5 * ((2 * p1[1]) + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)];
}
// kurva Catmull-Rom melalui titik kendali
function curve(pts, closed = false, seg = 7) {
  if (typeof pts === 'string') pts = P(pts);
  const n = pts.length, out = [];
  if (n < 3) return pts.slice();
  const get = i => closed ? pts[(i % n + n) % n] : pts[clamp(i, 0, n - 1)];
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) for (let j = 0; j < seg; j++) out.push(cr(get(i - 1), get(i), get(i + 1), get(i + 2), j / seg));
  if (!closed) out.push(pts[n - 1].slice());
  return out;
}
const blob = (pts, seg = 7) => curve(pts, true, seg);
function ell(cx, cy, rx, ry, rot = 0, n = 30) { const o = [], c = Math.cos(rot), s = Math.sin(rot); for (let i = 0; i < n; i++) { const a = i / n * TAU, x = Math.cos(a) * rx, y = Math.sin(a) * ry; o.push([cx + x * c - y * s, cy + x * s + y * c]); } return o; }
function bbox(pts) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const p of pts) { if (p[0] < a) a = p[0]; if (p[1] < b) b = p[1]; if (p[0] > c) c = p[0]; if (p[1] > d) d = p[1]; } return [a, b, c, d]; }
function inside(pts, x, y) { let k = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) { const a = pts[i], b = pts[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) k = !k; } return k; }
// goyang tepi mengikuti derau (tepi cat air tidak pernah lurus)
function rough(pts, amp = 1.2, seed = 1, freq = 0.07) {
  const n = pts.length, o = [];
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], p = pts[i];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const d = (fbm(p[0] * freq, p[1] * freq, seed, 3) - 0.5) * 2 * amp;
    o.push([p[0] + nx * d, p[1] + ny * d]);
  }
  return o;
}
// tabung: tulang (polyline) + lebar -> poligon (untuk dahan, kaki, ekor, belalai)
function tube(spine, w, close = true) {
  const n = spine.length, L = [], R = [];
  const wf = typeof w === 'function' ? w : (Array.isArray(w) ? t => { const x = t * (w.length - 1), i = Math.min(w.length - 2, Math.floor(x)); return lerp(w[i], w[i + 1], x - i); } : () => w);
  for (let i = 0; i < n; i++) {
    const a = spine[Math.max(0, i - 1)], b = spine[Math.min(n - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const h = wf(i / (n - 1)) / 2;
    L.push([spine[i][0] + nx * h, spine[i][1] + ny * h]); R.push([spine[i][0] - nx * h, spine[i][1] - ny * h]);
  }
  return close ? L.concat(R.reverse()) : { L, R };
}
function along(pts, t) { const x = clamp(t) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(x)), f = x - i; return [lerp(pts[i][0], pts[i + 1][0], f), lerp(pts[i][1], pts[i + 1][1], f), Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0])]; }
function xf(pts, ox, oy, rot = 0, sx = 1, sy = sx) { const c = Math.cos(rot), s = Math.sin(rot); return pts.map(p => { const x = p[0] * sx, y = p[1] * sy; return [ox + x * c - y * s, oy + x * s + y * c]; }); }
function rotAbout(pts, px, py, rot) { const c = Math.cos(rot), s = Math.sin(rot); return pts.map(p => { const x = p[0] - px, y = p[1] - py; return [px + x * c - y * s, py + x * s + y * c]; }); }

function trace(g, pts, closed = true) { g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]); if (closed) g.closePath(); }

// ── sapuan cat air: isi + pigmen mengendap + tepi menggelap ──
let _seed = 1;
function wash(g, pts, col, o = {}) {
  const seed = o.seed ?? (_seed += 7);
  const p = o.raw ? pts : rough(pts, o.rough ?? 1.3, seed);
  const r = RNG(seed), [x0, y0, x1, y1] = bbox(p), bw = x1 - x0, bh = y1 - y0, sz = Math.max(bw, bh);
  g.save();
  trace(g, p); g.globalAlpha = o.a ?? 0.86; g.fillStyle = css(col); g.fill();
  g.clip();
  if (o.grad) {           // [warna, x0,y0,x1,y1, alpha]
    const [c2, gx0, gy0, gx1, gy1, ga] = o.grad, lg = g.createLinearGradient(gx0, gy0, gx1, gy1);
    lg.addColorStop(0, css(c2, 0)); lg.addColorStop(1, css(c2, ga ?? 0.8)); g.globalAlpha = 1; g.fillStyle = lg; g.fillRect(x0, y0, bw, bh);
  }
  const nb = o.blobs ?? 4, dk = o.dark ?? mix(col, '#1c5d78', 0.35), lt = o.light ?? PAPER;
  for (let i = 0; i < nb; i++) {
    const cx = r.r(x0, x1), cy = r.r(y0, y1), rad = sz * r.r(0.18, 0.5), light = i % 2 === 0;
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, css(light ? lt : dk, light ? (o.la ?? 0.34) : (o.da ?? 0.26))); rg.addColorStop(1, css(light ? lt : dk, 0));
    g.globalAlpha = 1; g.fillStyle = rg; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
  }
  if (o.shade) {          // [dx,dy,kuat,warna?] : bayangan di sisi (dx,dy)
    const [dx, dy, k, sc] = o.shade, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    const lg = g.createLinearGradient(cx - dx * bw * 0.5, cy - dy * bh * 0.5, cx + dx * bw * 0.5, cy + dy * bh * 0.5);
    lg.addColorStop(0.35, css(sc ?? dk, 0)); lg.addColorStop(1, css(sc ?? dk, k)); g.globalAlpha = 1; g.fillStyle = lg; g.fillRect(x0, y0, bw, bh);
  }
  const e = o.edge ?? 0.3;
  if (e > 0) { trace(g, p); g.globalAlpha = e; g.strokeStyle = css(o.edgeCol ?? mix(col, '#1c5068', 0.45)); g.lineWidth = o.ew ?? 3.2; g.lineJoin = 'round'; g.stroke(); }
  g.restore();
  return p;
}
// noda lembut tanpa tepi (langit, kabut, cahaya)
function stain(g, x, y, rx, ry, col, a = 0.5, rot = 0) {
  g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(1, ry / rx);
  const rg = g.createRadialGradient(0, 0, 0, 0, 0, rx); rg.addColorStop(0, css(col, a)); rg.addColorStop(0.55, css(col, a * 0.55)); rg.addColorStop(1, css(col, 0));
  g.fillStyle = rg; g.fillRect(-rx, -rx, rx * 2, rx * 2); g.restore();
}
// ── garis tinta: sedikit gemetar, tebal-tipis ──
function ink(g, pts, o = {}) {
  if (typeof pts === 'string') pts = curve(pts, !!o.closed);
  const w = o.w ?? 1.25, seed = o.seed ?? (_seed += 3), wob = o.wob ?? 0.55, n = pts.length;
  if (n < 2) return;
  g.save(); g.strokeStyle = css(o.col ?? INK, o.a ?? 0.92); g.lineCap = 'round'; g.lineJoin = 'round';
  const q = pts.map((p, i) => [p[0] + n1(i * 0.31 + seed, seed) * wob, p[1] + n1(i * 0.29 + seed * 1.7, seed + 5) * wob]);
  if (o.closed) q.push(q[0]);
  const m = q.length, step = 3;
  for (let i = 0; i < m - 1; i += step) {
    const t = i / (m - 1), tp = o.taper === false || o.closed ? 1 : Math.min(1, 0.35 + Math.min(t, 1 - t) * 6);
    g.lineWidth = Math.max(0.35, w * tp * (0.72 + 0.5 * vnoise(i * 0.09, seed * 0.37, seed)));
    g.beginPath(); g.moveTo(q[i][0], q[i][1]); for (let j = i + 1; j <= Math.min(m - 1, i + step); j++) g.lineTo(q[j][0], q[j][1]); g.stroke();
  }
  g.restore();
}
// garis putus-putus sketsa (untuk kerut, tekstur)
function dashes(g, pts, o = {}) { const r = RNG(o.seed ?? (_seed += 3)); let i = 0; while (i < pts.length - 2) { const len = 2 + Math.floor(r() * (o.len ?? 6)); ink(g, pts.slice(i, i + len + 1), { ...o, seed: i + 3 }); i += len + 1 + Math.floor(r() * (o.gap ?? 3)); } }
// ── arsir: garis sejajar di dalam bentuk ──
function hatch(g, pts, o = {}) {
  const ang = o.ang ?? -0.9, gap = o.gap ?? 4, r = RNG(o.seed ?? (_seed += 5)), [x0, y0, x1, y1] = bbox(pts);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 2, c = Math.cos(ang), s = Math.sin(ang);
  g.save(); trace(g, pts); g.clip(); g.strokeStyle = css(o.col ?? INK2, o.a ?? 0.7); g.lineCap = 'round';
  for (let d = -R; d <= R; d += gap * r.r(0.75, 1.25)) {
    const ox = cx - s * d, oy = cy + c * d, a = r.r(-R, -R * 0.6), b = r.r(R * 0.6, R), j = r.r(-0.04, 0.04);
    g.lineWidth = (o.w ?? 1) * r.r(0.6, 1.3);
    g.beginPath(); g.moveTo(ox + c * a, oy + s * a); g.lineTo(ox + Math.cos(ang + j) * b, oy + Math.sin(ang + j) * b); g.stroke();
  }
  g.restore();
}
// ── bulu: goresan pendek. dir(x,y) -> sudut ──
function fur(g, pts, o = {}) {
  const r = RNG(o.seed ?? (_seed += 9)), [x0, y0, x1, y1] = bbox(pts), n = o.n ?? 120, len = o.len ?? 9;
  const dir = typeof o.dir === 'function' ? o.dir : () => (o.dir ?? 1.4);
  g.save(); g.strokeStyle = css(o.col ?? INK, o.a ?? 0.8); g.lineCap = 'round';
  let k = 0, tries = 0;
  while (k < n && tries < n * 8) {
    tries++; const x = r.r(x0, x1), y = r.r(y0, y1); if (!inside(pts, x, y)) continue; k++;
    const a = dir(x, y) + r.g() * (o.spread ?? 0.35), l = len * r.r(0.5, 1.3), bend = r.g() * 0.4;
    g.lineWidth = (o.w ?? 0.9) * r.r(0.6, 1.3);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + bend) * l * 0.5, y + Math.sin(a + bend) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.restore();
}
// bulu di sepanjang tepi (siluet berbulu)
function furEdge(g, pts, o = {}) {
  const r = RNG(o.seed ?? (_seed += 9)), n = pts.length, len = o.len ?? 8, every = o.every ?? 1;
  g.save(); g.strokeStyle = css(o.col ?? INK, o.a ?? 0.85); g.lineCap = 'round';
  for (let i = 0; i < n; i += every) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], p = pts[i]; let nx = (b[1] - a[1]), ny = -(b[0] - a[0]); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const sgn = o.inward ? -1 : 1, ang = Math.atan2(ny * sgn, nx * sgn) + (o.bias ?? 0) + r.g() * 0.5, L = len * r.r(0.4, 1.3), sx = p[0] - nx * sgn * L * 0.35, sy = p[1] - ny * sgn * L * 0.35;
    g.lineWidth = (o.w ?? 0.9) * r.r(0.6, 1.3);
    g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(ang) * L, sy + Math.sin(ang) * L); g.stroke();
  }
  g.restore();
}
// ── daun: dua busur + tulang daun ──
function leafPts(x, y, ang, len, wid, bend = 0, n = 10) {
  const L = [], R = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, w = wid * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9), cx = t * len, cy = bend * len * t * t;
    L.push([cx, cy - w]); R.push([cx, cy + w]);
  }
  return xf(L.concat(R.reverse()), x, y, ang);
}
function leaf(g, x, y, ang, len, wid, col, o = {}) {
  const bend = o.bend ?? 0, p = leafPts(x, y, ang, len, wid, bend);
  wash(g, p, col, { rough: 0.6, blobs: 2, edge: 0.25, a: o.a ?? 0.85, seed: o.seed, ...o.wash });
  if (o.ink !== false) {
    ink(g, p, { closed: true, w: o.w ?? 1.05, seed: o.seed });
    const mid = []; for (let i = 0; i <= 8; i++) { const t = i / 8; mid.push([t * len, bend * len * t * t]); }
    ink(g, xf(mid, x, y, ang), { w: 0.9 });
    const nv = o.veins ?? Math.max(0, Math.round(len / 9));
    for (let i = 1; i <= nv; i++) {
      const t = i / (nv + 1) * 0.86 + 0.06, w = wid * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.8)), 0.9) * 0.82, cx = t * len, cy = bend * len * t * t;
      for (const s of [-1, 1]) ink(g, xf([[cx, cy], [cx + len * 0.05, cy + s * w * 0.6], [cx + len * 0.1, cy + s * w]], x, y, ang), { w: 0.65, a: 0.8 });
    }
  }
  return p;
}
// tepi bergelombang seperti awan/tajuk
function scallop(cx, cy, rx, ry, o = {}) {
  const r = RNG(o.seed ?? 3), n = o.n ?? 11, pts = [];
  for (let i = 0; i < n * 9; i++) {
    const a = i / (n * 9) * TAU, k = Math.abs(Math.sin(a * n / 2 + (o.ph ?? 0))), m = 1 + (o.depth ?? 0.13) * (k - 0.5) + (fbm(Math.cos(a) * 1.5 + 5, Math.sin(a) * 1.5 + 5, o.seed ?? 3) - 0.5) * (o.wild ?? 0.35);
    pts.push([cx + Math.cos(a) * rx * m, cy + Math.sin(a) * ry * m]);
  }
  return o.rot ? rotAbout(pts, cx, cy, o.rot) : pts;
}
// ── kedip ──
function blink(t, ph = 0, every = 5.3) { const u = ((t + ph * 7.13) % every) / every, w = 0.16 / every; return u < w ? Math.abs(1 - 2 * u / w) : 1; }
function eye(ctx, x, y, r, open, o = {}) {
  ctx.save(); ctx.translate(x, y); if (o.rot) ctx.rotate(o.rot);
  const ry = r * (o.ry ?? 0.7) * Math.max(0.08, open);
  ctx.beginPath(); ctx.ellipse(0, 0, r, ry, 0, 0, TAU); ctx.fillStyle = css(o.white ?? '#f4f3ea'); ctx.fill();
  ctx.save(); ctx.clip(); ctx.beginPath(); ctx.arc(o.lx ?? 0, o.ly ?? 0, r * (o.iris ?? 0.62), 0, TAU); ctx.fillStyle = css(o.col ?? '#3b3a2c'); ctx.fill();
  ctx.beginPath(); ctx.arc(o.lx ?? 0, o.ly ?? 0, r * (o.pupil ?? 0.34), 0, TAU); ctx.fillStyle = '#10161c'; ctx.fill();
  ctx.beginPath(); ctx.arc((o.lx ?? 0) - r * 0.2, (o.ly ?? 0) - r * 0.22, r * 0.13, 0, TAU); ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fill(); ctx.restore();
  ctx.beginPath(); ctx.ellipse(0, 0, r, ry, 0, 0, TAU); ctx.strokeStyle = css(INK); ctx.lineWidth = o.lw ?? 1.1; ctx.stroke();
  ctx.restore();
}
// ── daftar lapisan: tiap modul mendaftar { z, name, build(S) -> draw(ctx,t) } ──
const SCENE = [];
const layer = (z, name, build) => SCENE.push({ z, name, build });
// ── gambar cepat per-bingkai (tanpa tekstur; dipakai untuk bagian yang bergerak) ──
function qline(c, pts, w = 1.2, col = INK, a = 0.9) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.strokeStyle = css(col, a); c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke(); }
function qfill(c, pts, col, a = 1) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fillStyle = css(col, a); c.fill(); }
// helai yang melambai: titik kendali + gelombang yang membesar ke ujung
function wave(ctrl, t, o = {}) {
  const pts = curve(ctrl, false, o.seg ?? 6), n = pts.length, amp = o.amp ?? 6, k = o.k ?? 5, sp = o.sp ?? 1.2, ph = o.ph ?? 0, out = [];
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1), a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1;
    const d = amp * Math.pow(u, o.pow ?? 1.4) * Math.sin(t * sp - u * k + ph);
    out.push([pts[i][0] + nx / l * d, pts[i][1] + ny / l * d]);
  }
  return out;
}
// bentuk berbulu: sapuan + goresan bulu di dalam + bulu di tepi
function hairy(g, pts, col, o = {}) {
  wash(g, pts, col, { a: o.a ?? 0.8, blobs: o.blobs ?? 5, edge: 0.08, rough: 2.2, dark: o.dark, da: o.da ?? 0.2, light: o.light, la: o.la ?? 0.4, shade: o.shade, seed: o.seed });
  const dir = typeof o.dir === 'function' ? o.dir : () => (o.dir ?? 1.5), ik = o.ink ?? '#4a3632';
  fur(g, pts, { n: o.n ?? 140, len: o.len ?? 10, dir, col: ik, a: o.fa ?? 0.6, spread: o.spread ?? 0.35, w: o.fw ?? 0.8, seed: o.seed });
  // tepi: goresan searah arus bulu, sedikit condong keluar -> kontur lembut berbulu
  const r = RNG((o.seed ?? 1) + 77), n = pts.length, L = (o.elen ?? (o.len ?? 10));
  g.save(); g.strokeStyle = css(ik, 0.75); g.lineCap = 'round';
  for (let i = 0; i < n; i += (o.every ?? 1)) for (let k = 0; k < (o.edens ?? 2); k++) {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n], p = pts[i]; let nx = (b[1] - a[1]), ny = -(b[0] - a[0]); const l = Math.hypot(nx, ny) || 1; nx /= l; ny /= l;
    const d = dir(p[0], p[1]) + r.g() * 0.45, dx = Math.cos(d) * 0.8 + nx * 0.35, dy = Math.sin(d) * 0.8 + ny * 0.35, len = L * r.r(0.4, 1.1), ox = p[0] + r.g() * 2 - nx * 2, oy = p[1] + r.g() * 2 - ny * 2;
    g.lineWidth = (o.fw ?? 0.8) * r.r(0.6, 1.3); g.beginPath(); g.moveTo(ox - dx * len * 0.4, oy - dy * len * 0.4); g.quadraticCurveTo(ox + nx, oy + ny, ox + dx * len * 0.6, oy + dy * len * 0.6); g.stroke();
  }
  g.restore();
}
// bintik/roset acak di dalam poligon
function spots(g, pts, o = {}) {
  const r = RNG(o.seed ?? 21), [x0, y0, x1, y1] = bbox(pts), n = o.n ?? 80, placed = [], min = o.min ?? 6;
  g.save(); g.strokeStyle = css(o.col ?? '#3d3a22', o.a ?? 0.85); g.fillStyle = css(o.col ?? '#3d3a22', o.a ?? 0.85); g.lineCap = 'round';
  let tries = 0;
  while (placed.length < n && tries++ < n * 30) {
    const x = r.r(x0, x1), y = r.r(y0, y1); if (!inside(pts, x, y)) continue; if (placed.some(p => Math.hypot(p[0] - x, p[1] - y) < min)) continue; placed.push([x, y]);
    const s = (o.size ?? 2.2) * r.r(0.7, 1.3), a = r.r(0, TAU);
    if (o.rosette && r() < 0.6) { g.lineWidth = s * 0.7; g.beginPath(); g.arc(x, y, s, a, a + r.r(2.6, 4.6)); g.stroke(); }
    else { g.beginPath(); g.ellipse(x, y, s * r.r(0.5, 0.9), s * r.r(0.3, 0.6), a, 0, TAU); g.fill(); }
  }
  g.restore();
}
// loreng: bentuk lensa (tebal di tengah, lancip di ujung) di sepanjang kurva
function stripe(g, ctrl, w = 5, col = '#2a4f62', a = 0.9) { const sp = curve(typeof ctrl === 'string' ? P(ctrl) : ctrl, false, 6), p = tube(sp, t => w * Math.sin(Math.PI * clamp(t * 0.9 + 0.05)) ** 0.8 + 0.3); g.save(); trace(g, rough(p, 0.5, sp.length)); g.fillStyle = css(col, a); g.fill(); g.restore(); }
// kelopak: bentuk tetes dengan ujung lebar
function petal(x, y, ang, len, wid, o = {}) { const n = 14, L = [], R = []; for (let i = 0; i <= n; i++) { const t = i / n, w = wid * 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(t, o.k ?? 0.6)), o.p ?? 0.7); L.push([t * len, -w]); R.push([t * len, w]); } return xf(L.concat(R.reverse()), x, y, ang); }
// putar titik mengelilingi poros (untuk menaruh mata pada kepala yang berputar)
function spin(px, py, rot, x, y, dy = 0) { const c = Math.cos(rot), s = Math.sin(rot); return [px + (x - px) * c - (y - py) * s, py + (x - px) * s + (y - py) * c + dy]; }
// ── semak: mengisi poligon dengan daun, pakis, rumput, arsir (murah: isi + satu-dua garis) ──
function qleaf(g, x, y, ang, len, wid, col, o = {}) {
  const p = leafPts(x, y, ang, len, wid, o.bend ?? 0, 7);
  g.save(); trace(g, p); g.fillStyle = css(col, o.a ?? 0.85); g.fill();
  if (o.edge !== false) { g.strokeStyle = css(mix(col, '#143a4a', 0.5), 0.35); g.lineWidth = 1.6; g.stroke(); }
  g.restore();
  if (o.ink !== false) { ink(g, p, { closed: true, w: o.w ?? 0.85, a: 0.85, wob: 0.4 }); const mid = xf([[0, 0], [len * 0.5, (o.bend ?? 0) * len * 0.25], [len * 0.94, (o.bend ?? 0) * len * 0.9]], x, y, ang); ink(g, mid, { w: 0.7, a: 0.7 });
    if (o.veins) for (let i = 1; i <= o.veins; i++) { const t = i / (o.veins + 1), q = along(mid, t); for (const s of [-1, 1]) ink(g, [[q[0], q[1]], [q[0] + Math.cos(ang + s * 0.9) * wid * 0.36, q[1] + Math.sin(ang + s * 0.9) * wid * 0.36]], { w: 0.55, a: 0.65 }); } }
}
function underbrush(g, poly, o = {}) {
  const r = RNG(o.seed ?? 5), [x0, y0, x1, y1] = bbox(poly), n = o.n ?? 60, size = o.size ?? 26, cols = o.cols ?? ['#58a76c', '#86bf7a', '#2c8c86', '#b4d488'];
  const kinds = o.kinds ?? ['leaf', 'leaf', 'leaf', 'dark', 'fern', 'grass', 'hatch'], pts = [];
  let tries = 0; while (pts.length < n && tries++ < n * 20) { const x = r.r(x0, x1), y = r.r(y0, y1); if (inside(poly, x, y)) pts.push([x, y]); }
  pts.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of pts) {
    const k = r.pick(kinds), s = size * r.r(0.6, 1.35), col = r.pick(cols);
    if (k === 'leaf') { const m = 2 + Math.floor(r() * 3), a0 = r.r(0, TAU); for (let i = 0; i < m; i++) qleaf(g, x, y, a0 + i * r.r(0.7, 1.3), s, s * r.r(0.34, 0.5), i % 2 ? col : r.pick(cols), { bend: r.g() * 0.2, veins: s > 24 ? 3 : 0 }); }
    else if (k === 'dark') { const m = 1 + Math.floor(r() * 3), a0 = r.r(0, TAU); for (let i = 0; i < m; i++) qleaf(g, x, y, a0 + i * 0.9, s * 0.9, s * 0.4, o.dark ?? '#1d6f7a', { ink: false, a: 0.8, bend: r.g() * 0.2 }); }
    else if (k === 'fern') fern(g, x, y, r.r(-2.6, -0.5), s * 1.6, r() < 0.5 ? '#4f9a5c' : (o.dark ?? '#1d6f7a'), { curl: r.g() * 0.6, n: 10, ink: false, a: 0.8 });
    else if (k === 'grass') { for (let i = 0; i < 5; i++) { const a = -1.57 + r.g() * 0.6, L = s * r.r(0.8, 1.5); ink(g, curve([[x + i * 2.5, y], [x + i * 2.5 + Math.cos(a) * L * 0.5, y + Math.sin(a) * L * 0.5], [x + i * 2.5 + Math.cos(a + r.g() * 0.4) * L, y + Math.sin(a) * L]]), { w: r.r(1, 2), col: r() < 0.5 ? (o.dark ?? '#1d6f7a') : '#3f8f5c', a: 0.8 }); } }
    else if (k === 'hatch') hatch(g, ell(x, y, s * 0.7, s * 0.45, r.r(0, 3)), { ang: r.r(-1.3, -0.6), gap: 3, col: o.dark ?? '#1d6f7a', a: 0.55 });
    else if (k === 'scal') { const p = scallop(x, y, s, s * 0.7, { seed: Math.round(x), n: 7, depth: 0.3, wild: 0.4 }); g.save(); trace(g, p); g.fillStyle = css(col, 0.55); g.fill(); g.restore(); ink(g, p.slice(0, Math.floor(p.length * 0.6)), { w: 0.85, col: INK2 }); }
  }
}
// belang-belang cat air: banyak bercak kecil bertumpuk
function mottle(g, poly, cols, o = {}) {
  const r = RNG(o.seed ?? 9), [x0, y0, x1, y1] = bbox(poly), n = o.n ?? 30, s = o.size ?? 60;
  g.save(); trace(g, poly); g.clip();
  for (let i = 0; i < n; i++) { const x = r.r(x0, x1), y = r.r(y0, y1), p = scallop(x, y, s * r.r(0.5, 1.3), s * r.r(0.35, 0.9), { seed: i * 7 + (o.seed ?? 0), n: 5, depth: 0.25, wild: 0.7, rot: r.r(0, 3) }); wash(g, p, r.pick(cols), { a: o.a ?? 0.4, blobs: 2, edge: 0.14, ew: 3, rough: 3, seed: i }); }
  for (let i = 0; i < (o.lights ?? n / 3); i++) stain(g, r.r(x0, x1), r.r(y0, y1), s * r.r(0.3, 0.7), s * r.r(0.2, 0.5), '#f6f8f0', o.la ?? 0.4);
  g.restore();
}
// ───────────────────────── langit, sapuan latar, cahaya tengah ─────────────────────────
const C = {
  sky: '#a5d2e8', sky2: '#c4e2ef', teal: '#2c8c86', teal2: '#1d6f7a', deep: '#185a6c', green: '#58a76c', green2: '#86bf7a',
  lime: '#b4d488', pale: '#d2e4b6', bark: '#c8c3a2', bark2: '#a9b3a0', cream: '#f6efcf', glow: '#f3e7a8',
  ele: '#b7cde0', ele2: '#86a9c8', peach: '#e6b095', peach2: '#d99878', face: '#cfdae8',
};
const BASE = [];   // lukisan dasar yang diam: langit, sapuan latar, batang — digabung jadi satu lembar
BASE.push(g => {
    const lg = g.createLinearGradient(0, 0, 0, 1000); lg.addColorStop(0, css('#c6e4f2')); lg.addColorStop(0.45, css('#e0f0f4')); lg.addColorStop(1, css('#f1f3ea'));
    g.fillStyle = lg; g.fillRect(0, 0, W0, H0);
    // sapuan biru: bercak-bercak kasar, menyisakan kertas putih sebagai awan
    const r = RNG(11);
    const patches = [[470, 60, 150, 90], [560, 190, 120, 110], [420, 300, 110, 80], [330, 130, 90, 60], [640, 330, 90, 70], [260, 330, 80, 60], [130, 40, 90, 70], [30, 330, 60, 120], [830, 110, 70, 60], [1010, 260, 50, 60], [1130, 520, 60, 50], [500, 440, 70, 40], [720, 120, 60, 50], [200, 520, 90, 50], [960, 230, 40, 60]];
    for (const [x, y, rx, ry] of patches) {
      const p = scallop(x, y, rx, ry, { seed: x + y, n: 7, depth: 0.2, wild: 0.6 });
      wash(g, p, '#a9d8ee', { a: 0.5, blobs: 5, edge: 0.12, ew: 5, rough: 5, dark: '#7fc2e2', da: 0.3, seed: x });
    }
    for (let i = 0; i < 26; i++) stain(g, r.r(250, 800), r.r(0, 520), r.r(40, 120), r.r(25, 60), i % 3 ? C.sky : '#ffffff', r.r(0.1, 0.3), r.r(-0.3, 0.3));
    stain(g, 520, 250, 160, 60, '#f7f8f4', 0.55, -0.2); stain(g, 640, 480, 150, 70, '#f7f8f4', 0.5);
  });
layer(0, 'dasar', S => {
  const sp = S.sprite(0, 0, W0, H0, g => { for (const f of BASE) f(g); });
  const clouds = []; const r = RNG(5);
  for (let i = 0; i < 5; i++) clouds.push({ y: r.r(40, 520), rx: r.r(90, 170), ry: r.r(28, 50), v: r.r(3, 7), ph: r.r(0, 900), a: r.r(0.28, 0.5) });
  const cs = S.sprite(-200, -80, 200, 80, g => { for (let i = 0; i < 7; i++) stain(g, n1(i * 3.1, 2) * 110, n1(i * 1.7, 4) * 26, 70 + i * 8, 30 + i * 3, '#fbfbf6', 0.34); });
  return (ctx, t) => {
    S.put(ctx, sp);
    for (const c of clouds) { const x = ((c.ph + t * c.v) % 900) + 150; S.put(ctx, cs, { px: 0, py: 0, dx: x, dy: c.y + Math.sin(t * 0.1 + c.ph) * 6, sx: c.rx / 130, sy: c.ry / 40, a: c.a * clamp(Math.min(x - 150, 1050 - x) / 150) }); }
  };
});

BASE.push(g => {
    const T = C.teal, D = C.teal2, G = C.green, G2 = C.green2, L = C.lime, Pa = C.pale;
    const R = (pts, cols, o = {}) => { const p = blob(pts); wash(g, p, cols[0], { a: o.a ?? 0.45, edge: 0.1, rough: 5, blobs: 6 }); mottle(g, p, cols, { n: o.n ?? 30, size: o.size ?? 55, a: o.ma ?? 0.42, seed: p.length + (o.seed ?? 0), la: o.la }); return p; };
    // ── sapuan dasar yang berbelang ──
    const A = R('0 380, 60 360, 150 420, 190 520, 180 720, 0 730', [T, G2, L, '#7fc3b6'], { n: 26 });
    const B = R('150 500, 260 460, 420 490, 480 600, 450 740, 300 770, 170 750', [Pa, L, G2, '#cfe6c8'], { n: 26, a: 0.6 });
    R('0 0, 120 0, 150 150, 90 330, 0 400', ['#9fd0e4', '#bfe0ee', G2], { n: 10 });
    const Cc = R('820 430, 1000 420, 1010 640, 830 650', ['#dfe9e2', L, G2], { n: 14 });
    const Dd = R('1000 600, 1200 540, 1200 920, 1100 900, 1020 800', [T, D, G, '#7fc3b6'], { n: 22 });
    const E = R('1090 0, 1200 0, 1200 620, 1130 600, 1100 300', ['#7fc3b6', T, G2], { n: 20 });
    const F = R('790 130, 900 150, 990 250, 1000 420, 830 440, 780 300', [G2, L, T, Pa], { n: 20 });
    R('600 170, 700 150, 790 220, 800 330, 700 350, 590 300', [Pa, L, '#e3efd6'], { n: 10, a: 0.6 });
    const H = R('0 960, 200 990, 430 975, 480 1150, 450 1420, 300 1600, 0 1600', [T, G, D, G2, '#3fa39a'], { n: 70, size: 60 });
    const I = R('650 850, 820 835, 1000 895, 1200 880, 1200 1600, 800 1600, 770 1300, 640 1100', [T, G, G2, D, '#3fa39a'], { n: 80, size: 60 });
    const Kk = R('0 700, 200 690, 480 720, 500 860, 470 1000, 0 990', ['#b9d6d0', G2, T, '#cfdde6', G], { n: 40, a: 0.6 });
    const J = R('660 850, 800 860, 830 1000, 760 1060, 650 1000', [G, L, G2], { n: 14 });
    // semak jauh kiri: garis awan-awanan
    for (const [x, y, rx, ry, s] of [[250, 545, 55, 40, 3], [330, 600, 60, 36, 4], [215, 640, 50, 30, 6], [400, 560, 40, 30, 8], [290, 500, 40, 26, 9]]) {
      const p = scallop(x, y, rx, ry, { seed: s, n: 9, depth: 0.3, wild: 0.4 });
      wash(g, p, s % 2 ? Pa : L, { a: 0.4, edge: 0.1, rough: 1 }); ink(g, p.slice(0, Math.floor(p.length * 0.62)), { w: 0.9, a: 0.75, col: INK2 });
    }
    // ── semak belukar ──
    underbrush(g, A, { n: 46, size: 26, seed: 1, cols: [G, G2, T, '#7fc3b6'], kinds: ['leaf', 'dark', 'dark', 'grass', 'grass', 'hatch', 'fern'] });
    underbrush(g, blob('180 640, 300 610, 440 640, 460 740, 300 770, 190 750'), { n: 30, size: 24, seed: 2, cols: [G, G2, L, Pa], kinds: ['leaf', 'leaf', 'scal', 'fern', 'hatch'] });
    underbrush(g, Cc, { n: 16, size: 22, seed: 3, cols: [G2, L, G], kinds: ['scal', 'leaf', 'grass'] });
    underbrush(g, Dd, { n: 50, size: 34, seed: 4, cols: [T, D, G, '#3fa39a'], kinds: ['leaf', 'dark', 'dark', 'leaf', 'hatch'] });
    underbrush(g, E, { n: 40, size: 34, seed: 5, cols: [T, D, G2, G], kinds: ['leaf', 'dark', 'leaf'] });
    underbrush(g, F, { n: 46, size: 24, seed: 6, cols: [G, G2, T, L], kinds: ['leaf', 'leaf', 'scal', 'dark', 'hatch'] });
    underbrush(g, Kk, { n: 90, size: 30, seed: 11, cols: [G, G2, T, '#3fa39a'], kinds: ['leaf', 'dark', 'dark', 'grass', 'hatch', 'fern'] });
    underbrush(g, H, { n: 330, size: 32, seed: 7, cols: [G, G2, T, '#3fa39a', L], kinds: ['leaf', 'leaf', 'dark', 'dark', 'fern', 'fern', 'grass', 'hatch'] });
    underbrush(g, I, { n: 380, size: 32, seed: 8, cols: [G, G2, T, '#3fa39a', L], kinds: ['leaf', 'leaf', 'dark', 'dark', 'fern', 'grass', 'hatch', 'hatch'] });
    underbrush(g, J, { n: 26, size: 24, seed: 9, cols: [G, L, G2], kinds: ['leaf', 'fern', 'scal', 'hatch'] });
    underbrush(g, blob('780 940, 960 930, 980 1060, 800 1070'), { n: 40, size: 26, seed: 10, cols: [G, T, G2, D], kinds: ['leaf', 'dark', 'fern', 'hatch'] });
  });

// cahaya di tengah: tubuh sang perempuan yang menjadi air terjun
layer(3, 'cahaya', S => {
  const sp = S.sprite(440, 540, 740, 990, g => {
    stain(g, 585, 760, 150, 230, '#fdfcf6', 0.95); stain(g, 580, 880, 105, 90, C.cream, 0.9); stain(g, 520, 920, 50, 50, '#f0dfa4', 0.6);
    stain(g, 665, 900, 40, 70, '#dfe08a', 0.6); stain(g, 590, 945, 90, 22, '#f3e9a0', 0.75); stain(g, 560, 830, 70, 60, '#fffef8', 0.7);
  });
  return (ctx, t) => { S.put(ctx, sp, { px: 585, py: 820, sx: 1 + 0.012 * Math.sin(t * 0.7), sy: 1 + 0.015 * Math.sin(t * 0.7), a: 0.92 + 0.08 * Math.sin(t * 0.9) }); };
});
// ───────────────────────── pohon: batang, dahan, tajuk, rumpun daun ─────────────────────────
// dahan = tabung di sepanjang kurva; diberi kulit, arsir sisi gelap, dan garis tinta
function limb(g, spineStr, w, o = {}) {
  const sp = curve(typeof spineStr === 'string' ? P(spineStr) : spineStr, false, 8), poly = tube(sp, w), col = o.col ?? C.bark;
  wash(g, poly, col, { a: o.a ?? 0.9, blobs: 6, rough: 1.5, edge: 0.2, dark: o.dark ?? '#7fa39a', da: 0.3, ...o.wash });
  const { L, R } = tube(sp, w, false);
  // sisi gelap: arsir miring
  if (o.hatch !== false) {
    const side = o.side ?? 1, inner = tube(sp, typeof w === 'function' ? t => w(t) * 0.25 : Array.isArray(w) ? w.map(v => v * 0.25) : w * 0.25, false);
    const band = (side > 0 ? L : R).concat((side > 0 ? inner.L : inner.R).slice().reverse());
    hatch(g, band, { ang: o.hang ?? -1.0, gap: o.hgap ?? 3.6, col: o.hcol ?? C.teal2, a: 0.6, w: 1.1 });
  }
  ink(g, L, { w: o.iw ?? 1.3 }); ink(g, R, { w: o.iw ?? 1.3 });
  // goresan kulit kayu searah serat
  const r = RNG(o.seed ?? sp.length);
  for (let i = 0; i < (o.marks ?? sp.length / 3); i++) {
    const t = r(), k = r.r(-0.32, 0.32), a = along(sp, t), b = along(sp, Math.min(1, t + r.r(0.02, 0.06)));
    const wd = (typeof w === 'function' ? w(t) : Array.isArray(w) ? lerp(w[0], w[w.length - 1], t) : w);
    const nx = -Math.sin(a[2]), ny = Math.cos(a[2]);
    ink(g, [[a[0] + nx * wd * k, a[1] + ny * wd * k], [b[0] + nx * wd * k, b[1] + ny * wd * k]], { w: 0.8, a: 0.6, col: INK2 });
  }
  return sp;
}
function canopy(g, x, y, rx, ry, col, seed, o = {}) {
  const p = scallop(x, y, rx, ry, { seed, n: o.n ?? 9, depth: 0.32, wild: 0.45 });
  wash(g, p, col, { a: o.a ?? 0.78, blobs: 5, rough: 0.8, edge: 0.22, dark: C.teal2, da: 0.4, shade: [0.2, 1, 0.45, C.teal2] });
  // arsir tegak di separuh bawah
  const low = p.filter(q => q[1] > y - ry * 0.05); if (low.length > 4) hatch(g, low, { ang: Math.PI / 2 + 0.08, gap: 3.4, col: C.teal2, a: 0.55, w: 1 });
  ink(g, p, { closed: true, w: 1.05, col: INK2 });
  const r = RNG(seed * 3 + 1);
  for (let i = 0; i < (o.arcs ?? 3); i++) { const ax = x + r.r(-0.5, 0.5) * rx, ay = y + r.r(-0.5, 0.3) * ry, q = scallop(ax, ay, rx * 0.4, ry * 0.35, { seed: seed + i, n: 5, depth: 0.4 }); ink(g, q.slice(0, Math.floor(q.length * r.r(0.3, 0.55))), { w: 0.85, col: INK2, a: 0.8 }); }
}

BASE.push(g => {
    // batang pucat jauh
    limb(g, '890 430, 888 520, 892 650', 22, { col: '#c9dbe2', hatch: false, a: 0.7, marks: 3 });
    limb(g, '1010 400, 1005 500, 1000 640', 20, { col: '#c9dbe2', hatch: false, a: 0.6, marks: 3 });
    limb(g, '405 480, 410 580, 400 700, 395 780', [14, 22], { col: '#5d9aa0', hcol: C.deep, a: 0.8 });
    limb(g, '365 400, 372 470, 392 520, 404 560', [8, 13], { col: '#6aa3a0', a: 0.8 });
    limb(g, '520 330, 500 400, 470 470, 420 520', [6, 12], { col: '#6aa3a0', a: 0.7 });
    limb(g, '440 560, 500 548, 560 540, 600 520', [9, 5], { col: '#6aa3a0', a: 0.7 });
    // ── pohon kiri ──
    limb(g, '30 0, 34 60, 52 150, 68 250, 72 400', [10, 18], { col: '#9cc4c4', hcol: C.teal2 });
    limb(g, '106 770, 104 640, 102 520, 110 400, 128 320, 146 262', [64, 58, 54, 52, 48], { side: 1, hgap: 4, hcol: C.teal2, col: C.bark, marks: 24 });
    limb(g, '140 292, 200 246, 262 190, 322 132, 384 60, 416 -6', [50, 46, 42, 36, 30], { side: -1, col: '#c3c8a6' });
    limb(g, '150 276, 240 262, 320 268, 398 282, 440 290', [20, 16, 9, 4], { side: -1, col: '#b9c2a8', hgap: 3 });
    limb(g, '296 262, 350 250, 410 236, 462 230, 492 222', [9, 7, 4], { hatch: false, col: '#b0b8a4' });
    // dahan macan tutul: tebal, ujungnya patah bercincin
    limb(g, '118 524, 170 484, 225 458, 276 448', [58, 52, 48, 44], { side: -1, col: '#bfcfc8', hcol: C.teal2, marks: 18 });
    for (let i = 0; i < 4; i++) ink(g, ell(276, 449, 17 - i * 4, 23 - i * 5, 0.25), { closed: true, w: 0.9 });
    // ── pohon kanan ──
    limb(g, '1046 -6, 1046 150, 1042 300, 1010 470, 980 600, 968 800, 958 1000, 950 1250', [92, 92, 88, 72, 66, 70, 78, 84], { side: -1, hang: -1.1, hgap: 4.2, col: '#c9c6a6', marks: 40 });
    limb(g, '1080 215, 1120 170, 1170 110, 1210 70', [40, 32, 26], { side: 1, col: '#c0c9a0' });
    limb(g, '1012 172, 955 144, 900 112, 850 58, 800 22, 770 0', [40, 36, 34, 30, 24], { side: 1, col: '#c9c4a0' });
    limb(g, '960 142, 920 136, 870 134, 820 136, 790 140', [8, 8, 7, 5], { hatch: false, col: '#b9b79a' });
    limb(g, '845 252, 880 322, 930 400, 975 440, 1010 490, 1050 540, 1078 572', [10, 13, 16, 18, 20, 18], { col: '#a98c78', hcol: '#5f4a44', hgap: 3 });
    limb(g, '690 930, 730 1030, 772 1130, 806 1210, 836 1290', [8, 10, 11], { col: '#cdbb8c', hatch: false });
    limb(g, '90 1205, 160 1140, 230 1070, 300 1005', [34, 30, 24], { col: '#a9b98c', side: 1, hcol: '#4d7a5a', marks: 14 });
    // sulur di batang kanan
    for (let i = 0; i < 4; i++) ink(g, curve(P(`${940 + i * 9} ${860 + i * 14}, ${965 + i * 5} ${880 + i * 10}, ${985} ${870 + i * 16}, ${1012} ${890 + i * 14}`)), { w: 1.3, col: '#3f6b54' });
});

layer(5, 'tajuk', S => {
  // tiap tajuk satu sprite kecil supaya bisa bergoyang sendiri
  const defs = [
    [330, 430, 46, 34, C.teal, 1], [392, 462, 44, 30, C.green, 2], [318, 486, 40, 28, C.teal, 3], [372, 522, 46, 26, C.teal2, 4], [452, 420, 40, 30, C.green, 5],
    [486, 372, 34, 26, C.teal, 6], [438, 498, 30, 22, C.green2, 7], [508, 300, 30, 24, C.green2, 8], [470, 560, 34, 18, C.green, 30],
    [652, 210, 58, 38, C.pale, 9], [640, 286, 52, 34, C.lime, 10], [708, 262, 44, 30, C.green2, 11], [690, 318, 40, 22, C.green, 12],
    [870, 190, 44, 34, C.green, 13], [830, 250, 40, 30, C.teal, 14], [880, 300, 36, 30, C.green2, 15], [830, 330, 34, 26, C.teal, 16], [985, 300, 22, 60, C.green, 17],
    [860, 420, 40, 26, C.teal, 18], [1150, 620, 60, 50, C.teal2, 19], [1120, 800, 50, 40, C.teal, 20], [800, 600, 26, 44, C.green, 21],
  ];
  const sps = defs.map(([x, y, rx, ry, col, seed]) => ({ x, y, ry, seed, s: S.sprite(x - rx * 1.3, y - ry * 1.4, x + rx * 1.3, y + ry * 1.4, g => canopy(g, x, y, rx, ry, col, seed)) }));
  return (ctx, t) => { for (const c of sps) S.put(ctx, c.s, { px: c.x, py: c.y + c.ry, rot: 0.02 * Math.sin(t * 0.7 + c.seed * 1.3), skx: 0.03 * Math.sin(t * 0.9 + c.seed) }); };
});

// rumpun daun: daun-daun memancar dari satu buku; bergoyang pelan
function cluster(S, x, y, leaves, o = {}) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [a, len] of leaves) { const ex = x + Math.cos(a) * len, ey = y + Math.sin(a) * len; x0 = Math.min(x0, ex, x); y0 = Math.min(y0, ey, y); x1 = Math.max(x1, ex, x); y1 = Math.max(y1, ey, y); }
  const m = o.m ?? 30;
  const s = S.sprite(x0 - m, y0 - m, x1 + m, y1 + m, g => {
    if (o.stem) limb(g, o.stem, o.stemW ?? 4, { hatch: false, col: '#9fb090', marks: 0 });
    leaves.forEach(([a, len, wid, col, bend], i) => leaf(g, x + Math.cos(a) * (o.gap ?? 3), y + Math.sin(a) * (o.gap ?? 3), a, len, wid ?? len * 0.5, col ?? C.green2, { bend: bend ?? 0, veins: o.veins, seed: (o.seed ?? 1) * 31 + i, ink: o.ink, a: o.a }));
  });
  return { s, x, y, ph: (x * 0.013 + y * 0.007) % TAU, amp: o.amp ?? 0.03 };
}
layer(6, 'daun', S => {
  const G = C.green2, T = C.teal, D = C.teal2, L = C.lime, Pa = C.pale;
  const cl = [
    // jati-jatian di kanan atas (helai besar bertulang)
    cluster(S, 700, 40, [[2.9, 78, 50, G], [2.2, 70, 44, Pa], [0.5, 66, 44, G], [-0.5, 60, 40, L], [-2.6, 50, 34, G]], { seed: 1 }),
    cluster(S, 748, 112, [[2.6, 70, 46, L], [1.7, 74, 48, G], [0.6, 62, 40, Pa], [-0.3, 54, 36, G], [-1.6, 60, 40, L]], { seed: 2 }),
    cluster(S, 742, 190, [[2.8, 66, 44, G], [1.9, 76, 46, T], [1.0, 72, 44, G], [0.1, 60, 38, L]], { seed: 3 }),
    cluster(S, 772, 250, [[2.4, 56, 36, G], [1.5, 60, 40, T], [0.6, 50, 32, G]], { seed: 4 }),
    cluster(S, 800, 90, [[-0.4, 50, 30, G], [0.4, 54, 32, L], [1.2, 48, 30, G], [-1.3, 44, 28, Pa]], { seed: 5 }),
    // kiri atas tengah
    cluster(S, 486, 62, [[-2.5, 56, 34, Pa], [-1.6, 62, 36, L], [-0.6, 52, 30, G], [0.9, 50, 28, Pa], [1.6, 46, 26, L]], { seed: 6, stem: '486 62, 440 70, 400 86', stemW: 3 }),
    cluster(S, 498, 150, [[1.5, 40, 22, L], [0.4, 44, 24, Pa]], { seed: 7 }),
    cluster(S, 456, 232, [[-0.9, 44, 24, Pa], [0.5, 42, 22, L], [1.9, 34, 20, G]], { seed: 8 }),
    cluster(S, 420, 290, [[1.2, 46, 26, G], [2.3, 40, 22, T], [0.2, 40, 22, Pa]], { seed: 9 }),
    // daun toska gelap di sekitar orangutan
    cluster(S, 80, 70, [[-1.2, 46, 28, D], [0.3, 40, 24, T], [1.9, 36, 22, D]], { seed: 10, veins: 0 }),
    cluster(S, 250, 50, [[-0.7, 44, 28, D], [0.6, 46, 26, T], [-2.0, 40, 26, G]], { seed: 11, veins: 0 }),
    cluster(S, 290, 150, [[0.9, 46, 26, T], [-0.2, 40, 26, G], [2.0, 34, 22, D]], { seed: 12, veins: 0 }),
    cluster(S, 40, 280, [[1.0, 50, 30, T], [2.2, 44, 26, D], [-0.3, 40, 24, G]], { seed: 13, veins: 0 }),
    cluster(S, 170, 330, [[0.7, 40, 22, D], [1.9, 38, 22, T]], { seed: 14, veins: 0 }),
    cluster(S, 240, 262, [[1.3, 44, 26, T], [0.4, 40, 22, G]], { seed: 15, veins: 0 }),
    cluster(S, 330, 190, [[-0.5, 48, 26, G], [0.5, 44, 24, T], [1.4, 40, 22, G]], { seed: 16, veins: 2 }),
    // kanan: daun toska panjang
    cluster(S, 1140, 120, [[1.9, 70, 30, D], [1.2, 80, 32, T], [0.6, 70, 28, D], [2.6, 60, 26, T]], { seed: 17, veins: 0 }),
    cluster(S, 1180, 250, [[2.0, 70, 26, D], [2.7, 76, 28, T], [1.4, 60, 24, D]], { seed: 18, veins: 0 }),
    cluster(S, 1190, 330, [[2.5, 90, 26, G], [2.9, 96, 28, T], [2.1, 80, 24, G], [3.3, 70, 22, T]], { seed: 19, veins: 4 }),
    cluster(S, 1010, 110, [[2.2, 44, 24, G], [1.6, 48, 26, T], [2.9, 40, 22, G], [1.0, 40, 22, G]], { seed: 20, veins: 0 }),
    cluster(S, 992, 200, [[2.0, 44, 24, G], [1.3, 48, 26, T], [2.7, 36, 20, G]], { seed: 21, veins: 0 }),
    cluster(S, 1120, 30, [[0.8, 60, 40, G], [2.0, 70, 44, L], [1.4, 80, 50, G]], { seed: 22, veins: 3 }),
    cluster(S, 840, 110, [[2.4, 40, 22, G], [3.2, 44, 24, L], [1.6, 38, 20, G]], { seed: 23 }),
    cluster(S, 860, 215, [[2.9, 46, 22, G], [2.2, 50, 24, T], [3.6, 44, 22, G], [1.5, 40, 20, G]], { seed: 24 }),
    cluster(S, 840, 300, [[2.7, 44, 20, G], [2.0, 48, 22, T], [3.4, 40, 20, L]], { seed: 25 }),
  ];
  return (ctx, t) => { for (const c of cl) S.put(ctx, c.s, { px: c.x, py: c.y, rot: c.amp * Math.sin(t * 0.8 + c.ph * 5) + c.amp * 0.5 * Math.sin(t * 1.9 + c.ph * 3) }); };
});
// ───────────────────────── pusat: cenderawasih, perempuan-air, rambut/ular, gajah ─────────────────────────
// tubuh pucat sang perempuan: dari leher turun, melebur ke air terjun
layer(29, 'tubuh', S => {
  const sp = S.sprite(440, 660, 720, 990, g => {
    const b = blob('556 690, 600 700, 628 690, 650 720, 690 760, 706 820, 690 880, 660 930, 640 962, 520 964, 500 930, 492 880, 486 830, 500 790, 530 760, 548 724');
    stain(g, 590, 830, 130, 150, '#f6f8f3', 0.9); wash(g, b, '#f4f6f1', { a: 0.45, blobs: 6, dark: '#bcd3e2', da: 0.3, light: '#fffef6', la: 0.7, edge: 0, rough: 6 });
    stain(g, 596, 900, 80, 60, '#f6ecc0', 0.6); stain(g, 640, 760, 40, 50, '#d3e3ee', 0.5); stain(g, 540, 800, 30, 40, '#dfe9ee', 0.5); stain(g, 600, 760, 36, 26, '#e9d2c6', 0.25);
    dashes(g, curve(P('548 724, 530 760, 500 790, 486 830, 492 880')), { w: 1, len: 8, gap: 3 });
    dashes(g, curve(P('650 720, 690 760, 706 820, 690 880')), { w: 0.9, len: 6, gap: 4 });
    ink(g, '560 800, 580 812, 606 808', { w: 0.8, a: 0.5 }); ink(g, '540 846, 556 858', { w: 0.8, a: 0.5 });
  });
  return (ctx, t) => S.put(ctx, sp, { px: 590, py: 960, sy: 1 + 0.006 * Math.sin(t * 0.9), a: 0.95 });
});

// helai ekor cenderawasih yang mengalir turun menjadi rambut dan air
layer(30, 'jumbai', S => {
  const r = RNG(41), strands = [];
  const add = (ctrl, n, spread, col, w, a, o = {}) => { for (let i = 0; i < n; i++) { const d = (i / (n - 1 || 1) - 0.5) * spread; strands.push({ c: P(ctrl).map((p, j, arr) => [p[0] + d * (0.3 + 0.7 * j / (arr.length - 1)) + r.g() * 2, p[1] + d * (o.dy ?? 0) * j / (arr.length - 1)]), col, w: w * r.r(0.7, 1.3), a, ph: r.r(0, 6), amp: o.amp ?? 5, ink: o.ink ?? 1 }); } };
  add('624 570, 628 620, 618 690, 606 760, 612 830', 10, 40, '#dccf5e', 6, 0.36);
  add('618 575, 622 640, 610 700, 600 770, 604 836', 6, 26, '#b7ab3e', 2.4, 0.5);
  add('650 572, 664 640, 652 716, 660 762, 694 790, 724 796', 5, 20, '#e8e4bc', 4, 0.5);
  add('606 700, 600 780, 628 836, 690 856', 9, 50, '#e9df9a', 1.6, 0.45, { dy: 0.4 });
  add('560 690, 566 716, 550 746, 524 778', 6, 18, '#bf9d48', 3.4, 0.62);
  add('592 692, 568 762, 510 798, 476 812', 5, 26, '#e9e4c8', 1.5, 0.5, { dy: 0.5 });
  add('600 700, 590 770, 560 800, 500 840, 490 856', 3, 18, '#e9e4c8', 1.2, 0.4);
  add('556 596, 510 600, 470 624, 456 660', 6, 34, INK, 0.9, 0.75, { ink: 2, amp: 9 });
  add('548 606, 520 640, 480 680, 410 706', 4, 22, INK, 0.9, 0.6, { ink: 2, amp: 8 });
  const mass = S.sprite(560, 550, 760, 880, g => {
    const m = blob('604 566, 652 566, 668 650, 654 730, 690 780, 736 796, 716 830, 640 856, 596 820, 602 720, 610 640');
    wash(g, m, '#f3ecc0', { a: 0.7, blobs: 6, dark: '#d6c860', da: 0.4, light: '#fffdf0', la: 0.6, edge: 0.06, rough: 4 });
    stain(g, 632, 640, 18, 70, '#d9cc50', 0.5); stain(g, 680, 800, 40, 20, '#eee6b0', 0.6);
  });
  return (ctx, t) => {
    S.put(ctx, mass, { px: 630, py: 566, skx: 0.015 * Math.sin(t * 0.8) });
    ctx.save(); ctx.globalAlpha = S.fade;
    for (const s of strands) {
      const p = wave(s.c, t, { amp: s.amp, ph: s.ph, sp: 0.9, k: 4 });
      if (s.ink !== 2) qline(ctx, p, s.w, s.col, s.a);
      qline(ctx, p, s.ink === 2 ? s.w : 0.75, INK, s.ink === 2 ? s.a : 0.5);
    }
    ctx.restore();
  };
});

// ── wajah perempuan: menengadah, mata terpejam ──
layer(31, 'perempuan', S => {
  const sp = S.sprite(480, 560, 680, 870, g => {
    const face = blob('553 600, 566 582, 598 572, 622 588, 630 640, 618 682, 596 698, 572 694, 556 678, 547 662, 543 650, 546 641, 540 630, 547 616');
    wash(g, face, '#e6edf0', { a: 0.95, blobs: 4, edge: 0.1, dark: '#a9c3d6', da: 0.22, light: '#fffdf4', la: 0.6 });
    stain(g, 580, 648, 24, 15, '#e8b9a8', 0.26); stain(g, 578, 696, 26, 10, '#7f95a8', 0.4); stain(g, 600, 740, 60, 50, '#dfe9ee', 0.5);
    ink(g, '553 600, 547 616, 540 630, 546 641, 543 650, 547 662, 556 678, 572 694', { w: 1.2 });
    ink(g, '578 606, 589 603, 601 605', { w: 2.4 }); ink(g, '581 617, 588 618, 594 617', { w: 1.2 });      // mata terpejam
    ink(g, '546 632, 552 635, 556 632', { w: 1.5 }); ink(g, '560 630, 564 634', { w: 1.2 });               // hidung
    ink(g, '543 649, 552 646, 560 649, 566 652', { w: 1.7 }); ink(g, '547 655, 556 657', { w: 0.9 });      // bibir
    ink(g, '572 694, 590 700, 610 690', { w: 0.9, a: 0.6 });
    ink(g, '490 790, 486 812, 492 836, 503 852', { w: 1.1, a: 0.8 });                                       // garis bahu
    ink(g, '560 700, 548 742, 520 776', { w: 0.8, a: 0.5 });
  });
  return (ctx, t) => S.put(ctx, sp, { px: 590, py: 700, rot: 0.01 * Math.sin(t * 0.6), sx: 1.14, sy: 1.14 + 0.005 * Math.sin(t * 1.1) });
});

// ── cenderawasih hitam berekor panjang (bukan ular): paruh sabit menyentuh bibir, sayap mengipas, dua bulu ekor mengalir ──
// Ekor: tiap helai dilukis lurus sekali (cat air + palang putih), lalu tiap bingkai dipotong 40 ruas
// dan ditekuk mengikuti tulang yang bergelombang, jadi teksturnya ikut melengkung seperti pita.
layer(32, 'cenderawasih-hitam', S => {
  const ROOT = [472, 796], NECK = [508, 676], SHOULDER = [500, 704];
  const plume = (ctrl, w0, w1, bars, seed) => {
    const rest = curve(P(ctrl), false, 7), s = [0];
    for (let i = 1; i < rest.length; i++) s.push(s[i - 1] + Math.hypot(rest[i][0] - rest[i - 1][0], rest[i][1] - rest[i - 1][1]));
    const L = s[s.length - 1], hw = Math.max(w0, w1) / 2 + 2;
    const wf = u => lerp(w0, w1, u) * (u > 0.86 ? Math.sqrt(Math.max(0, 1 - ((u - 0.86) / 0.14) ** 2)) * 0.85 + 0.15 : 1) * (u < 0.04 ? 0.7 + u * 7.5 : 1);
    const tex = S.sprite(0, -hw, L, hw, g => {
      const n = 70, top = [], bot = [];
      for (let i = 0; i <= n; i++) { const u = i / n; top.push([u * L, -wf(u) / 2]); bot.push([u * L, wf(u) / 2]); }
      const shape = top.concat(bot.slice().reverse());
      wash(g, shape, '#25324a', { a: 0.96, blobs: 7, dark: '#0b111c', da: 0.6, light: '#8fb0d4', la: 0.2, edge: 0.3, rough: 0.45, seed, edgeCol: '#0b111c' });
      for (let i = 0; i < 7; i++) { const u = 0.08 + i * 0.13; stain(g, u * L, -bars * wf(u) * 0.08, 30, wf(u) * 0.22, i % 2 ? '#5a8fbf' : '#3f9a98', 0.3); }
      const ry = u => -bars * wf(u) * 0.12, rach = []; for (let i = 0; i <= n; i++) rach.push([i / n * L, ry(i / n)]);
      for (let x = 3; x < L * 0.97; x += 3.2) {        // serat bulu condong ke belakang
        const u = x / L, h = wf(u) / 2;
        for (const sg of [-1, 1]) ink(g, [[x, ry(u)], [x - 4, ry(u) + sg * h * 0.5], [x - 7, sg * h * 0.9]], { w: 0.5, col: '#060a12', a: 0.35, wob: 0.2 });
      }
      ink(g, rach, { w: 1.1, col: '#cfd8e6', a: 0.45, wob: 0.3 }); ink(g, rach, { w: 0.6, col: '#060a12', a: 0.6, wob: 0.3 });
      for (let x = 10, k = 0; x < L * 0.93; x += 9.2, k++) {   // palang putih di satu tepi, seperti di lukisan
        const u0 = x / L, u1 = (x + 5.6) / L, h0 = wf(u0) / 2, h1 = wf(u1) / 2, inn = 0.4 + 0.08 * Math.sin(k * 1.3);
        const q = [[x, bars * h0 * inn], [x + 5.6, bars * h1 * inn], [x + 5.6, bars * h1 * 0.97], [x, bars * h0 * 0.97]];
        wash(g, q, '#f5f4ec', { a: 0.97, blobs: 0, edge: 0, rough: 0.25, raw: true }); ink(g, q, { closed: true, w: 0.95, col: '#0e1622', wob: 0.25 });
      }
      ink(g, top, { w: 1.2, col: '#0b111c', wob: 0.35 }); ink(g, bot, { w: 1.2, col: '#0b111c', wob: 0.35 });
    });
    return { rest, s, L, hw, tex };
  };
  const tails = [
    plume('472 796, 452 820, 426 852, 406 890, 400 928, 412 962, 440 986, 474 998, 490 994', 24, 11, 1, 51),
    plume('478 800, 474 840, 476 884, 488 922, 500 956, 504 990, 498 1006', 19, 9, -1, 52),
  ];
  const bend = (pl, t, o) => {
    const r = pl.rest, n = r.length, out = [], [rx, ry] = r[0];
    for (let i = 0; i < n; i++) {
      const u = pl.s[i] / pl.L, a = r[Math.max(0, i - 1)], b = r[Math.min(n - 1, i + 1)];
      let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const l = Math.hypot(nx, ny) || 1;
      const d = o.amp * u ** 1.3 * Math.sin(o.ph - u * o.k) + o.amp2 * u * u * Math.sin(o.ph * 0.43 + o.p2 - u * 2.2);
      const x = r[i][0] + nx / l * d - rx, y = r[i][1] + ny / l * d - ry, an = o.sway * u * (2 - u), c = Math.cos(an), sn = Math.sin(an);
      out.push([rx + x * c - y * sn + o.ox, ry + x * sn + y * c + o.oy]);
    }
    return out;
  };
  const ribbon = (ctx, pl, pts) => {
    const c = pl.tex.c, K = S.K, pad = 8, Hh = (pl.hw + pad) * 2;
    ctx.save(); ctx.globalAlpha = S.fade;
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1], dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy) || 0.01, cs = dx / len, sn = dy / len;
      const s0 = pl.s[i], s1 = pl.s[i + 1], sx = (s0 + pad) * K, sw = Math.max(1, (s1 - s0) * K + (i < pts.length - 2 ? 1.2 : 0));
      ctx.setTransform(K * cs, K * sn, -K * sn, K * cs, K * p[0], K * p[1]);
      ctx.drawImage(c, sx, 0, Math.min(sw, c.width - sx), c.height, 0, -pl.hw - pad, len + (i < pts.length - 2 ? 0.9 : 0), Hh);
    }
    ctx.restore();
  };
  // sayap: helai bulu terbang biru-hitam, pangkalnya kekuningan zaitun seperti sapuan di lukisan
  const feather = (seed, col, bend, wid = 15, len = 100) => S.sprite(-4, -wid, len + 4, wid, g => {
    const p = leafPts(0, 0, 0, len, wid, bend);
    wash(g, p, col, { a: 0.95, blobs: 2, edge: 0.2, rough: 0.35, seed, edgeCol: '#070b12', ew: 2, dark: '#0a0f18', da: 0.45, light: '#93acd0', la: 0.18, grad: ['#a9a35a', len * 0.75, 0, 0, 0, 0.42] });
    stain(g, len * 0.55, -bend * 8, len * 0.25, wid * 0.22, '#5d8fbf', 0.3);
    ink(g, p, { closed: true, w: 0.85, col: '#070b12', seed, a: 0.85 });
    const mid = []; for (let i = 0; i <= 10; i++) { const x = i * len / 10; mid.push([x, bend * len * (x / len) ** 2]); }
    ink(g, mid, { w: 0.7, col: '#c9d3e2', a: 0.5 }); ink(g, mid, { w: 0.5, col: '#070b12', a: 0.6 });
    for (let i = 0; i < 13; i++) { const x = len * 0.18 + i * len * 0.06, y = bend * len * (x / len) ** 2; ink(g, [[x, y - wid * 0.3], [x + 3, y - 0.5]], { w: 0.55, col: '#070b12', a: 0.55 }); }
  });
  const prim = [feather(61, '#2b3955', 0.05), feather(62, '#24304a', 0.07), feather(63, '#33445f', 0.04)];
  const cov = [feather(64, '#1f2a40', 0.04, 20, 60), feather(65, '#2a3752', 0.06, 20, 60)];
  const fan = (pairs, n) => { const o = []; for (let i = 0; i < n; i++) { const x = i / (n - 1) * (pairs.length - 1), k = Math.min(pairs.length - 2, Math.floor(x)), f = x - k; o.push([lerp(pairs[k][0], pairs[k + 1][0], f), lerp(pairs[k][1], pairs[k + 1][1], f)]); } return o; };
  const PRIM = fan([[3.24, 92], [3.1, 124], [2.94, 144], [2.78, 152], [2.62, 150], [2.47, 138], [2.34, 116]], 15);
  const COV = fan([[3.2, 62], [2.95, 74], [2.7, 76], [2.45, 66]], 9);
  const CENTER = 2.8;
  const body = S.sprite(440, 640, 540, 830, g => {
    const bd = blob('512 664, 522 690, 524 716, 516 748, 502 778, 486 800, 468 812, 458 800, 462 772, 474 742, 486 712, 494 686, 500 668');
    wash(g, bd, '#28344c', { a: 0.97, blobs: 7, dark: '#080d16', da: 0.6, light: '#86a2c8', la: 0.22, edge: 0.3, rough: 1.2, edgeCol: '#080d16' });
    // perisai dada berkilau (biru-hijau) menghadap sang perempuan
    stain(g, 514, 712, 12, 30, '#3fa0a0', 0.55, 0.3); stain(g, 512, 730, 9, 18, '#7fc6d8', 0.45, 0.3); stain(g, 506, 756, 10, 20, '#4f78b8', 0.4, 0.4);
    fur(g, bd, { n: 140, len: 8, dir: (x, y) => 1.9 + (y - 740) * 0.002, col: '#060a12', a: 0.55, w: 0.7 });
    ink(g, bd.slice(0, Math.floor(bd.length * 0.55)), { w: 1.2, col: '#060a12' });
    for (let i = 0; i < 6; i++) ink(g, [[510 - i, 700 + i * 9], [519 - i * 1.4, 706 + i * 9]], { w: 0.6, col: '#d8f0f0', a: 0.35 });
  });
  const head = S.sprite(490, 618, 552, 684, g => {
    const hd = blob('500 668, 498 652, 504 640, 516 636, 524 642, 525 654, 520 666, 512 676');
    wash(g, hd, '#26324a', { a: 0.97, blobs: 3, dark: '#070b12', da: 0.6, light: '#8fb6d6', la: 0.25, edge: 0.3, edgeCol: '#070b12' });
    stain(g, 510, 640, 10, 5, '#5fb0b8', 0.5);              // topi berkilau
    fur(g, hd, { n: 40, len: 5, dir: 2.3, col: '#060a12', a: 0.5, w: 0.6 });
    ink(g, hd, { closed: true, w: 1.1, col: '#060a12' });
    // paruh sabit, melengkung menyentuh bibir
    const bill = tube(curve(P('519 645, 527 636, 535 634, 541 638, 543 645'), false, 6), u => 5.4 * (1 - u) + 0.7);
    wash(g, bill, '#1b2230', { a: 0.97, blobs: 0, rough: 0.2, edge: 0 }); ink(g, bill, { closed: true, w: 0.9, col: '#060a12' });
    ink(g, '522 645, 530 640, 538 640', { w: 0.6, col: '#c2ccda', a: 0.6 });
  });
  S.spot('cenderahitam', 488, 760, 78, 'Cenderawasih hitam');
  return (ctx, t) => {
    const pk = S.poke('cenderahitam'), x = Math.min(1, pk / 3.4), burst = pk < 3.4 ? (1 - x) ** 1.4 : 0;
    // pamer berkala: tiap ±11 detik sayap terangkat dan bergetar sebentar
    const cyc = (t + 4) % 11.3, dsp = cyc < 2.4 ? Math.sin(Math.PI * cyc / 2.4) ** 2 : 0;
    const bob = Math.sin(t * 1.3) * 1.2 + Math.sin(t * 9) * burst * 2.2;
    // ── ekor ──
    const tph = t * 1.7 + 4 * Math.PI * x * (2 - x);
    tails.forEach((pl, i) => {
      const pts = bend(pl, t, { ph: tph + i * 0.9, k: 5.2, amp: 6 + 4 * dsp + 20 * burst, amp2: 7 + 6 * burst, p2: i * 2.1, sway: 0.05 * Math.sin(t * 0.45 + i) + burst * 0.16 * Math.sin(t * 4.2 + i), ox: 0, oy: bob * 0.6 });
      ribbon(ctx, pl, pts);
    });
    // ── badan ──
    S.put(ctx, body, { px: ROOT[0], py: ROOT[1], dy: bob, rot: 0.012 * Math.sin(t * 0.8) + burst * 0.03 * Math.sin(t * 6) });
    // ── sayap ──
    const spread = 1 + 0.22 * dsp + 0.5 * burst, lift = 0.22 * dsp + 0.55 * burst + 0.035 * Math.sin(t * 0.9);
    const beat = Math.sin(t * (6 + 4 * burst)) * (0.06 * dsp + 0.2 * burst), n = PRIM.length;
    for (let i = n - 1; i >= 0; i--) {
      const [a0, len] = PRIM[i], w = 0.6 + 0.4 * (1 - i / (n - 1));
      const a = CENTER + (a0 - CENTER) * spread + lift + beat * w + 0.018 * Math.sin(t * 3.1 + i * 0.7) + 0.01 * Math.sin(t * 1.3 + i);
      S.put(ctx, prim[i % 3], { px: 0, py: 0, dx: SHOULDER[0], dy: SHOULDER[1] + bob, rot: a, sx: len / 100 * (1 + 0.05 * burst), sy: 0.8 + len / 300 });
    }
    for (let i = COV.length - 1; i >= 0; i--) {
      const [a0, len] = COV[i], a = CENTER + (a0 - CENTER) * (1 + (spread - 1) * 0.7) + lift * 0.8 + beat * 0.5 + 0.012 * Math.sin(t * 2.7 + i);
      S.put(ctx, cov[i % 2], { px: 0, py: 0, dx: SHOULDER[0] + 2, dy: SHOULDER[1] + bob - 2, rot: a, sx: len / 60, sy: 0.9 });
    }
    // ── kepala: mengecup bibir, sesekali menengadah ──
    const nuz = 0.035 * Math.sin(t * 0.7) + 0.05 * Math.max(0, Math.sin(t * 0.31)) ** 6 - burst * 0.12 * Math.sin(t * 7);
    S.put(ctx, head, { px: NECK[0], py: NECK[1], dy: bob, rot: nuz });
    const [ex, ey] = spin(NECK[0], NECK[1], nuz, 515, 648, bob);
    eye(ctx, ex, ey, 2.1, blink(t, 7, 3.7), { ry: 0.9, iris: 0.9, pupil: 0.55, col: '#3a2a12', lw: 0.7 });
  };
});
// ── cenderawasih ──
layer(34, 'cenderawasih', S => {
  // satu helai bulu sayap: panjang 100 ke arah +x; dilukis sekali, diputar tiap bingkai
  const feather = (seed, col, bend) => S.sprite(-4, -12, 104, 16, g => {
    const p = leafPts(0, 0, 0, 100, 15, bend);
    wash(g, p, col, { a: 0.92, blobs: 0, edge: 0.12, rough: 0.4, seed, edgeCol: '#b9794a', ew: 2, grad: ['#dd9a62', 55, 0, 0, 0, 0.55] });
    ink(g, p, { closed: true, w: 0.85, col: '#4f3526', seed, a: 0.8 });
    const mid = []; for (let i = 0; i <= 10; i++) { const x = i * 10; mid.push([x, bend * 100 * (x / 100) ** 2]); } ink(g, mid, { w: 0.8, col: '#4f3526', a: 0.75 });
    for (let i = 0; i < 12; i++) { const x = 22 + i * 6, y = bend * 100 * (x / 100) ** 2; ink(g, [[x, y - 4.2], [x + 2.6, y - 0.6]], { w: 0.6, col: '#4f3526', a: 0.6 }); }
  });
  const fsL = [feather(1, '#f6ddc2', 0.05), feather(2, '#f2d2b0', 0.06), feather(3, '#f8e4cc', 0.04)];
  const fsR = [feather(4, '#f6ddc2', -0.05), feather(5, '#f2d2b0', -0.06), feather(6, '#f8e4cc', -0.04)];
  const fan = (pairs, n) => { const o = []; for (let i = 0; i < n; i++) { const x = i / (n - 1) * (pairs.length - 1), k = Math.min(pairs.length - 2, Math.floor(x)), f = x - k; o.push([lerp(pairs[k][0], pairs[k + 1][0], f), lerp(pairs[k][1], pairs[k + 1][1], f)]); } return o; };
  const LW = { x: 572, y: 506, fs: fsL, f: fan([[-4.24, 62], [-3.705, 82], [-3.298, 98], [-2.967, 116], [-2.717, 146], [-2.541, 176], [-2.384, 198]], 17) };
  const RW = { x: 632, y: 496, fs: fsR, f: fan([[0.763, 97], [0.32, 126], [0, 146], [-0.274, 166], [-0.517, 192], [-0.76, 226], [-0.972, 248], [-1.156, 248], [-1.329, 230], [-1.487, 204]], 22) };
  // pangkal sayap: bulu gelap pendek memancar
  const root = (x, y, a0, a1, R) => S.sprite(x - R, y - R, x + R, y + R, g => {
    const r = RNG(x); stain(g, x, y, R * 0.8, R * 0.8, '#7a7462', 0.38);
    for (let i = 0; i < 70; i++) { const a = r.r(a0, a1), d0 = r.r(4, R * 0.5), d1 = d0 + r.r(8, R * 0.45); ink(g, [[x + Math.cos(a) * d0, y + Math.sin(a) * d0], [x + Math.cos(a + 0.06) * d1, y + Math.sin(a + 0.06) * d1]], { w: r.r(0.7, 1.3), col: '#2c2a26', a: 0.75 }); }
  });
  const rootL = root(566, 510, 2.2, 4.3, 46), rootR = root(640, 498, -1.4, 0.9, 60);
  const body = S.sprite(540, 455, 700, 620, g => {
    const r = RNG(8);
    for (let i = 0; i < 120; i++) { const x = r.r(560, 668), y = r.r(540, 590), l = r.r(10, 26), a = 1.5 + (x - 610) * 0.008 + r.g() * 0.2; ink(g, [[x, y], [x + Math.cos(a) * l, y + Math.sin(a) * l]], { w: r.r(0.7, 1.3), col: '#2b3338', a: 0.7 }); }
    stain(g, 610, 560, 60, 30, '#7d8270', 0.5);
    const bd = blob('558 488, 580 472, 606 476, 634 470, 656 486, 660 520, 640 556, 606 572, 574 562, 556 530');
    wash(g, bd, '#e3b184', { a: 0.95, blobs: 5, dark: '#8a5a3a', da: 0.4, shade: [0, 1, 0.5, '#6f5340'], edge: 0.15 });
    fur(g, bd, { n: 110, len: 9, dir: (x, y) => 1.3 + (x - 606) * 0.014, col: '#4a2f22', a: 0.7 });
  });
  const head = S.sprite(510, 380, 610, 490, g => {
    const neck = blob('556 474, 546 452, 538 424, 538 408, 548 400, 558 406, 574 430, 590 452, 600 474');
    wash(g, neck, '#9cc56c', { a: 0.95, blobs: 3, dark: '#4f8a3c', da: 0.42, edge: 0.35 }); ink(g, neck, { closed: true, w: 1.15 });
    ink(g, '560 424, 566 444, 566 462', { w: 0.9, a: 0.7 });
    const beak = P('540 410, 519 392, 526 388, 550 402'); wash(g, beak, '#3b4658', { a: 0.95, blobs: 0, rough: 0.3 }); ink(g, beak, { closed: true, w: 1.1 }); ink(g, '523 392, 542 405', { w: 0.8, col: '#b9c2d0' });
  });
  S.spot('cendera', 600, 470, 110, 'Cenderawasih');
  return (ctx, t) => {
    const pk = S.poke('cendera'), burst = pk < 2.6 ? (1 - pk / 2.6) : 0;
    const ph = t * 1.5 + burst * burst * 30, flap = Math.sin(ph) * (0.06 + burst * 0.32), fold = 1 - (0.05 + burst * 0.2) * (0.5 - 0.5 * Math.cos(ph));
    const bob = Math.sin(ph + 1.2) * (2 + burst * 6);
    S.put(ctx, body, { px: 605, py: 520, dy: bob, rot: 0.02 * Math.sin(ph + 0.6) });
    const wing = (Wg, dir) => {
      const n = Wg.f.length, pivot = Wg.f[dir > 0 ? 0 : 0][0];
      for (let i = 0; i < n; i++) {
        const [a0, len] = Wg.f[i], a = pivot + (a0 - pivot) * fold + dir * flap * (0.6 + 0.6 * Math.abs(a0 - pivot)) + 0.015 * Math.sin(t * 2.3 + i);
        S.put(ctx, Wg.fs[i % 3], { px: 0, py: 0, dx: Wg.x, dy: Wg.y + bob, rot: a, sx: len / 100, sy: 0.8 + len / 260 });
      }
    };
    wing(LW, 1); wing(RW, -1);
    S.put(ctx, rootL, { px: 566, py: 510, dy: bob, rot: flap * 0.8 }); S.put(ctx, rootR, { px: 640, py: 498, dy: bob, rot: -flap * 0.8 });
    S.put(ctx, head, { px: 575, py: 470, dy: bob, rot: 0.03 * Math.sin(t * 0.8) + burst * 0.1 * Math.sin(ph * 0.5) });
    eye(ctx, 549, 414 + bob, 2.4, blink(t, 3, 4.1), { ry: 0.9, iris: 0.95, pupil: 0.6, col: '#201a12', lw: 0.8 });
  };
});

// ── gajah: kepala, telinga yang mengipas, belalai terangkat ──
layer(36, 'gajah', S => {
  const body = S.sprite(780, 830, 950, 1010, g => {
    const b = blob('792 848, 840 846, 900 850, 935 872, 938 930, 926 986, 900 1000, 860 992, 822 986, 800 950, 790 900');
    wash(g, b, C.ele, { a: 0.92, blobs: 7, dark: '#4f7fa8', da: 0.5, shade: [-0.3, 1, 0.5, '#3f6f98'] });
    hatch(g, blob('796 852, 870 850, 925 880, 900 960, 850 985, 812 940'), { ang: -1.05, gap: 3.4, col: '#2a5272', a: 0.75 });
    hatch(g, blob('830 870, 900 866, 934 900, 926 980, 880 992'), { ang: 1.0, gap: 4.6, col: '#2a5272', a: 0.5 });
    hatch(g, blob('800 900, 850 890, 860 960, 820 980'), { ang: 0.2, gap: 5, col: '#2a5272', a: 0.4 });
    ink(g, '935 872, 938 930, 926 986', { w: 1.2 }); ink(g, '792 848, 790 900, 800 950', { w: 1.2 });
  });
  const ear = S.sprite(880, 640, 975, 910, g => {
    const e = blob('892 656, 925 662, 952 680, 966 720, 966 790, 956 850, 938 895, 915 900, 900 862, 892 800, 900 740, 904 690');
    wash(g, e, '#c6d9e8', { a: 0.95, blobs: 6, dark: '#7ea6c8', da: 0.4, shade: [0.3, 1, 0.45, '#5f8fb8'] });
    hatch(g, blob('930 800, 962 790, 954 852, 938 892, 914 896, 908 850'), { ang: 1.15, gap: 3.6, col: '#3d6a8c', a: 0.6 });
    ink(g, e, { closed: true, w: 1.25 }); ink(g, '896 668, 928 674, 952 692', { w: 1.0 });
    dashes(g, curve(P('922 690, 934 750, 928 830')), { w: 0.9, len: 6 }); dashes(g, curve(P('946 710, 952 780, 944 850')), { w: 0.8, len: 5 });
  });
  const head = S.sprite(715, 620, 915, 880, g => {
    const lip = blob('748 842, 790 848, 802 864, 772 874, 750 860'); wash(g, lip, '#7c7f99', { a: 0.85, blobs: 2 }); hatch(g, lip, { ang: 0.6, gap: 3, a: 0.6 }); ink(g, lip, { closed: true, w: 1.1 });
    const h = blob('756 656, 775 640, 805 631, 845 629, 880 642, 900 664, 906 700, 898 750, 884 800, 862 832, 830 846, 796 846, 768 832, 745 808, 728 775, 722 730, 728 690, 740 665');
    wash(g, h, C.ele, { a: 0.96, blobs: 8, dark: '#6f9cc4', da: 0.36, light: '#eef4f8', la: 0.5, shade: [0.5, 1, 0.32, '#5f8fb8'] });
    ink(g, h, { closed: true, w: 1.3 });
    // alis berkerut & kerut mata
    ink(g, '802 704, 820 698, 838 702, 852 712', { w: 2.0 }); ink(g, '806 696, 824 690, 844 696', { w: 1.1 }); ink(g, '812 688, 828 684, 842 688', { w: 0.9 });
    ink(g, '816 736, 830 742, 848 738', { w: 1.1 }); ink(g, '812 748, 826 758, 846 756', { w: 1 }); ink(g, '826 768, 838 772', { w: 0.9 });
    ink(g, '800 716, 806 734, 800 752', { w: 1 }); ink(g, '856 720, 862 742, 856 770', { w: 0.9 });
    dashes(g, curve(P('858 648, 876 690, 874 740, 862 792')), { w: 0.9, len: 6 }); dashes(g, curve(P('886 664, 896 720, 884 792')), { w: 0.8, len: 5 });
    hatch(g, blob('850 780, 884 760, 880 806, 858 834, 836 840'), { ang: -0.9, gap: 3.4, col: '#2f5878', a: 0.55 });
    // mulut
    ink(g, '786 814, 795 800, 810 793, 826 800, 838 814', { w: 1.7 }); ink(g, '802 800, 810 806, 818 800', { w: 1.1 }); ink(g, '790 822, 815 834, 846 830', { w: 1.2 });
    hatch(g, blob('790 816, 812 806, 836 816, 815 832'), { ang: 0.3, gap: 2.8, col: '#2f5878', a: 0.6 });
  });
  const spine0 = P('792 806, 756 772, 738 708, 740 644, 748 592, 747 548'), widths = [64, 62, 60, 56, 46, 32];
  S.spot('gajah', 830, 740, 100, 'Gajah');
  return (ctx, t) => {
    const pk = S.poke('gajah'), lift = pk < 3 ? Math.sin(pk / 3 * Math.PI) : 0;
    S.put(ctx, body, { px: 880, py: 1000, sy: 1 + 0.008 * Math.sin(t * 1.1) });
    S.put(ctx, ear, { px: 898, py: 700, sx: 1 + 0.05 * Math.sin(t * 1.3) + 0.12 * lift * Math.sin(t * 9), rot: 0.02 * Math.sin(t * 1.3) });
    S.put(ctx, head, { px: 830, py: 760, rot: 0.005 * Math.sin(t * 0.9) });
    // belalai: tabung melengkung; pangkal diam, ujung melambai
    const sw = Math.sin(t * 0.9), sp = curve(spine0.map((p, i) => { const u = i / 5; return [p[0] + (sw * 7 - lift * 22) * u * u + Math.sin(t * 1.7 + u * 3) * 2.5 * u, p[1] + (Math.cos(t * 0.9) * 3 - lift * 14) * u * u]; }), false, 8);
    const { L, R } = tube(sp, widths, false), n = sp.length, poly = L.concat(R.slice().reverse());
    ctx.save(); ctx.globalAlpha = S.fade;
    const lg = ctx.createLinearGradient(708, 0, 772, 0); lg.addColorStop(0, css('#f3f4ee')); lg.addColorStop(0.3, css('#eaf0ee')); lg.addColorStop(0.42, css('#c0d6e6')); lg.addColorStop(1, css('#b7cde0'));
    ctx.beginPath(); ctx.moveTo(poly[0][0], poly[0][1]); for (const p of poly) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fillStyle = lg; ctx.fill();
    // sisi kiri (R) = bawah belalai: tangga gelang-gelang
    const inner = sp.map((p, i) => [lerp(R[i][0], L[i][0], 0.3), lerp(R[i][1], L[i][1], 0.3)]);
    for (let i = 4; i < n - 1; i += 2) qline(ctx, [R[i], [inner[i][0], inner[i][1] - 2]], 0.9, INK, 0.75);
    qline(ctx, inner.slice(4), 0.9, INK, 0.7);
    qline(ctx, R.slice(2), 1.3, INK, 0.92); qline(ctx, L.slice(Math.floor(n * 0.5)), 1.3, INK, 0.92);
    for (let i = Math.floor(n * 0.12); i < n * 0.5; i += 3) qline(ctx, [[lerp(L[i][0], R[i][0], 0.08), L[i][1]], [lerp(L[i][0], R[i][0], 0.4), lerp(L[i][1], R[i][1], 0.4) + 3]], 0.9, INK, 0.6); qline(ctx, [L[n - 1], R[n - 1]], 1.2, INK, 0.9);
    ctx.restore();
    eye(ctx, 833, 723, 5, blink(t, 1, 6.1), { ry: 0.6, col: '#3d3428', rot: 0.25, iris: 0.8, pupil: 0.5 });
  };
});
// ───────────────────────── satwa di tajuk: orangutan, beo, macan tutul ─────────────────────────
layer(40, 'orangutan', S => {
  const FUR = '#f0c8b6', FUR2 = '#e3a58a', IK = '#4a3632';
  const down = (cx) => (x, y) => 1.57 + (x - cx) * 0.012;
  const body = S.sprite(10, 0, 320, 260, g => {
    // lengan kiri: terangkat memegang batang
    const armL = tube(curve(P('160 112, 112 112, 72 84, 44 52, 24 30'), false, 8), [44, 40, 34, 30, 24]);
    hairy(g, armL, FUR, { n: 150, len: 11, dir: (x, y) => 2.2, dark: '#dba08a', seed: 3 });
    // kaki kiri menjulur ke kiri
    const legL = blob('126 150, 96 146, 60 152, 34 166, 30 184, 52 192, 90 190, 124 196');
    hairy(g, legL, FUR, { n: 120, len: 11, dir: (x, y) => 2.9, dark: '#dba08a', seed: 4 });
    hatch(g, blob('24 160, 44 160, 48 186, 28 190'), { ang: 0.8, gap: 3, a: 0.7 }); ink(g, '24 160, 30 176, 26 190', { w: 1.2 });
    // lengan kanan sepanjang dahan
    const armR = tube(curve(P('214 110, 250 116, 284 120, 306 114'), false, 8), [40, 34, 28, 20]);
    hairy(g, armR, FUR, { n: 100, len: 10, dir: () => 0.5, dark: '#dba08a', seed: 5 });
    // badan
    const torso = blob('128 108, 160 96, 210 98, 236 120, 240 160, 228 204, 200 238, 160 250, 124 240, 108 204, 110 150');
    hairy(g, torso, FUR, { n: 420, len: 13, dir: down(175), dark: '#dba08a', da: 0.35, shade: [0, 1, 0.3, '#b97a62'], seed: 6 });
    // lipatan: paha & perut
    for (const s of ['150 168, 170 158, 196 160, 214 172', '128 200, 150 214, 160 240', '196 176, 204 204, 192 232']) fur(g, tube(curve(P(s)), 10), { n: 40, len: 12, dir: 1.6, col: IK, w: 1.1 });
  });
  const head = S.sprite(130, -6, 240, 130, g => {
    const hair = blob('183 2, 214 8, 232 40, 234 84, 220 116, 196 126, 170 126, 146 114, 134 82, 138 38, 156 10');
    hairy(g, hair, '#efc4b0', { n: 200, len: 13, dir: (x, y) => 1.57 - (x - 183) * 0.022, dark: '#d99a82', seed: 9 });
    const face = blob('183 22, 198 26, 208 44, 212 72, 208 96, 196 112, 183 116, 170 112, 158 96, 155 72, 159 44, 169 26');
    wash(g, face, '#d4deea', { a: 0.97, blobs: 3, dark: '#9fb4cc', da: 0.3, edge: 0.2 }); ink(g, face, { closed: true, w: 1.5 });
    const muz = blob('183 62, 200 68, 207 86, 200 104, 183 110, 166 104, 160 86, 166 68'); wash(g, muz, '#dfe7f0', { a: 0.9, blobs: 2, edge: 0.1 }); ink(g, muz, { closed: true, w: 1.3 });
    ink(g, '164 42, 174 38, 183 41, 193 38, 203 43', { w: 1.6 });                         // tonjolan alis
    ink(g, '178 60, 181 66, 185 66, 188 60', { w: 1.6 }); ink(g, '176 104, 183 107, 190 104', { w: 1.4 }); ink(g, '178 110, 188 110', { w: 0.9 });
    dashes(g, curve(P('166 78, 172 90, 183 96, 194 90, 200 78')), { w: 0.8, len: 4 });
  });
  S.spot('orang', 180, 110, 85, 'Orangutan');
  return (ctx, t) => {
    const pk = S.poke('orang'), w = pk < 2 ? Math.sin(pk * 9) * (1 - pk / 2) : 0, br = Math.sin(t * 1.2);
    S.put(ctx, body, { px: 170, py: 250, sy: 1 + 0.008 * br, sx: 1 + 0.004 * br, rot: w * 0.02 });
    const hx = 0.03 * Math.sin(t * 0.5) + w * 0.08;
    S.put(ctx, head, { px: 183, py: 120, rot: hx, dy: -1.5 * br });
    const b = blink(t, 0.3, 4.7), c = Math.cos(hx), s = Math.sin(hx), at = (x, y) => [183 + (x - 183) * c - (y - 120) * s, 120 + (x - 183) * s + (y - 120) * c - 1.5 * br];
    for (const [x, y] of [[172, 47], [195, 48]]) { const p = at(x, y); eye(ctx, p[0], p[1], 3.4, b, { ry: 0.75, col: '#4a3222', iris: 0.85, pupil: 0.5 }); }
  };
});

layer(41, 'beo', S => {
  const DK = '#9aa8bc';
  const body = S.sprite(295, 160, 450, 262, g => {
    // ekor
    const tail = blob('352 200, 330 206, 306 216, 302 222, 320 224, 350 216'); wash(g, tail, DK, { a: 0.9, dark: '#42546c', da: 0.45, blobs: 3 }); for (let i = 0; i < 4; i++) ink(g, [[348, 204 + i * 3.5], [306 + i * 2, 218 + i * 1.5]], { w: 1 });
    // kaki
    for (const [s, f] of [['372 222, 376 236, 382 248', [382, 249]], ['400 222, 412 230, 426 238', [427, 239]]]) { ink(g, s, { w: 3.6, col: '#d9d6c4' }); ink(g, s, { w: 1 }); for (const a of [-0.5, 0.2, 0.9, 1.8]) ink(g, [f, [f[0] + Math.cos(a + 1.2) * 9, f[1] + Math.sin(a + 1.2) * 9]], { w: 1.3 }); }
    const b = blob('432 172, 446 186, 444 204, 428 218, 402 226, 372 226, 350 216, 342 204, 356 192, 384 180, 410 172');
    wash(g, b, DK, { a: 0.94, dark: '#42546c', da: 0.45, blobs: 6, light: '#aab8c8', la: 0.3, shade: [0, 1, 0.4, '#1c2836'] }); ink(g, b, { closed: true, w: 1.3 });
    // bulu sayap: busur berlapis
    for (let i = 0; i < 6; i++) ink(g, curve(P(`${412 - i * 4} ${178 + i * 5}, ${384 - i * 5} ${188 + i * 4.5}, ${352 - i * 3} ${200 + i * 3.4}`)), { w: 1.05 });
    for (let i = 0; i < 9; i++) ink(g, [[362 + i * 6, 190 + (i % 3) * 5], [366 + i * 6, 198 + (i % 3) * 5]], { w: 0.8 });
    wash(g, blob('350 198, 376 196, 378 203, 352 206'), '#f3f4ee', { a: 0.9, blobs: 0, edge: 0 });
    for (let i = 0; i < 16; i++) { const x = 424 + (i % 4) * 5, y = 178 + Math.floor(i / 4) * 8 + (i % 2) * 3; ink(g, [[x, y], [x + 2, y + 4]], { w: 0.9 }); }
  });
  const head = S.sprite(398, 136, 498, 186, g => {
    const h = blob('426 150, 436 143, 450 145, 458 153, 456 166, 444 172, 430 170, 424 160'); wash(g, h, DK, { a: 0.95, dark: '#42546c', da: 0.45, blobs: 3 }); ink(g, h, { closed: true, w: 1.3 });
    const wat = blob('426 160, 418 164, 406 164, 404 172, 412 178, 424 176, 430 170'); wash(g, wat, '#ecc94a', { a: 0.97, blobs: 1, dark: '#c99a22', da: 0.4 }); ink(g, wat, { closed: true, w: 1.1 }); for (let i = 0; i < 4; i++) ink(g, [[410 + i * 4, 166], [408 + i * 4, 175]], { w: 0.7 });
    wash(g, blob('440 160, 450 160, 452 167, 442 168'), '#ecd77a', { a: 0.95, blobs: 0 });
    const beak = blob('456 149, 472 150, 490 158, 474 162, 458 166', 4); wash(g, beak, '#eeb49a', { a: 0.97, blobs: 1, dark: '#d9825a', da: 0.4 }); ink(g, beak, { closed: true, w: 1.2 }); ink(g, '458 158, 474 158, 488 158', { w: 0.8 });
  });
  S.spot('beo', 395, 195, 60, 'Beo');
  return (ctx, t) => {
    const pk = S.poke('beo'), hop = pk < 0.6 ? Math.sin(pk / 0.6 * Math.PI) * 10 : 0, nod = Math.max(0, Math.sin(t * 0.9)) ** 6;
    S.put(ctx, body, { px: 395, py: 245, dy: -hop, rot: 0.02 * Math.sin(t * 1.3) - nod * 0.03 });
    const rot = 0.06 * Math.sin(t * 0.7) + nod * 0.25 + (pk < 1.5 ? Math.sin(pk * 14) * 0.12 * (1 - pk / 1.5) : 0);
    S.put(ctx, head, { px: 432, py: 168, dy: -hop, rot });
    const c = Math.cos(rot), s = Math.sin(rot), ex = 432 + (447 - 432) * c - (153 - 168) * s, ey = 168 + (447 - 432) * s + (153 - 168) * c - hop;
    eye(ctx, ex, ey, 3.2, blink(t, 2, 3.7), { ry: 0.95, col: '#2a2420', iris: 0.7, pupil: 0.45 });
  };
});

layer(42, 'macan-tutul', S => {
  const Y = '#ead9a0';
  const body = S.sprite(165, 335, 285, 462, g => {
    const legs = [blob('180 378, 200 372, 208 396, 200 424, 204 446, 210 456, 192 458, 186 440, 182 410'), blob('204 398, 216 396, 214 424, 210 440, 200 440, 204 420'),
                  blob('246 388, 260 386, 262 410, 266 428, 272 434, 256 436, 252 418'), blob('258 388, 270 384, 272 408, 276 426, 266 430, 262 410')];
    legs.forEach((l, i) => { wash(g, l, Y, { a: 0.95, blobs: 2, dark: '#b9a05a', da: 0.4, seed: 30 + i }); spots(g, l, { n: 26, size: 1.7, min: 4.5, seed: 40 + i }); ink(g, l, { closed: true, w: 1.25 }); });
    const b = blob('178 372, 198 353, 226 347, 256 345, 280 350, 284 366, 272 380, 248 392, 220 394, 204 398, 184 392');
    wash(g, b, Y, { a: 0.96, blobs: 5, dark: '#b9a05a', da: 0.35, shade: [0, 1, 0.35, '#a98f4a'] }); spots(g, b, { n: 150, size: 2.1, min: 5, rosette: true, seed: 5 }); ink(g, b, { closed: true, w: 1.3 });
  });
  const head = S.sprite(268, 338, 312, 392, g => {
    const h = blob('276 350, 288 346, 298 352, 304 366, 302 380, 294 384, 284 378, 276 366');
    wash(g, h, Y, { a: 0.97, blobs: 2, dark: '#b9a05a', da: 0.35 }); spots(g, h, { n: 28, size: 1.5, min: 4, seed: 9 }); ink(g, h, { closed: true, w: 1.3 });
    wash(g, blob('286 344, 292 342, 296 350, 290 353'), '#2c2a1c', { a: 0.9, blobs: 0 }); wash(g, blob('294 374, 302 372, 303 381, 296 384'), '#f4f1e2', { a: 0.9, blobs: 0 });
    ink(g, '296 380, 300 384', { w: 1.6 }); g.fillStyle = css('#1c1a12'); g.beginPath(); g.arc(297, 363, 1.5, 0, TAU); g.fill();
  });
  S.spot('macan', 235, 390, 70, 'Macan tutul');
  return (ctx, t) => {
    // ekor: tabung yang berayun, digambar tiap bingkai
    const pk = S.poke('macan'), sw = Math.sin(t * 1.1) * 0.8 + (pk < 2 ? Math.sin(pk * 10) * 2 * (1 - pk / 2) : 0);
    const sp = curve([[180, 374], [165 + sw * 2, 396], [159 + sw * 6, 426], [155 + sw * 11, 448], [152 + sw * 14, 458]], false, 6), poly = tube(sp, [11, 9, 8, 8, 7]);
    ctx.save(); ctx.globalAlpha = S.fade; qfill(ctx, poly, Y); qline(ctx, poly.concat([poly[0]]), 1.2, INK, 0.9);
    for (let i = 2; i < sp.length - 2; i += 2) { ctx.beginPath(); ctx.arc(sp[i][0] + (i % 4 ? 2 : -2), sp[i][1], 1.5, 0, TAU); ctx.fillStyle = css('#3d3a22', 0.85); ctx.fill(); }
    const e = sp[sp.length - 1]; ctx.beginPath(); ctx.arc(e[0], e[1], 3.6, 0, TAU); ctx.fillStyle = css('#2c2a1c'); ctx.fill(); ctx.restore();
    S.put(ctx, body, { px: 230, py: 455, sy: 1 + 0.006 * Math.sin(t * 1.4) });
    S.put(ctx, head, { px: 280, py: 356, rot: 0.07 * Math.sin(t * 0.8) + (pk < 1.2 ? -0.5 * Math.sin(pk / 1.2 * Math.PI) : 0) });
  };
});
// ───────────────────────── kanan atas: monyet hitam, kakatua, tarsius, orangutan jantan ─────────────────────────
layer(43, 'monyet', S => {
  const G = '#93a6c2', D = '#4a5f80';
  const body = S.sprite(860, 5, 980, 150, g => {
    // lengan kanan: turun mencengkeram dahan
    const armR = tube(curve(P('946 62, 950 86, 954 108, 956 124'), false, 6), [18, 13, 11, 12]);
    wash(g, armR, G, { a: 0.85, blobs: 2, dark: D, da: 0.35 }); ink(g, armR, { closed: true, w: 1.2 });
    for (const dx of [-8, -3, 2, 7, 11]) ink(g, [[956 + dx * 0.6, 122], [956 + dx, 136 + Math.abs(dx) * 0.2]], { w: 2.6, col: '#eef0ee' });
    for (const dx of [-8, -3, 2, 7, 11]) ink(g, [[956 + dx * 0.6, 122], [956 + dx, 136 + Math.abs(dx) * 0.2]], { w: 0.9 });
    const b = blob('918 18, 900 14, 880 22, 872 44, 876 70, 890 84, 914 86, 936 78, 946 60, 940 36');
    wash(g, b, G, { a: 0.9, blobs: 5, dark: D, da: 0.4, shade: [-0.4, 1, 0.4, D] }); ink(g, b, { closed: true, w: 1.3 });
    dashes(g, curve(P('884 40, 892 60, 904 76')), { w: 0.9 }); dashes(g, curve(P('900 28, 912 50, 918 70')), { w: 0.9 });
    // kaki depan & belakang: diarsir
    const leg1 = blob('890 62, 904 64, 910 84, 908 98, 900 98, 894 82'), leg2 = blob('912 72, 932 74, 934 96, 930 106, 920 104, 914 88');
    for (const l of [leg1, leg2]) { wash(g, l, G, { a: 0.9, blobs: 1, dark: D }); hatch(g, l, { ang: 0.7, gap: 2.8, col: '#2d3f5c', a: 0.75 }); ink(g, l, { closed: true, w: 1.2 }); }
    for (const dx of [-5, 0, 5]) ink(g, [[903 + dx * 0.5, 96], [904 + dx, 104]], { w: 1.2 });
  });
  const head = S.sprite(905, 5, 980, 75, g => {
    const h = blob('942 14, 958 18, 968 32, 966 50, 956 62, 942 66, 928 60, 920 46, 920 30, 928 18');
    wash(g, h, G, { a: 0.92, blobs: 3, dark: D, da: 0.4 }); ink(g, h, { closed: true, w: 1.35 });
    for (const [x, y] of [[922, 22], [968, 28]]) { const e = ell(x, y, 5, 6); wash(g, e, G, { a: 0.9, blobs: 0 }); ink(g, e, { closed: true, w: 1.2 }); }
    const f = blob('943 26, 954 30, 958 42, 954 56, 944 62, 934 56, 930 42, 934 30'); wash(g, f, '#dbe3ee', { a: 0.9, blobs: 1, edge: 0.1 });
    ink(g, '930 36, 937 33, 943 37, 950 33, 957 37', { w: 1.8 });
    ink(g, '940 46, 942 54, 947 54, 949 46', { w: 1.1 }); ink(g, '938 58, 944 60, 951 58', { w: 1.1 }); wash(g, blob('939 44, 950 44, 948 52, 941 52'), D, { a: 0.5, blobs: 0, edge: 0 });
  });
  S.spot('monyet', 920, 60, 60, 'Monyet');
  return (ctx, t) => {
    const pk = S.poke('monyet');
    // ekor: menjuntai dan melingkari dahan kecil
    const sw = Math.sin(t * 1.3) * 3, sp = curve([[876, 72], [868 + sw * 0.4, 96], [869 + sw, 120], [876 + sw * 0.6, 134]], false, 6);
    ctx.save(); ctx.globalAlpha = S.fade; const poly = tube(sp, [9, 7, 6, 6]); qfill(ctx, poly, G); qline(ctx, poly.concat([poly[0]]), 1.1, INK, 0.9);
    ctx.beginPath(); ctx.ellipse(878 + sw * 0.5, 137, 6, 9, 0.2, 0, TAU); ctx.strokeStyle = css(INK); ctx.lineWidth = 2.4; ctx.stroke(); ctx.strokeStyle = css(G); ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
    S.put(ctx, body, { px: 915, py: 100, sy: 1 + 0.008 * Math.sin(t * 1.5) });
    const rot = 0.06 * Math.sin(t * 0.6) + (pk < 1.5 ? 0.2 * Math.sin(pk * 12) * (1 - pk / 1.5) : 0);
    S.put(ctx, head, { px: 942, py: 62, rot });
    const c = Math.cos(rot), s = Math.sin(rot), b = blink(t, 5, 4.3);
    for (const [x, y] of [[937, 41], [951, 41]]) eye(ctx, 942 + (x - 942) * c - (y - 62) * s, 62 + (x - 942) * s + (y - 62) * c, 2.7, b, { ry: 0.8, col: '#3a2a1c', iris: 0.9, pupil: 0.55, lw: 0.9 });
  };
});

layer(44, 'kakatua', S => {
  const body = S.sprite(885, 220, 965, 410, g => {
    const b = blob('902 262, 900 300, 904 340, 912 372, 920 400, 940 402, 950 372, 955 330, 956 290, 952 262, 930 252');
    wash(g, b, '#f6f7f3', { a: 0.97, blobs: 5, dark: '#b9c6d6', da: 0.35, edge: 0.1, shade: [1, 0.3, 0.3, '#aebdd0'] }); ink(g, b.slice(0, 44), { w: 1.2 }); ink(g, b.slice(50), { w: 1.2 });
    const r = RNG(4); for (let i = 0; i < 50; i++) { const x = r.r(906, 950), y = r.r(270, 395); ink(g, curve([[x - 3, y], [x, y + 3], [x + 3, y]]), { w: 0.8, col: '#7f8fa6', a: 0.7 }); }
    for (let i = 0; i < 5; i++) ink(g, [[914 + i * 6, 366], [912 + i * 7, 400]], { w: 1.1 });
    wash(g, blob('906 366, 918 362, 922 378, 910 382'), '#d9a27a', { a: 0.9, blobs: 0 });
  });
  const head = S.sprite(880, 215, 965, 290, g => {
    const h = blob('912 224, 934 224, 950 236, 954 258, 946 276, 926 282, 906 276, 898 256, 902 236');
    wash(g, h, '#f8f8f4', { a: 0.98, blobs: 3, dark: '#c3cfdc', da: 0.3, edge: 0.1 }); ink(g, h, { closed: true, w: 1.25 });
    const beak = blob('902 246, 892 248, 889 258, 894 268, 902 264, 904 254', 5); wash(g, beak, '#9aa6b6', { a: 0.95, blobs: 1, dark: '#56657a', da: 0.5 }); ink(g, beak, { closed: true, w: 1.2 });
    for (let i = 0; i < 6; i++) ink(g, [[906 + i * 3, 262 + (i % 2) * 3], [909 + i * 3, 268 + (i % 2) * 3]], { w: 0.9 });
  });
  // jambul: enam helai, pangkal di ubun-ubun; bisa mekar
  const crest = [[-2.05, 62], [-1.72, 66], [-1.4, 58], [-1.08, 50], [-0.78, 44], [-0.5, 36]];
  const cf = S.sprite(-3, -9, 103, 9, g => { const p = leafPts(0, 0, 0, 100, 15, -0.12); wash(g, p, '#eccfa0', { a: 0.95, blobs: 1, dark: '#d9a86a', da: 0.5, edge: 0.3, rough: 0.4 }); ink(g, p, { closed: true, w: 1.2 }); ink(g, [[6, 0], [60, -4], [94, -11]], { w: 0.7, a: 0.6 }); });
  S.spot('kakatua', 925, 280, 60, 'Kakatua');
  return (ctx, t) => {
    const pk = S.poke('kakatua'), up = pk < 2.5 ? Math.sin(Math.min(1, pk / 0.3) * Math.PI / 2) * (1 - clamp((pk - 1.6) / 0.9)) : 0, idle = 0.5 + 0.5 * Math.sin(t * 0.5);
    S.put(ctx, body, { px: 928, py: 400, sy: 1 + 0.006 * Math.sin(t * 1.4) });
    const rot = 0.05 * Math.sin(t * 0.7) + up * 0.12 * Math.sin(t * 11);
    const c = Math.cos(rot), s = Math.sin(rot), at = (x, y) => [926 + (x - 926) * c - (y - 276) * s, 276 + (x - 926) * s + (y - 276) * c];
    const base = at(928, 226), mid = -1.3;
    crest.forEach(([a, len], i) => S.put(ctx, cf, { px: 0, py: 0, dx: base[0] + (i - 2.5) * 2.5, dy: base[1], rot: rot + mid + (a - mid) * (0.75 + 0.2 * idle + up * 0.55), sx: len / 100 * (1 + up * 0.15), sy: 1 }));
    S.put(ctx, head, { px: 926, py: 276, rot });
    const e = at(910, 243); eye(ctx, e[0], e[1], 4.2, blink(t, 6, 5.1), { ry: 1, col: '#1c1c22', iris: 0.6, pupil: 0.4, lw: 1.3 });
  };
});

layer(45, 'tarsius', S => {
  const G = '#a9b9cc', D = '#5f7590';
  const body = S.sprite(990, 485, 1135, 590, g => {
    const b = blob('1052 498, 1080 492, 1106 500, 1120 524, 1124 552, 1112 574, 1088 582, 1064 578, 1050 556, 1046 524');
    hairy(g, b, G, { n: 180, len: 8, dir: (x, y) => 1.5 + (x - 1085) * 0.02, dark: D, da: 0.35, ink: '#33445c', seed: 3 });
    // paha & kaki
    const th = blob('1072 534, 1100 528, 1120 546, 1116 572, 1096 582, 1074 574, 1064 554'); wash(g, th, '#c3ccd6', { a: 0.85, blobs: 2, dark: D, da: 0.3 }); ink(g, th, { closed: true, w: 1.2 }); fur(g, th, { n: 50, len: 7, dir: 0.6, col: '#33445c', a: 0.6 });
    ink(g, '1064 572, 1078 578, 1100 574', { w: 2.2 }); 
    // lengan menjulur ke kiri, jari panjang
    const arm = tube(curve(P('1058 512, 1040 522, 1022 526, 1008 524'), false, 6), [16, 12, 9, 8]); wash(g, arm, G, { a: 0.9, blobs: 1, dark: D }); ink(g, arm, { closed: true, w: 1.1 });
    for (const [dx, dy] of [[-14, -18], [-18, -8], [-18, 2], [-12, 10]]) { ink(g, [[1008, 524], [1008 + dx, 524 + dy]], { w: 3.2, col: '#f0d8cf' }); ink(g, [[1008, 524], [1008 + dx, 524 + dy]], { w: 0.8 }); }
    const arm2 = tube(curve(P('1066 528, 1046 532, 1028 532'), false, 5), [10, 8, 7]); wash(g, arm2, '#f0d8cf', { a: 0.9, blobs: 0 }); ink(g, arm2, { closed: true, w: 1 });
    for (const dy of [-6, 0, 6]) ink(g, [[1028, 532], [1012, 534 + dy]], { w: 0.9 });
  });
  const head = S.sprite(1020, 420, 1140, 505, g => {
    for (const [x, y, rot, s] of [[1040, 456, -0.2, 1], [1118, 446, 0.5, 1]]) { const e = ell(x, y, 11 * s, 18 * s, rot); wash(g, e, '#efc8a8', { a: 0.95, blobs: 1, dark: '#d98f5a', da: 0.4 }); ink(g, e, { closed: true, w: 1.25 }); ink(g, ell(x, y, 5, 11, rot).slice(0, 18), { w: 0.8 }); }
    const h = scallop(1076, 465, 32, 32, { seed: 2, n: 14, depth: 0.06, wild: 0.1 });
    hairy(g, h, '#c6d0dc', { n: 150, len: 6, dir: (x, y) => Math.atan2(y - 465, x - 1076), dark: D, da: 0.3, ink: '#33445c', seed: 5, a: 0.92 });
    ink(g, '1070 477, 1077 481, 1084 477', { w: 1.2 }); ink(g, '1066 487, 1077 490, 1090 486', { w: 1.3 }); ink(g, '1060 446, 1066 449', { w: 1.2 }); ink(g, '1086 448, 1094 445', { w: 1.2 });
  });
  S.spot('tarsius', 1080, 500, 70, 'Tarsius');
  return (ctx, t) => {
    const pk = S.poke('tarsius');
    // ekor: spiral logaritmik yang mengendur dan mengencang
    const curl = 1 + 0.08 * Math.sin(t * 0.8) + (pk < 2 ? 0.35 * Math.sin(pk / 2 * Math.PI) : 0), cx = 1160, cy = 556, pts = [];
    for (let i = 0; i <= 60; i++) { const u = i / 60, a = 2.6 + u * 9.2 * curl, rr = 31 * Math.exp(-u * 1.75); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 1.05]); }
    const lead = curve([[1112, 572], [1124, 584], [1140, 588], pts[0]], false, 5).concat(pts);
    ctx.save(); ctx.globalAlpha = S.fade; qline(ctx, lead, 7.5, INK, 0.9); qline(ctx, lead, 5.4, '#c9d3dc', 1); ctx.restore();
    S.put(ctx, body, { px: 1085, py: 580, sy: 1 + 0.008 * Math.sin(t * 2) });
    const rot = 0.05 * Math.sin(t * 0.45) + (pk < 1 ? 0.5 * Math.sin(pk * Math.PI) : 0);
    S.put(ctx, head, { px: 1076, py: 492, rot });
    const c = Math.cos(rot), s = Math.sin(rot), b = blink(t, 8, 3.1), lx = 2.2 * Math.sin(t * 0.37), ly = 1.5 * Math.cos(t * 0.53);
    for (const [x, y] of [[1064, 463], [1090, 462]]) eye(ctx, 1076 + (x - 1076) * c - (y - 492) * s, 492 + (x - 1076) * s + (y - 492) * c, 9.5, b, { ry: 1, col: '#f4f3ea', iris: 0.72, pupil: 0.3, lx, ly, lw: 1.4, white: '#f4f3ea' });
  };
});

layer(46, 'orangutan-jantan', S => {
  const body = S.sprite(1010, 700, 1215, 910, g => {
    const b = blob('1040 730, 1100 722, 1170 728, 1210 750, 1214 820, 1200 900, 1120 906, 1060 900, 1030 860, 1022 790');
    hairy(g, b, '#f0cbb8', { n: 300, len: 12, dir: (x, y) => 1.57 + (x - 1110) * 0.006, dark: '#dba08a', da: 0.3, seed: 11, shade: [0.6, 1, 0.35, '#7f9cb4'] });
    const arm = blob('1034 736, 1058 742, 1066 770, 1058 800, 1040 806, 1026 780'); wash(g, arm, '#dfe7ee', { a: 0.9, blobs: 2, dark: '#9fb4c8', da: 0.3 }); ink(g, arm, { closed: true, w: 1.1 });
    hatch(g, blob('1130 800, 1200 790, 1205 880, 1140 890'), { ang: 0.9, gap: 4.5, col: C.teal2, a: 0.45 });
  });
  const head = S.sprite(1030, 580, 1175, 745, g => {
    const hair = blob('1056 610, 1076 592, 1104 588, 1132 594, 1150 612, 1140 630, 1100 626, 1064 630');
    hairy(g, hair, '#e9cfa6', { n: 70, len: 9, dir: (x, y) => 1.57 + (x - 1100) * 0.02, dark: '#c9a070', seed: 12 });
    // bantalan pipi: cakram lebar
    const fl = blob('1100 610, 1136 616, 1158 644, 1162 684, 1146 718, 1118 734, 1090 736, 1064 722, 1046 690, 1046 650, 1066 620');
    wash(g, fl, '#d8e2ec', { a: 0.96, blobs: 5, dark: '#8fa9c4', da: 0.35, shade: [1, 0.3, 0.35, '#6f8fb0'] }); ink(g, fl, { closed: true, w: 1.35 });
    hatch(g, blob('1128 640, 1158 650, 1160 690, 1144 718, 1122 716, 1130 680'), { ang: 1.1, gap: 3, col: '#3d5a78', a: 0.6 });
    fur(g, blob('1050 650, 1070 660, 1076 710, 1060 716'), { n: 30, len: 9, dir: 1.9, col: '#33445c', a: 0.6 });
    const inner = blob('1098 628, 1118 636, 1126 668, 1122 704, 1100 722, 1078 712, 1068 680, 1074 644'); ink(g, inner.slice(30), { w: 1 });
    ink(g, '1070 656, 1080 646, 1096 650, 1100 644, 1112 648, 1126 656', { w: 2 });                // alis
    ink(g, '1088 676, 1090 680', { w: 2.6 }); ink(g, '1100 678, 1102 682', { w: 2.6 }); ink(g, '1094 628, 1092 638', { w: 0.8 }); ink(g, '1100 626, 1100 636', { w: 0.8 });
    ink(g, '1082 714, 1092 720, 1104 722, 1118 712', { w: 1.6 }); dashes(g, curve(P('1076 668, 1070 690, 1076 706')), { w: 0.9 });
  });
  S.spot('orang2', 1100, 720, 80, 'Orangutan jantan');
  return (ctx, t) => {
    const br = Math.sin(t * 0.9), pk = S.poke('orang2');
    S.put(ctx, body, { px: 1110, py: 905, sy: 1 + 0.01 * br, sx: 1 + 0.004 * br });
    const rot = 0.015 * Math.sin(t * 0.4) + (pk < 2 ? 0.05 * Math.sin(pk * 6) * (1 - pk / 2) : 0);
    S.put(ctx, head, { px: 1100, py: 735, rot, dy: -2 * br });
    const c = Math.cos(rot), s = Math.sin(rot), b = blink(t, 9, 5.9);
    for (const [x, y] of [[1085, 655], [1108, 654]]) eye(ctx, 1100 + (x - 1100) * c - (y - 735) * s, 735 + (x - 1100) * s + (y - 735) * c - 2 * br, 4, b, { ry: 0.6, col: '#5a4630', iris: 0.85, pupil: 0.5 });
  };
});
// ───────────────────────── kiri: babirusa, harimau, kuskus, komodo ─────────────────────────
layer(50, 'babirusa', S => {
  const G = '#bcc8d8', D = '#6f86a2';
  const sp = S.sprite(0, 700, 160, 890, g => {
    const body = blob('0 790, 40 800, 90 812, 120 830, 110 870, 60 884, 0 880'); wash(g, body, G, { a: 0.85, blobs: 4, dark: D, da: 0.35 });
    fur(g, body, { n: 90, len: 16, dir: 1.6, col: C.teal2, a: 0.7, w: 1.2 });
    const h = blob('0 728, 30 718, 62 724, 96 742, 124 762, 142 776, 144 792, 130 804, 100 812, 60 808, 20 800, 0 796');
    wash(g, h, G, { a: 0.95, blobs: 5, dark: D, da: 0.3, shade: [0, 1, 0.3, D] }); ink(g, h.slice(4), { w: 1.3 });
    const ear = blob('42 728, 52 720, 60 734, 56 750, 46 748', 5); wash(g, ear, '#a9b6c8', { a: 0.95, blobs: 0, dark: D }); ink(g, ear, { closed: true, w: 1.2 }); hatch(g, ear, { ang: 1.2, gap: 2.5, a: 0.5 });
    // taring melengkung: dua busur putih
    for (const s of ['112 792, 134 772, 142 744, 134 724, 122 722', '118 778, 132 756, 132 736, 124 728']) { ink(g, s, { w: 5.5, col: '#f6f6f0', taper: false }); const t = tube(curve(P(s), false, 8), 5.5, false); ink(g, t.L, { w: 1.1 }); ink(g, t.R, { w: 1.1 }); }
    ink(g, '100 812, 122 800, 140 796', { w: 1.3 }); g.fillStyle = css(INK); g.beginPath(); g.ellipse(136, 788, 2.6, 1.8, 0.3, 0, TAU); g.fill();
    dashes(g, curve(P('20 760, 50 772, 90 790')), { w: 0.9 }); dashes(g, curve(P('66 744, 84 750, 100 766')), { w: 0.9 });
  });
  S.spot('babirusa', 75, 770, 70, 'Babirusa');
  return (ctx, t) => {
    const pk = S.poke('babirusa'), rot = 0.012 * Math.sin(t * 0.8) + (pk < 1.2 ? 0.04 * Math.sin(pk * 12) * (1 - pk / 1.2) : 0);
    S.put(ctx, sp, { px: 0, py: 800, rot });
    const e = spin(0, 800, rot, 80, 757); eye(ctx, e[0], e[1], 4.4, blink(t, 11, 5.2), { ry: 0.55, col: '#3d3428', rot: 0.3, iris: 0.85, pupil: 0.5 });
  };
});

layer(51, 'harimau', S => {
  const W = '#f1ece6', ST = '#27495c';
  // loreng bergerigi: lensa kasar + beberapa goresan bulu di tepinya
  const lor = (g, s, w = 5, a = 0.9) => { stripe(g, s, w, ST, a); const sp = curve(typeof s === 'string' ? P(s) : s, false, 5); for (let i = 1; i < sp.length - 1; i += 2) { const d = n1(i * 1.7, sp.length) * w * 0.7; ink(g, [[sp[i][0] - d, sp[i][1] - w * 0.3], [sp[i][0] + d * 0.5, sp[i][1] + w * 0.6]], { w: 1, col: ST, a: 0.8 }); } };
  const body = S.sprite(10, 750, 350, 985, g => {
    const b = blob('150 792, 176 766, 206 760, 216 800, 226 870, 260 906, 330 924, 342 954, 312 976, 200 970, 120 962, 40 938, 18 892, 38 852, 100 834, 140 822');
    wash(g, b, W, { a: 0.94, blobs: 8, dark: '#b9c6d0', da: 0.3, shade: [0, 1, 0.28, '#9fb0c0'], light: '#fffdf8' });
    stain(g, 190, 900, 70, 34, '#ecc9b6', 0.4); stain(g, 90, 880, 54, 30, '#c9d9e6', 0.45); stain(g, 180, 800, 26, 30, '#e6d0c6', 0.4);
    const r = RNG(15);
    for (let i = 0; i < 12; i++) { const x = 40 + i * 14 + r.g() * 3, y0 = 838 + r.g() * 5 + (i > 8 ? -20 : 0), len = r.r(34, 60), bend = r.g() * 9; lor(g, [[x, y0], [x + bend, y0 + len * 0.5], [x + bend * 0.3 - 5, y0 + len]], r.r(4.5, 7.5), 0.85); }
    for (const s of ['160 776, 170 796, 166 822', '178 768, 190 790, 188 818', '196 764, 206 786, 204 812']) lor(g, s, 5, 0.85);
    for (let i = 0; i < 7; i++) { const x = 222 + i * 14, y0 = 890 + i * 3; lor(g, [[x, y0], [x - 6, y0 + 16], [x - 3, y0 + 30]], 4.6, 0.8); }
    for (let i = 0; i < 6; i++) lor(g, [[236 + i * 17, 934], [232 + i * 17, 946], [236 + i * 17, 960]], 3.4, 0.7);
    dashes(g, curve(P('200 924, 236 938, 286 944, 328 950')), { w: 1.1, len: 5 }); ink(g, '330 924, 342 954, 312 976', { w: 1.2 }); ink(g, '150 792, 176 766, 206 760', { w: 1.1, a: 0.7 });
    for (const x of [318, 326, 334]) ink(g, [[x, 950], [x + 2, 966]], { w: 1 });
    fur(g, blob('222 880, 322 888, 328 930, 250 924'), { n: 90, len: 15, dir: 1.9, col: ST, a: 0.75, w: 1.3 });
  });
  const head = S.sprite(180, 715, 352, 912, g => {
    const h = blob('206 762, 222 742, 250 732, 284 729, 314 736, 332 758, 338 800, 336 846, 326 880, 304 898, 272 900, 244 892, 218 872, 200 838, 196 800');
    wash(g, h, W, { a: 0.97, blobs: 5, dark: '#c9c3c0', da: 0.2, light: '#fffefa', la: 0.5 });
    stain(g, 292, 806, 30, 46, '#f3d6ca', 0.6); stain(g, 304, 852, 22, 18, '#f0c4bc', 0.5); stain(g, 224, 840, 22, 36, '#dfe6ec', 0.6);
    // surai pipi: tepi bergerigi
    const ruff = h.slice(Math.floor(h.length * 0.62)); for (let i = 0; i < ruff.length; i += 2) { const p = ruff[i]; ink(g, [[p[0] + 5, p[1]], [p[0] - 5 - n1(i, 4) * 3, p[1] + 5]], { w: 1, col: ST, a: 0.75 }); }
    ink(g, h.slice(0, Math.floor(h.length * 0.62)), { w: 1.2, a: 0.8 });
    // telinga: tersembul kecil di balik daun
    for (const [s] of [['214 752, 222 736, 238 734, 240 748'], ['306 738, 318 730, 330 740, 328 754']]) { const e = blob(s, 5); wash(g, e, '#e9d6cc', { a: 0.9, blobs: 0 }); ink(g, e, { w: 1.2 }); }
    // loreng dahi (berombak) & pipi (busur)
    for (const s of ['246 744, 256 754, 252 768', '262 738, 270 752, 264 768', '280 735, 284 751, 278 766', '298 737, 298 753, 292 766', '314 745, 310 759, 302 770',
      '254 772, 268 779, 282 774', '286 776, 300 782, 314 776', '264 786, 276 790, 288 787'])
      lor(g, s, 4.4);
    for (const s of ['204 782, 222 790, 240 804', '200 806, 220 816, 238 828', '202 830, 224 838, 244 846', '212 854, 234 858, 252 856', '228 876, 246 872, 260 864',
      '336 782, 326 792, 324 804', '338 818, 328 826, 326 838', '334 852, 324 858, 320 868'])
      lor(g, s, 5.2);
    lor(g, '240 808, 254 797, 272 798, 286 810', 4.6, 0.95); lor(g, '252 818, 248 838, 258 860', 4.2, 0.85); lor(g, '298 802, 312 795, 326 802', 3.8, 0.95); lor(g, '322 812, 328 826, 324 840', 3, 0.8);
    ink(g, '284 814, 290 834, 298 848', { w: 1 }); ink(g, '302 814, 306 832, 320 847', { w: 1 });
    const nose = blob('296 850, 308 847, 321 849, 318 864, 308 873, 299 864', 4); wash(g, nose, '#f0b9b2', { a: 0.97, blobs: 1, dark: '#d98f8a' }); ink(g, nose, { closed: true, w: 1.3 });
    ink(g, '308 873, 308 881', { w: 1.3 }); ink(g, '286 886, 300 886, 308 881, 318 884, 328 876', { w: 1.5 });
    g.fillStyle = css(INK); for (let i = 0; i < 15; i++) { g.beginPath(); g.arc(262 + (i % 5) * 7.5 + Math.floor(i / 5) * 2, 855 + Math.floor(i / 5) * 6.5, 1.15, 0, TAU); g.fill(); }
    for (let i = 0; i < 6; i++) ink(g, curve([[262, 858 + i * 4], [234, 858 + i * 8], [206, 864 + i * 12]]), { w: 0.6, a: 0.55 });
    for (let i = 0; i < 4; i++) ink(g, curve([[322, 860 + i * 4], [338, 862 + i * 7], [350, 870 + i * 9]]), { w: 0.6, a: 0.5 });
    fur(g, blob('236 884, 300 896, 324 884, 318 906, 250 904'), { n: 44, len: 10, dir: 1.7, col: ST, a: 0.7 });
  });
  S.spot('harimau', 265, 820, 85, 'Harimau');
  return (ctx, t) => {
    const br = Math.sin(t), pk = S.poke('harimau'), g = pk < 2.2 ? Math.sin(pk / 2.2 * Math.PI) : 0;
    S.put(ctx, body, { px: 180, py: 975, sy: 1 + 0.01 * br });
    const rot = 0.018 * Math.sin(t * 0.5) - g * 0.06;
    S.put(ctx, head, { px: 270, py: 890, rot, dy: -1.5 * br, sx: 1 + g * 0.03, sy: 1 + g * 0.03 });
    const b = Math.min(blink(t, 4, 6.3), 1 - g * 0.4);
    for (const [x, y, rr, ro] of [[264, 810, 7.5, 0.25], [313, 807, 6.2, -0.2]]) { const e = spin(270, 890, rot, x, y, -1.5 * br); eye(ctx, e[0], e[1], rr, b, { ry: 0.6, col: '#a9b98a', rot: ro + rot, iris: 0.8, pupil: 0.36, lw: 1.7, white: '#eef0e0', lx: 1 }); }
  };
});

layer(52, 'kuskus', S => {
  const B = '#bfae90', D = '#7a6a52';
  const body = S.sprite(30, 1070, 180, 1225, g => {
    const b = blob('120 1090, 86 1096, 54 1124, 40 1160, 44 1196, 64 1214, 96 1212, 120 1196, 150 1168, 160 1140, 150 1108');
    wash(g, b, B, { a: 0.93, blobs: 6, dark: D, da: 0.35, shade: [-0.3, 1, 0.35, D] }); ink(g, b, { closed: true, w: 1.25 });
    fur(g, b, { n: 60, len: 8, dir: 2.2, col: '#5a4c3a', a: 0.45 });
    // ekor melingkar & tangan memegang batang
    ink(g, ell(58, 1196, 7, 8), { closed: true, w: 2 });
    const hand = blob('120 1146, 150 1142, 166 1150, 164 1164, 140 1164, 120 1160'); wash(g, hand, '#cdbd9e', { a: 0.95, blobs: 1, dark: D }); ink(g, hand, { closed: true, w: 1.2 }); for (const dy of [0, 5, 10]) ink(g, [[150, 1146 + dy], [166, 1150 + dy]], { w: 0.9 });
  });
  const head = S.sprite(100, 1025, 190, 1120, g => {
    for (const [x, y] of [[118, 1046], [164, 1038]]) { const e = ell(x, y, 9, 10, -0.3); wash(g, e, B, { a: 0.95, blobs: 0, dark: D }); ink(g, e, { closed: true, w: 1.2 }); }
    const h = blob('112 1058, 126 1040, 150 1034, 172 1042, 182 1066, 180 1092, 168 1106, 146 1108, 124 1098, 112 1080');
    wash(g, h, B, { a: 0.96, blobs: 4, dark: D, da: 0.35, light: '#e6dcc6', la: 0.5 }); ink(g, h, { closed: true, w: 1.3 });
    wash(g, blob('160 1086, 174 1084, 178 1096, 166 1102', 4), '#3d3228', { a: 0.9, blobs: 0 }); ink(g, '150 1096, 160 1102, 170 1100', { w: 1.2 }); ink(g, '156 1060, 158 1084', { w: 0.8, a: 0.5 });
    const paw = blob('132 1098, 150 1102, 152 1114, 138 1116, 130 1108', 4); wash(g, paw, '#4a4034', { a: 0.9, blobs: 0 }); ink(g, paw, { closed: true, w: 1.1 });
  });
  S.spot('kuskus', 120, 1120, 75, 'Kuskus beruang');
  return (ctx, t) => {
    const pk = S.poke('kuskus'), rot = 0.05 * Math.sin(t * 0.55) + (pk < 1.6 ? 0.25 * Math.sin(pk / 1.6 * Math.PI) : 0);
    S.put(ctx, body, { px: 100, py: 1210, sy: 1 + 0.01 * Math.sin(t * 1.3) });
    S.put(ctx, head, { px: 146, py: 1100, rot });
    const b = blink(t, 13, 4.4);
    for (const [x, y, c] of [[143, 1073, '#3d2c1c'], [167, 1062, '#d9a83a']]) { const e = spin(146, 1100, rot, x, y); eye(ctx, e[0], e[1], 4.6, b, { ry: 0.9, col: c, iris: 0.9, pupil: 0.45, lw: 1.2 }); }
  };
});

layer(53, 'komodo', S => {
  const B = '#d3e2f0', D = '#7ea6c8';
  const body = S.sprite(150, 1090, 400, 1250, g => {
    const b = blob('300 1100, 330 1120, 336 1150, 318 1180, 290 1196, 300 1230, 270 1244, 200 1246, 164 1236, 170 1196, 200 1164, 240 1140, 270 1112');
    wash(g, b, B, { a: 0.95, blobs: 7, dark: D, da: 0.4, shade: [-0.4, 1, 0.4, '#5f8fb8'] }); ink(g, b.slice(0, 50), { w: 1.3 });
    hatch(g, blob('180 1190, 230 1160, 250 1200, 210 1236, 172 1232'), { ang: -0.8, gap: 4, col: '#3d6a8c', a: 0.5 });
    for (const s of ['256 1134, 270 1150, 268 1172', '236 1150, 246 1170, 240 1190', '290 1120, 304 1140, 300 1164']) dashes(g, curve(P(s)), { w: 1, len: 5 });
    // kaki depan dan cakar
    const leg = blob('286 1176, 316 1180, 330 1200, 322 1214, 296 1210, 282 1196'); wash(g, leg, B, { a: 0.95, blobs: 2, dark: D }); ink(g, leg, { closed: true, w: 1.2 });
    for (const dx of [0, 7, 14, 21]) ink(g, [[300 + dx, 1210], [298 + dx, 1222]], { w: 1.4 });
  });
  const head = S.sprite(285, 1060, 400, 1130, g => {
    const h = blob('300 1090, 316 1078, 346 1076, 372 1080, 387 1086, 384 1096, 362 1104, 336 1114, 312 1118, 298 1108');
    wash(g, h, B, { a: 0.97, blobs: 3, dark: D, da: 0.35, light: '#fafcfd', la: 0.5 }); ink(g, h, { closed: true, w: 1.3 });
    ink(g, '386 1092, 366 1098, 344 1106, 330 1112', { w: 1.3 }); ink(g, '374 1082, 378 1084', { w: 1.8 });
    dashes(g, curve(P('306 1100, 316 1108, 326 1106')), { w: 0.9 }); ink(g, '308 1082, 318 1078, 328 1082', { w: 1.1 });
  });
  S.spot('komodo', 320, 1110, 60, 'Komodo');
  return (ctx, t) => {
    const pk = S.poke('komodo'), rot = 0.03 * Math.sin(t * 0.6);
    S.put(ctx, body, { px: 240, py: 1240, sy: 1 + 0.008 * Math.sin(t * 0.9) });
    // lidah bercabang: menjulur sebentar tiap beberapa detik
    const cyc = (t % 4.6) / 4.6, out = Math.max(pk < 1.2 ? Math.sin(pk / 1.2 * Math.PI) : 0, cyc < 0.16 ? Math.sin(cyc / 0.16 * Math.PI) : 0);
    if (out > 0.02) { const b = spin(300, 1100, rot, 386, 1091), L = 26 * out, w = Math.sin(t * 40) * 3; ctx.save(); ctx.globalAlpha = S.fade; qline(ctx, [b, [b[0] + L * 0.7, b[1] + 2 + w * 0.3]], 1.6, '#c9506a', 1); qline(ctx, [[b[0] + L * 0.7, b[1] + 2 + w * 0.3], [b[0] + L, b[1] - 2 + w]], 1.1, '#c9506a', 1); qline(ctx, [[b[0] + L * 0.7, b[1] + 2 + w * 0.3], [b[0] + L, b[1] + 6 + w]], 1.1, '#c9506a', 1); ctx.restore(); }
    S.put(ctx, head, { px: 300, py: 1100, rot });
    const e = spin(300, 1100, rot, 318, 1086); eye(ctx, e[0], e[1], 3.6, blink(t, 15, 7.1), { ry: 0.6, col: '#2c2a1c', iris: 0.9, pupil: 0.5, lw: 1.1 });
  };
});
// ───────────────────────── bawah: rusa, landak, merak, katak, nuri, badak, kura-kura, siput ─────────────────────────
layer(60, 'rusa', S => {
  const B = '#c3b8a2', D = '#8a7c66';
  const body = S.sprite(105, 1270, 270, 1495, g => {
    for (const s of ['128 1400, 130 1430, 126 1458', '146 1402, 150 1436, 148 1462', '250 1398, 252 1424, 250 1444']) { const l = tube(curve(P(s), false, 5), [15, 10, 8]); wash(g, l, B, { a: 0.9, blobs: 1, dark: D }); ink(g, l, { closed: true, w: 1.1 }); }
    const fl = tube(curve(P('212 1396, 214 1440, 216 1482'), false, 6), [18, 11, 9]); wash(g, fl, B, { a: 0.95, blobs: 1, dark: D }); ink(g, fl, { closed: true, w: 1.2 }); wash(g, blob('210 1476, 222 1476, 223 1488, 209 1488', 3), '#3d342c', { a: 0.9, blobs: 0 });
    const b = blob('130 1300, 164 1290, 204 1290, 236 1304, 252 1336, 248 1384, 226 1408, 180 1412, 140 1408, 118 1390, 114 1340');
    wash(g, b, B, { a: 0.95, blobs: 6, dark: D, da: 0.3, shade: [0, 1, 0.3, D], light: '#e6dcc8' }); ink(g, b, { closed: true, w: 1.3 });
    fur(g, b, { n: 50, len: 7, dir: 1.3, col: '#5a4c3a', a: 0.4 }); dashes(g, curve(P('150 1330, 146 1370, 156 1400')), { w: 0.9 }); dashes(g, curve(P('196 1392, 206 1402, 218 1398')), { w: 0.9 });
  });
  const head = S.sprite(170, 1190, 335, 1395, g => {
    // ranggah: dua batang bercabang
    for (const [s, w] of [['244 1296, 228 1262, 206 1228, 188 1202', 7], ['214 1240, 206 1222, 204 1204', 4], ['290 1290, 296 1252, 300 1220, 298 1200', 7], ['297 1250, 312 1244, 326 1246', 4], ['236 1280, 222 1276, 214 1268', 3.5]]) { const a = tube(curve(P(s), false, 6), [w, w * 0.8, w * 0.35]); wash(g, a, '#a99680', { a: 0.95, blobs: 1, dark: '#5a4a3a', da: 0.4 }); ink(g, a, { closed: true, w: 1.1 }); }
    const neck = blob('216 1322, 250 1318, 262 1350, 252 1392, 214 1396, 204 1360'); wash(g, neck, B, { a: 0.95, blobs: 2, dark: D }); ink(g, neck, { w: 1.1 });
    const ear = blob('240 1312, 222 1304, 208 1308, 216 1322, 236 1328', 5); wash(g, ear, '#d6ccb8', { a: 0.95, blobs: 0, dark: D }); ink(g, ear, { closed: true, w: 1.2 });
    const ear2 = blob('296 1300, 310 1292, 318 1300, 308 1312', 5); wash(g, ear2, '#d6ccb8', { a: 0.95, blobs: 0 }); ink(g, ear2, { closed: true, w: 1.1 });
    const h = blob('240 1300, 270 1293, 298 1300, 306 1326, 302 1356, 296 1378, 284 1386, 272 1376, 256 1356, 240 1330');
    wash(g, h, '#cdc2ac', { a: 0.97, blobs: 3, dark: D, da: 0.3, light: '#ebe3d2', la: 0.5 }); ink(g, h, { closed: true, w: 1.3 });
    wash(g, blob('280 1374, 294 1372, 296 1384, 284 1388', 4), '#4a4038', { a: 0.9, blobs: 0 }); ink(g, '270 1376, 282 1380', { w: 1.1 });
  });
  S.spot('rusa', 220, 1350, 85, 'Rusa');
  return (ctx, t) => {
    const pk = S.poke('rusa'), up = pk < 2.5 ? Math.sin(pk / 2.5 * Math.PI) : 0, graze = 0.5 + 0.5 * Math.sin(t * 0.35);
    S.put(ctx, body, { px: 180, py: 1480, sy: 1 + 0.008 * Math.sin(t * 1.2) });
    const rot = 0.05 * graze - up * 0.14 + 0.01 * Math.sin(t * 2.2);
    S.put(ctx, head, { px: 232, py: 1372, rot });
    const e = spin(232, 1372, rot, 263, 1340); eye(ctx, e[0], e[1], 4.6, blink(t, 17, 4.9), { ry: 0.62, col: '#2c241c', rot: 0.5 + rot, iris: 0.95, pupil: 0.55, lw: 1.1 });
  };
});

layer(61, 'landak', S => {
  const sp = S.sprite(20, 1415, 185, 1510, g => {
    const b = blob('40 1470, 56 1440, 96 1428, 136 1440, 166 1462, 176 1480, 164 1494, 120 1498, 70 1496, 44 1490');
    wash(g, b, '#bcc6d8', { a: 0.93, blobs: 5, dark: '#6f86a2', da: 0.35 }); ink(g, b, { closed: true, w: 1.2 });
    // duri: garis sejajar rapat, belang gelap-terang
    const r = RNG(31); for (let i = 0; i < 70; i++) { const x = r.r(48, 150), y = r.r(1434, 1484), a = 2.9 + r.g() * 0.18, L = r.r(22, 40); if (!inside(b, x, y)) continue; const ex = x + Math.cos(a) * L, ey = y + Math.sin(a) * L; ink(g, [[x, y], [ex, ey]], { w: 1.5, col: '#f1f2ee' }); ink(g, [[lerp(x, ex, 0.35), lerp(y, ey, 0.35)], [lerp(x, ex, 0.75), lerp(y, ey, 0.75)]], { w: 1.5, col: '#22303f' }); }
    hatch(g, blob('60 1436, 130 1432, 150 1462, 70 1470'), { ang: 1.45, gap: 2.6, col: '#3d5068', a: 0.5, w: 0.7 });
    g.fillStyle = css(INK); g.beginPath(); g.arc(163, 1476, 1.8, 0, TAU); g.fill(); ink(g, '170 1484, 176 1482', { w: 1.3 });
  });
  S.spot('landak', 100, 1465, 60, 'Landak');
  return (ctx, t) => { const pk = S.poke('landak'), sh = pk < 1.5 ? Math.sin(pk * 40) * 0.012 * (1 - pk / 1.5) : 0; S.put(ctx, sp, { px: 110, py: 1495, sy: 1 + 0.012 * Math.sin(t * 1.6) + (pk < 1.5 ? 0.08 * (1 - pk / 1.5) : 0), rot: sh }); };
});

layer(62, 'merak', S => {
  const tail = S.sprite(55, 1480, 270, 1580, g => {
    const tl = tube(curve(P('250 1500, 190 1520, 120 1546, 66 1562')), [34, 26, 16, 6]); wash(g, tl, '#9590ae', { a: 0.9, blobs: 4, dark: '#4a4a6a', da: 0.4, light: '#c9c6d8' }); ink(g, tl, { closed: true, w: 1.2 });
    for (let i = 0; i < 5; i++) ink(g, curve([[250, 1490 + i * 5], [170, 1516 + i * 4], [70 + i * 3, 1558 + i * 1.5]]), { w: 0.8, a: 0.7 });
  });
  const body = S.sprite(190, 1455, 365, 1590, g => {
    for (const [s, f] of [['272 1526, 280 1552, 290 1574', [290, 1575]], ['302 1524, 306 1546, 306 1564', [306, 1565]]]) { ink(g, s, { w: 2.8, col: '#b9b9a6' }); ink(g, s, { w: 0.9 }); for (const a of [0.1, 0.5, 0.9]) ink(g, [f, [f[0] + Math.cos(a) * 26, f[1] + Math.sin(a) * 12]], { w: 1.4 }); }
    const b = blob('214 1500, 250 1482, 300 1474, 340 1480, 352 1500, 340 1522, 300 1534, 250 1532, 220 1520');
    wash(g, b, '#4f9a8c', { a: 0.93, blobs: 6, dark: '#1f5a5c', da: 0.45, light: '#a9d6b0', la: 0.4, shade: [0, 1, 0.4, '#1f4a5c'] }); ink(g, b, { closed: true, w: 1.3 });
    for (let i = 0; i < 5; i++) ink(g, curve([[240 + i * 4, 1490 + i * 6], [280, 1486 + i * 7], [326 - i * 3, 1494 + i * 6]]), { w: 0.9, a: 0.7 });
  });
  const neck = S.sprite(310, 1400, 385, 1505, g => {
    const n = blob('326 1438, 340 1422, 354 1428, 356 1456, 362 1482, 352 1500, 332 1500, 324 1474'); wash(g, n, '#6fae7c', { a: 0.95, blobs: 3, dark: '#2c6a5c', da: 0.4, light: '#d6dc9a', la: 0.5 }); ink(g, n, { closed: true, w: 1.25 });
    // sisik leher: busur berselang
    for (let row = 0; row < 7; row++) for (let i = 0; i < 4; i++) { const x = 330 + i * 8 + (row % 2) * 4, y = 1446 + row * 8; if (inside(n, x, y)) ink(g, curve([[x - 4, y], [x, y + 4], [x + 4, y]]), { w: 0.85, col: '#1f4a4c' }); }
    const beak = P('356 1428, 372 1432, 356 1438'); wash(g, beak, '#8a8a7a', { a: 0.95, blobs: 0, rough: 0.3 }); ink(g, beak, { closed: true, w: 1.1 });
    for (const a of [-1.9, -1.6, -1.3]) ink(g, [[340, 1422], [340 + Math.cos(a) * 14, 1422 + Math.sin(a) * 14]], { w: 1 });
  });
  S.spot('merak', 300, 1490, 70, 'Merak hijau');
  return (ctx, t) => {
    const pk = S.poke('merak'), peck = Math.max(0, Math.sin(t * 0.7)) ** 8, rot = 0.05 * Math.sin(t * 1.1) + peck * 0.35 + (pk < 1.2 ? -0.3 * Math.sin(pk / 1.2 * Math.PI) : 0);
    S.put(ctx, tail, { px: 250, py: 1505, rot: 0.02 * Math.sin(t * 0.8) }); S.put(ctx, body, { px: 280, py: 1575, rot: 0.01 * Math.sin(t * 1.1) });
    S.put(ctx, neck, { px: 342, py: 1496, rot });
    const e = spin(342, 1496, rot, 341, 1430); eye(ctx, e[0], e[1], 3, blink(t, 19, 3.9), { ry: 0.9, col: '#3a2418', iris: 0.9, pupil: 0.5, lw: 0.9 });
  };
});

layer(63, 'katak', S => {
  const sp = S.sprite(365, 1410, 450, 1480, g => {
    const leg = blob('380 1450, 396 1444, 410 1456, 404 1468, 384 1468'); wash(g, leg, '#c99a8a', { a: 0.95, blobs: 1, dark: '#7a5a52' }); ink(g, leg, { closed: true, w: 1.1 });
    const b = blob('378 1452, 388 1436, 406 1426, 424 1424, 434 1432, 432 1444, 424 1452, 420 1464, 400 1462, 384 1462');
    wash(g, b, '#d2a596', { a: 0.96, blobs: 3, dark: '#8a5a52', da: 0.4, light: '#f0d6c8' }); ink(g, b, { closed: true, w: 1.25 });
    g.fillStyle = css('#5a3a34', 0.7); for (const [x, y] of [[392, 1444], [400, 1438], [408, 1446], [398, 1452], [414, 1440]]) { g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill(); }
    ink(g, '424 1452, 428 1464, 436 1468', { w: 2 }); ink(g, '432 1440, 426 1442', { w: 1.1 });
  });
  const pad = S.sprite(360, 1440, 470, 1500, g => { const p = ell(412, 1470, 46, 16, -0.05); wash(g, p, '#a9d6a0', { a: 0.85, blobs: 3, dark: C.green, da: 0.4 }); ink(g, p, { closed: true, w: 1 }); ink(g, [[412, 1470], [450, 1462]], { w: 0.8 }); });
  S.spot('katak', 405, 1445, 45, 'Katak');
  return (ctx, t) => {
    const pk = S.poke('katak'), cyc = t % 11, j = pk < 0.9 ? pk / 0.9 : (cyc < 0.9 ? cyc / 0.9 : -1), h = j >= 0 ? Math.sin(j * Math.PI) * 34 : 0, squash = j >= 0 ? 1 + 0.25 * Math.sin(j * Math.PI * 2) : 1 + 0.03 * Math.sin(t * 3);
    S.put(ctx, pad, { px: 412, py: 1470, rot: 0.015 * Math.sin(t * 0.9), dy: j >= 0 ? Math.sin(j * Math.PI * 3) * 1.5 * (1 - j) : 0 });
    S.put(ctx, sp, { px: 405, py: 1466, dy: -h, sy: squash, sx: 1 / Math.sqrt(squash) });
    // kantung suara mengembang-kempis
    const thr = 0.5 + 0.5 * Math.sin(t * 3.2); ctx.save(); ctx.globalAlpha = S.fade * 0.9; ctx.beginPath(); ctx.ellipse(426, 1450 - h, 4 + 4 * thr, 3 + 3 * thr, 0, 0, TAU); ctx.fillStyle = css('#f0dcd0'); ctx.fill(); ctx.strokeStyle = css(INK); ctx.lineWidth = 0.9; ctx.stroke(); ctx.restore();
    eye(ctx, 417, 1432 - h, 3.8, blink(t, 21, 3.3), { ry: 0.9, col: '#c98a2a', iris: 0.9, pupil: 0.45, lw: 1.1 });
  };
});

layer(64, 'nuri', S => {
  const G = '#7fbf80';
  const body = S.sprite(900, 1040, 1120, 1200, g => {
    ink(g, '905 1060, 938 1108, 990 1150', { w: 4.5, col: '#a9a088' }); ink(g, '905 1058, 938 1106, 990 1148', { w: 1 });
    const tail = tube(curve(P('1010 1100, 1050 1130, 1086 1164, 1110 1190')), [44, 34, 22, 8]); wash(g, tail, '#3f7f76', { a: 0.9, blobs: 3, dark: '#1c4a52', da: 0.5 }); hatch(g, tail, { ang: 0.75, gap: 3.2, col: '#16343c', a: 0.6 }); ink(g, tail, { closed: true, w: 1.2 });
    const b = blob('948 1056, 968 1046, 1000 1050, 1030 1068, 1044 1096, 1034 1124, 1008 1140, 976 1136, 952 1112, 944 1080');
    wash(g, b, G, { a: 0.95, blobs: 6, dark: '#2c7a5c', da: 0.4, light: '#d6e68a', la: 0.5, grad: ['#c9dc6a', 1000, 1060, 950, 1120, 0.6] }); ink(g, b, { closed: true, w: 1.3 });
    for (let i = 0; i < 22; i++) { const x = 956 + (i % 6) * 9 + (Math.floor(i / 6) % 2) * 4, y = 1076 + Math.floor(i / 6) * 11; ink(g, curve([[x - 3, y], [x, y + 3], [x + 3, y]]), { w: 0.75, col: '#2c6a4c', a: 0.8 }); }
    const wing = blob('1024 1070, 1048 1066, 1066 1080, 1058 1094, 1034 1098', 5); wash(g, wing, '#d98a52', { a: 0.95, blobs: 1, dark: '#9a5028', da: 0.45 }); ink(g, wing, { closed: true, w: 1.2 });
    for (const dx of [0, 7, 14]) ink(g, [[958 + dx, 1128], [954 + dx, 1142]], { w: 2.6, col: '#f0c4c0' }); for (const dx of [0, 7, 14]) ink(g, [[958 + dx, 1128], [954 + dx, 1142]], { w: 0.8 });
  });
  const head = S.sprite(935, 1000, 1020, 1075, g => {
    const h = blob('952 1024, 966 1012, 986 1012, 1000 1024, 1002 1044, 990 1058, 968 1060, 952 1048'); wash(g, h, G, { a: 0.97, blobs: 3, dark: '#2c7a5c', da: 0.35, light: '#bfe0a0' }); ink(g, h, { closed: true, w: 1.3 });
    const beak = blob('974 1042, 994 1040, 1004 1052, 1002 1066, 990 1056, 978 1052', 5); wash(g, beak, '#e9a86a', { a: 0.97, blobs: 1, dark: '#c9702a', da: 0.45 }); ink(g, beak, { closed: true, w: 1.2 });
  });
  S.spot('nuri', 990, 1080, 65, 'Nuri');
  return (ctx, t) => {
    const pk = S.poke('nuri'), rot = 0.1 * Math.sin(t * 0.6) * Math.sin(t * 0.23) + (pk < 1.5 ? 0.35 * Math.sin(pk / 1.5 * Math.PI) : 0);
    S.put(ctx, body, { px: 980, py: 1140, rot: 0.012 * Math.sin(t * 1.2) }); S.put(ctx, head, { px: 978, py: 1058, rot });
    const e = spin(978, 1058, rot, 963, 1033); eye(ctx, e[0], e[1], 4, blink(t, 23, 4.2), { ry: 0.95, col: '#e9e6d6', iris: 0.9, pupil: 0.38, lw: 1.1 });
  };
});

layer(66, 'badak', S => {
  const B = '#c6dae9', D = '#7fa9cc';
  const body = S.sprite(960, 1195, 1215, 1600, g => {
    const leg2 = blob('1040 1440, 1090 1436, 1094 1500, 1088 1560, 1070 1584, 1046 1580, 1040 1520'); wash(g, leg2, B, { a: 0.95, blobs: 3, dark: D, da: 0.4, shade: [1, 0, 0.4, '#5f8fb8'] }); ink(g, leg2, { closed: true, w: 1.25 });
    hatch(g, blob('1056 1470, 1074 1462, 1076 1510, 1060 1530'), { ang: 0.9, gap: 3.2, col: '#2f5878', a: 0.6 });
    const b = blob('1000 1230, 1060 1208, 1130 1210, 1190 1230, 1215 1290, 1215 1400, 1180 1440, 1100 1446, 1030 1440, 992 1400, 986 1310');
    wash(g, b, '#a9c9e2', { a: 0.94, blobs: 9, dark: '#5f95c4', da: 0.42, light: '#e3eef6', la: 0.45, shade: [0.5, 0.6, 0.3, '#4f85b4'] }); ink(g, b.slice(0, 30), { w: 1.3 });
    // lipatan kulit: pita arsir melengkung
    for (const s of ['1004 1262, 1030 1284, 1040 1316, 1036 1340', '1024 1252, 1048 1272, 1058 1300', '1000 1432, 1040 1426, 1090 1428']) { const f = tube(curve(P(s), false, 6), 9); hatch(g, f, { ang: 0.9, gap: 2.6, col: '#2f5878', a: 0.7 }); const tb = tube(curve(P(s), false, 6), 9, false); ink(g, tb.L, { w: 1 }); }
    dashes(g, curve(P('1110 1240, 1130 1300, 1124 1380')), { w: 0.9, len: 5, gap: 6 }); dashes(g, curve(P('1160 1250, 1176 1320, 1170 1400')), { w: 0.9, len: 4, gap: 7 });
    const leg1 = blob('978 1380, 1040 1384, 1044 1440, 1038 1500, 1024 1530, 992 1528, 984 1470'); wash(g, leg1, B, { a: 0.96, blobs: 3, dark: D, da: 0.4 }); ink(g, leg1, { closed: true, w: 1.25 });
    hatch(g, blob('1000 1390, 1040 1388, 1030 1450, 996 1470'), { ang: -0.9, gap: 3.4, col: '#2f5878', a: 0.65 });
    hatch(g, blob('976 1384, 1000 1392, 996 1440, 980 1430'), { ang: 0.9, gap: 3, col: '#2f5878', a: 0.6 });
  });
  const ears = [['988 1262, 996 1226, 1020 1206, 1050 1204, 1054 1222, 1036 1250, 1012 1266', 1022, 1260], ['952 1254, 962 1228, 978 1216, 986 1232, 976 1256', 966, 1256]].map(([s, px, py], i) => ({ px, py, sp: S.sprite(940, 1195, 1065, 1275, g => { const e = blob(s, 5); wash(g, e, B, { a: 0.96, blobs: 1, dark: D }); if (!i) wash(g, blob('1014 1226, 1040 1216, 1042 1232, 1024 1246', 4), '#ecd0c8', { a: 0.85, blobs: 0, edge: 0 }); ink(g, e, { closed: true, w: 1.25 }); }) }));
  const head = S.sprite(845, 1235, 1020, 1400, g => {
    const h = blob('868 1294, 900 1272, 940 1254, 976 1252, 1004 1272, 1012 1320, 1006 1362, 984 1386, 952 1384, 936 1366, 900 1376, 876 1380, 860 1362, 856 1326');
    wash(g, h, '#d6e4ef', { a: 0.97, blobs: 5, dark: D, da: 0.3, light: '#f6fafc', la: 0.5 }); ink(g, h, { closed: true, w: 1.3 });
    const horn = blob('862 1304, 858 1288, 870 1292, 876 1304', 4); wash(g, horn, '#e3e0d2', { a: 0.95, blobs: 0 }); ink(g, horn, { closed: true, w: 1.1 });
    ink(g, '874 1378, 900 1368, 936 1360', { w: 1.5 }); const nos = ell(868, 1350, 5, 3.4, 0.4); wash(g, nos, '#6f86a2', { a: 0.9, blobs: 0 }); ink(g, nos, { closed: true, w: 1.1 });
    for (let i = 0; i < 4; i++) dashes(g, ell(958, 1309, 8 + i * 5, 6 + i * 4, 0.2), { w: 0.85, len: 4, gap: 4 });
    dashes(g, curve(P('896 1322, 912 1332, 930 1330')), { w: 0.9 }); dashes(g, curve(P('950 1340, 966 1366, 990 1378')), { w: 0.9 }); ink(g, '936 1366, 946 1344, 968 1336', { w: 1 });
  });
  S.spot('badak', 990, 1330, 110, 'Badak');
  return (ctx, t) => {
    const pk = S.poke('badak'), br = Math.sin(t * 0.8), rot = 0.012 * Math.sin(t * 0.5) + (pk < 2 ? 0.04 * Math.sin(pk / 2 * Math.PI) : 0);
    S.put(ctx, body, { px: 1100, py: 1590, sy: 1 + 0.006 * br });
    ears.forEach((e, i) => S.put(ctx, e.sp, { px: e.px, py: e.py, rot: rot + 0.06 * Math.max(0, Math.sin(t * 1.7 + i * 2)) ** 6 * (i ? -1 : 1) + (pk < 1 ? 0.3 * Math.sin(pk * 20) * (1 - pk) : 0) }));
    S.put(ctx, head, { px: 990, py: 1330, rot });
    const e = spin(990, 1330, rot, 958, 1309); eye(ctx, e[0], e[1], 4.4, blink(t, 25, 6.7), { ry: 0.6, col: '#3d3428', rot: 0.2, iris: 0.85, pupil: 0.5 });
  };
});

layer(67, 'kura-kura', S => {
  const shell = S.sprite(820, 1435, 940, 1530, g => {
    for (const [x, y] of [[850, 1508], [900, 1512]]) { const l = blob([[x - 8, y - 8], [x + 8, y - 8], [x + 10, y + 8], [x - 4, y + 12]], 4); wash(g, l, '#a9a896', { a: 0.9, blobs: 0 }); ink(g, l, { closed: true, w: 1.1 }); }
    const s = blob('838 1486, 846 1464, 870 1452, 900 1452, 922 1468, 928 1490, 914 1506, 880 1510, 850 1504');
    wash(g, s, '#aaa694', { a: 0.95, blobs: 4, dark: '#5f5a4c', da: 0.4, light: '#d6d2c0' }); ink(g, s, { closed: true, w: 1.35 });
    // sisik tempurung: sel-sel Voronoi (titik inti acak, tepi = garis tengah antar inti)
    const r = RNG(8), seeds = []; for (let i = 0; i < 16; i++) seeds.push([r.r(846, 920), r.r(1458, 1504)]);
    g.save(); trace(g, s); g.clip(); g.strokeStyle = css('#4a463a', 0.7); g.lineWidth = 0.9;
    for (let x = 838; x < 930; x += 2) for (let y = 1452; y < 1512; y += 2) { let d1 = 1e9, d2 = 1e9; for (const q of seeds) { const d = Math.hypot(q[0] - x, (q[1] - y) * 1.5); if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d; } if (d2 - d1 < 1.3) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1.6, y + 0.6); g.stroke(); } }
    g.restore();
  });
  S.spot('kura', 880, 1480, 60, 'Kura-kura');
  return (ctx, t) => {
    const pk = S.poke('kura'), hide = pk < 3 ? Math.sin(Math.min(1, pk / 0.25) * Math.PI / 2) * (1 - clamp((pk - 2) / 1)) : 0, dx = Math.sin(t * 0.12) * 6, ext = (0.6 + 0.4 * Math.sin(t * 0.5)) * (1 - hide);
    // kepala: menjulur dari tempurung
    const hx = 842 + dx - 34 * ext, hy = 1482 - 4 * ext; ctx.save(); ctx.globalAlpha = S.fade;
    const nk = tube([[846 + dx, 1486], [hx + 12, hy + 2], [hx, hy]], [11, 10, 12]); qfill(ctx, nk, '#b9b8a4'); qline(ctx, nk.concat([nk[0]]), 1.1, INK, 0.9);
    ctx.beginPath(); ctx.arc(hx + 1, hy - 2, 1.4, 0, TAU); ctx.fillStyle = css(INK); ctx.fill(); ctx.restore();
    S.put(ctx, shell, { px: 880, py: 1500, dx, rot: 0.01 * Math.sin(t * 1.1) });
  };
});

layer(68, 'siput', S => {
  const sp = S.sprite(895, 1535, 1000, 1605, g => {
    // cangkang: spiral logaritmik r = a·e^(bθ), digambar sebagai pita yang melebar
    const cx = 952, cy = 1578, pts = []; for (let i = 0; i <= 90; i++) { const th = i / 90 * 4.2 * Math.PI, rr = 3 * Math.exp(0.19 * th); pts.push([cx + Math.cos(th + 2.6) * rr * 1.25, cy + Math.sin(th + 2.6) * rr * 0.9]); }
    const outer = blob('912 1592, 918 1566, 940 1548, 970 1546, 990 1560, 986 1584, 960 1598, 930 1600'); wash(g, outer, '#b8ae9c', { a: 0.95, blobs: 3, dark: '#6a5c4c', da: 0.4, light: '#e0d8c6' }); ink(g, outer, { closed: true, w: 1.3 });
    ink(g, pts, { w: 1.2 }); for (let i = 20; i < 90; i += 4) { const a = pts[i], b = pts[Math.max(0, i - 28)]; ink(g, [a, [lerp(a[0], b[0], 0.55), lerp(a[1], b[1], 0.55)]], { w: 0.7, a: 0.7 }); }
  });
  return (ctx, t) => {
    const dx = ((t * 0.5) % 60) * 0.25 - 4;
    ctx.save(); ctx.globalAlpha = S.fade; const foot = blob([[908 - dx, 1598], [900 - dx, 1588], [912 - dx, 1582], [940 - dx, 1590], [980 - dx, 1596], [960 - dx, 1602]]); qfill(ctx, foot, '#d6d0c0'); qline(ctx, foot.concat([foot[0]]), 1, INK, 0.9);
    for (const s of [-1, 1]) { const w = Math.sin(t * 1.3 + s) * 2; qline(ctx, [[903 - dx, 1586], [896 - dx + s * 3, 1574 + w]], 1, INK, 0.9); ctx.beginPath(); ctx.arc(896 - dx + s * 3, 1574 + w, 1.4, 0, TAU); ctx.fillStyle = css(INK); ctx.fill(); }
    ctx.restore(); S.put(ctx, sp, { px: 950, py: 1590, dx: -dx, rot: 0.02 * Math.sin(t * 0.9) });
  };
});
// ───────────────────────── bunga & tumbuhan besar ─────────────────────────
// bunga dengan n kelopak (kurva mawar yang dipertebal): kembang sepatu, rafflesia, bintang
function flower(g, x, y, R, n, col, o = {}) {
  const r = RNG(o.seed ?? x), rot = o.rot ?? 0;
  for (let i = 0; i < n; i++) {
    const a = rot + i / n * TAU + r.g() * 0.08, p = petal(x, y, a, R * r.r(0.9, 1.08), R * (o.wid ?? 0.95), { k: o.k ?? 0.62, p: o.p ?? 0.6 });
    wash(g, p, col, { a: o.a ?? 0.9, blobs: 3, dark: o.dark ?? mix(col, '#a03020', 0.4), da: 0.3, light: '#fff6ee', la: 0.4, rough: 1.5, seed: i + (o.seed ?? 1) * 9 });
    ink(g, p, { closed: true, w: 1, col: o.ink ?? '#7a3a2c', a: 0.85 });
    if (o.veins) for (let k = -2; k <= 2; k++) ink(g, curve([[x + Math.cos(a) * R * 0.15, y + Math.sin(a) * R * 0.15], [x + Math.cos(a + k * 0.1) * R * 0.55, y + Math.sin(a + k * 0.1) * R * 0.55], [x + Math.cos(a + k * 0.17) * R * 0.86, y + Math.sin(a + k * 0.17) * R * 0.86]]), { w: 0.7, col: o.ink ?? '#a04a3a', a: 0.7 });
  }
}
// daun panjang melengkung (bromelia, pandan): tabung meruncing di sepanjang busur
function blade(g, x, y, ang, len, wid, col, o = {}) {
  const droop = o.droop ?? 0.6, sp = []; for (let i = 0; i <= 14; i++) { const t = i / 14, a = ang + droop * t * t * (o.dir ?? 1); sp.push([x + Math.cos(ang) * len * t * (1 - 0.15 * t) + Math.cos(a + Math.PI / 2 * (o.dir ?? 1)) * len * 0.35 * t * t * Math.abs(droop), y + Math.sin(ang) * len * t * (1 - 0.15 * t) + Math.sin(a + Math.PI / 2 * (o.dir ?? 1)) * len * 0.35 * t * t * Math.abs(droop)]); }
  const p = tube(sp, t => wid * (0.35 + 0.65 * Math.sin(Math.PI * clamp(t * 0.85 + 0.12))) * (1 - t * 0.55));
  wash(g, p, col, { a: 0.88, blobs: 2, dark: C.teal2, da: 0.3, rough: 0.8, seed: o.seed }); if (o.hatch) hatch(g, tube(sp.slice(0, 11), wid * 0.4).map(q => [q[0], q[1] + wid * 0.2]), { ang: ang + 1.2, gap: 3, col: C.teal2, a: 0.6 });
  ink(g, p, { closed: true, w: 1.05 }); ink(g, sp, { w: 0.8, a: 0.7 });
  return sp;
}
// pakis: tulang melengkung dengan anak daun berpasangan yang mengecil
function fern(g, x, y, ang, len, col, o = {}) {
  const sp = [], n = o.n ?? 16, curl = o.curl ?? 0.5; for (let i = 0; i <= n; i++) { const t = i / n, a = ang + curl * t * t; sp.push([x + Math.cos(ang + curl * t * 0.5) * len * t, y + Math.sin(ang + curl * t * 0.5) * len * t]); }
  for (let i = 1; i < n; i++) { const t = i / n, a = Math.atan2(sp[i + 1][1] - sp[i - 1][1], sp[i + 1][0] - sp[i - 1][0]), L = (o.w ?? len * 0.22) * Math.sin(Math.PI * (0.12 + 0.88 * t) ** 0.7) * (1 - t * 0.4);
    for (const s of [-1, 1]) { const p = leafPts(sp[i][0], sp[i][1], a + s * 1.15, L, L * 0.34, 0, 5); g.save(); trace(g, p); g.fillStyle = css(col, o.a ?? 0.85); g.fill(); g.restore(); if (o.ink !== false) ink(g, p, { closed: true, w: 0.6, a: 0.7 }); } }
  ink(g, sp, { w: 1, col: o.stem ?? INK2 });
}

layer(48, 'anggrek-bromelia', S => {
  const fan = S.sprite(90, 590, 360, 770, g => {
    const B = [205, 752];
    for (const [a, len, wid, col, droop, dir, h] of [[-2.7, 120, 26, C.green2, 0.7, -1, 1], [-2.35, 150, 24, C.green, 0.9, -1, 0], [-2.0, 150, 22, C.green2, 0.5, -1, 1], [-1.7, 140, 22, '#7fb890', 0.2, -1, 0],
      [-1.25, 170, 24, C.green2, 0.8, 1, 1], [-0.95, 150, 24, C.green, 0.9, 1, 0], [-0.6, 140, 26, C.green2, 0.7, 1, 1], [-0.3, 120, 24, C.green, 0.5, 1, 0], [-3.0, 100, 22, C.green, 0.4, -1, 0]])
      blade(g, B[0], B[1], a, len, wid, col, { droop, dir, hatch: h, seed: Math.round(a * 10) });
    stain(g, 205, 752, 16, 12, C.deep, 0.7);
  });
  // anggrek kantung: sepal punggung, kantung kuning, dua kelopak panjang terpilin
  const orchid = (x, y, s, seed) => ({ x, y, sp: S.sprite(x - 40 * s, y - 60 * s, x + 46 * s, y + 70 * s, g => {
    ink(g, curve([[x, y - 8 * s], [x - 4 * s, y - 34 * s], [x + 6 * s, y - 58 * s]]), { w: 1.4, col: '#6a5a3a' });
    for (const d of [-1, 1]) { const tw = []; for (let i = 0; i <= 12; i++) { const t = i / 12; tw.push([x + d * (8 + 26 * t) * s + Math.sin(t * 9) * 2.5 * s, y + (4 + 56 * t * t + 10 * t) * s]); } const p = tube(tw, t => 9 * s * (1 - t * 0.7)); wash(g, p, '#d99a62', { a: 0.9, blobs: 1, dark: '#9a5a32', da: 0.4, rough: 0.6 }); ink(g, p, { closed: true, w: 0.95, col: '#5a3a26' }); }
    const dorsal = petal(x, y - 2 * s, -1.57 + 0.15, 30 * s, 26 * s, { k: 0.75 }); wash(g, dorsal, '#b98a6a', { a: 0.92, blobs: 2, dark: '#6a4a3a', da: 0.4 }); ink(g, dorsal, { closed: true, w: 1, col: '#4a3226' }); for (let k = -2; k <= 2; k++) ink(g, [[x, y - 4 * s], [x + k * 4 * s, y - 26 * s]], { w: 0.6, col: '#4a3226', a: 0.6 });
    const pouch = blob([[x - 12 * s, y + 2 * s], [x + 10 * s, y], [x + 15 * s, y + 16 * s], [x + 4 * s, y + 30 * s], [x - 10 * s, y + 26 * s], [x - 16 * s, y + 12 * s]]);
    wash(g, pouch, '#efc85a', { a: 0.96, blobs: 2, dark: '#d99a2a', da: 0.45, light: '#fff3c0' }); ink(g, pouch, { closed: true, w: 1.1, col: '#5a3a26' });
  }), ph: seed });
  const os = [orchid(112, 566, 1, 1), orchid(162, 574, 0.95, 2.3), orchid(204, 590, 0.9, 4.1)];
  const florets = S.sprite(270, 610, 385, 700, g => {
    const r = RNG(6); for (let i = 0; i < 16; i++) { const x = 286 + (i % 5) * 11 + r.g() * 3, y = 626 + Math.floor(i / 5) * 12 + r.g() * 3; flower(g, x, y, 7.5, 5, C.lime, { ink: '#2d5a3a', wid: 0.9, seed: i, dark: C.green }); }
    for (let i = 0; i < 12; i++) { const x = 334 + (i % 4) * 11 + r.g() * 3, y = 654 + Math.floor(i / 4) * 12 + r.g() * 3; flower(g, x, y, 7, 5, '#f1ecc8', { ink: '#6a5a3a', wid: 0.9, seed: i + 30, dark: '#c9b070' }); }
  });
  return (ctx, t) => {
    S.put(ctx, fan, { px: 205, py: 752, skx: 0.02 * Math.sin(t * 0.8) });
    for (const o of os) S.put(ctx, o.sp, { px: o.x, py: o.y - 56, rot: 0.05 * Math.sin(t * 1.1 + o.ph) });
    S.put(ctx, florets, { px: 320, py: 700, rot: 0.01 * Math.sin(t * 0.9) });
  };
});

layer(49, 'kecombrang', S => {
  const sp = S.sprite(315, 795, 400, 1020, g => {
    const st = tube(curve(P('352 898, 350 950, 346 1012')), [12, 13, 14]); wash(g, st, '#efe6e2', { a: 0.95, blobs: 2, dark: '#c9a9b0', da: 0.3 }); ink(g, st, { closed: true, w: 1.1 });
    // kerucut sisik: baris-baris kelopak kecil yang saling menutup, dari bawah ke atas
    wash(g, blob('356 806, 380 824, 392 860, 384 892, 356 902, 330 892, 322 858, 334 824'), '#e3856a', { a: 0.9, blobs: 3, dark: '#b0503a', da: 0.35 });
    for (let row = 0; row < 8; row++) { const y = 892 - row * 11, half = 30 * Math.sin(Math.PI * (0.18 + 0.82 * (1 - row / 8)) * 0.62), n = Math.max(2, Math.round(half / 6.5)); for (let i = 0; i < n; i++) { const x = 356 + (i - (n - 1) / 2) * (half * 2 / n) + (row % 2) * 3; const p = petal(x, y + 5, -1.57 + (x - 356) * 0.012, 15, 12, { k: 0.8 }); wash(g, p, row % 2 ? '#e9957a' : '#de7e62', { a: 0.95, blobs: 1, dark: '#a8442e', da: 0.4, rough: 0.5, seed: row * 9 + i }); ink(g, p, { closed: true, w: 0.9, col: '#6a2c22' }); } }
  });
  return (ctx, t) => S.put(ctx, sp, { px: 348, py: 1010, rot: 0.018 * Math.sin(t * 0.9 + 1) });
});

layer(54, 'kembang-sepatu', S => {
  const mk = (x, y, R, rot, seed) => ({ x, y, sp: S.sprite(x - R * 1.15, y - R * 1.15, x + R * 1.15, y + R * 1.15, g => {
    flower(g, x, y, R, 5, '#f4bca4', { rot, veins: true, seed, wid: 1.05, ink: '#a8523c', dark: '#e08a6a' });
    stain(g, x, y, R * 0.3, R * 0.3, '#8a6a86', 0.55);
    const a = rot + 0.9, tip = [x + Math.cos(a) * R * 0.62, y + Math.sin(a) * R * 0.62]; ink(g, [[x, y], tip], { w: 1.6, col: '#a8523c' });
    for (let i = 0; i < 9; i++) { const b = a + (i - 4) * 0.35, q = [tip[0] + Math.cos(b) * 7, tip[1] + Math.sin(b) * 7]; ink(g, [[lerp(x, tip[0], 0.7), lerp(y, tip[1], 0.7)], q], { w: 0.7, col: '#a8523c' }); g.fillStyle = css('#8a3a2c'); g.beginPath(); g.arc(q[0], q[1], 1.3, 0, TAU); g.fill(); }
  }), ph: seed });
  const fl = [mk(70, 1004, 74, 0.3, 2), mk(128, 950, 70, 1.1, 5)];
  return (ctx, t) => { for (const f of fl) S.put(ctx, f.sp, { px: f.x, py: f.y, rot: 0.03 * Math.sin(t * 0.7 + f.ph), sx: 1 + 0.01 * Math.sin(t * 1.3 + f.ph) }); };
});

layer(55, 'rafflesia', S => {
  const x = 378, y = 1172;
  const sp = S.sprite(310, 1105, 446, 1240, g => {
    flower(g, x, y, 58, 5, '#ea8a70', { rot: -1.2, wid: 1.12, k: 0.7, p: 0.5, seed: 4, ink: '#6a2c22', dark: '#b84a34' });
    // bintik: filotaksis (sudut emas) -> sebaran rata tanpa pola kaku
    g.fillStyle = css('#8a2c20', 0.8); for (let i = 0; i < 260; i++) { const a = i * 2.39996, rr = 15 + 44 * Math.sqrt(i / 260); g.beginPath(); g.ellipse(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 1.5, 1, a, 0, TAU); g.fill(); }
    const disc = ell(x + 2, y - 12, 23, 15, -0.15); wash(g, disc, '#f09a80', { a: 0.97, blobs: 1, dark: '#b84a34' }); ink(g, disc, { closed: true, w: 1.3, col: '#5a241c' });
    const hole = ell(x + 3, y - 10, 15, 9, -0.15); wash(g, hole, '#5a3a3a', { a: 0.95, blobs: 1, dark: '#1c1414', da: 0.6 }); ink(g, hole, { closed: true, w: 1.2, col: '#3a1814' }); hatch(g, hole, { ang: 1.3, gap: 2.5, col: '#1c1010', a: 0.6 });
  });
  S.spot('rafflesia', x, y, 55, 'Rafflesia');
  return (ctx, t) => { const pk = S.poke('rafflesia'), p = pk < 1.5 ? Math.sin(pk / 1.5 * Math.PI) * 0.06 : 0; S.put(ctx, sp, { px: x, py: y, sx: 1 + 0.012 * Math.sin(t * 0.8) + p, sy: 1 + 0.012 * Math.sin(t * 0.8 + 0.5) + p }); };
});

// daun raksasa bertulang sejajar
function bigLeaf(g, mid, wid, col, o = {}) {
  const sp = curve(P(mid), false, 10), p = tube(sp, t => wid * Math.pow(Math.sin(Math.PI * clamp(t * 0.96 + 0.02)), 0.75));
  wash(g, p, col, { a: 0.92, blobs: 7, dark: o.dark ?? C.teal2, da: 0.38, light: '#e6f0c0', la: 0.4, rough: 2, grad: o.grad });
  ink(g, p, { closed: true, w: 1.3 }); ink(g, sp, { w: 1.4 });
  const { L, R } = tube(sp, t => wid * Math.pow(Math.sin(Math.PI * clamp(t * 0.96 + 0.02)), 0.75) * 0.96, false), n = sp.length;
  for (let i = 3; i < n - 6; i += (o.step ?? 3)) for (const side of [L, R]) { const j = Math.min(n - 1, i + (o.sweep ?? 6)); ink(g, curve([sp[i], [lerp(sp[i][0], side[j][0], 0.55), lerp(sp[i][1], side[j][1], 0.5)], side[j]]), { w: 0.85, a: 0.8, col: o.vein ?? '#2d6a5c' }); }
  return p;
}
layer(56, 'daun-besar', S => {
  const mk = (x0, y0, x1, y1, px, py, paint, amp = 0.012) => ({ px, py, amp, sp: S.sprite(x0, y0, x1, y1, paint), ph: x0 * 0.01 });
  const ls = [
    mk(980, 880, 1200, 1215, 1160, 892, g => { bigLeaf(g, '1162 892, 1100 950, 1082 1050, 1098 1140, 1116 1206', 184, '#8fcf9a', { grad: [C.teal, 1040, 0, 1190, 0, 0.6], sweep: 7 }); }),
    mk(10, 1215, 110, 1450, 60, 1230, g => { bigLeaf(g, '62 1228, 56 1300, 62 1380, 58 1444', 92, '#b4d880', { dark: C.green, step: 2, sweep: 5 }); }),
    mk(860, 1150, 1010, 1230, 1000, 1178, g => { bigLeaf(g, '1004 1176, 950 1178, 900 1186, 866 1196', 54, '#d9dc6a', { dark: '#a9a83a', vein: '#6a6a2c' }); }, 0.03),
    mk(865, 1205, 935, 1295, 900, 1290, g => { const p = bigLeaf(g, '902 1290, 898 1250, 900 1214', 46, '#7fb08c', {}); hatch(g, p, { ang: 0.9, gap: 3, col: C.teal2, a: 0.5 }); }, 0.03),
  ];
  // buah polong jingga yang merekah
  const pod = (x, y, s, rot, seed) => mk(x - 50 * s, y - 20 * s, x + 60 * s, y + 90 * s, x, y, g => {
    for (const [a, c] of [[rot + 0.5, '#e9a86a'], [rot - 0.25, '#f0c070'], [rot + 0.15, '#e08a5a']]) { const p = leafPts(x, y, a + 1.2, 84 * s, 36 * s, 0.25); wash(g, p, c, { a: 0.94, blobs: 2, dark: '#a8502c', da: 0.4, light: '#f8e0a0' }); ink(g, p, { closed: true, w: 1.2, col: '#5a2c1c' }); for (let k = 1; k < 4; k++) ink(g, leafPts(x, y, a + 1.2, 80 * s, 36 * s * k / 4, 0.25).slice(0, 11), { w: 0.6, col: '#7a3a22', a: 0.6 }); }
  }, 0.05);
  ls.push(pod(852, 1004, 1, 0.3, 1), pod(868, 1104, 0.85, -0.1, 2), pod(872, 1196, 0.6, 0.1, 3));
  ls.push(mk(840, 990, 885, 1210, 850, 1000, g => ink(g, '850 1000, 866 1060, 870 1130, 872 1200', { w: 2, col: '#6a5a3a' }), 0.02));
  return (ctx, t) => { for (const l of ls) S.put(ctx, l.sp, { px: l.px, py: l.py, rot: l.amp * Math.sin(t * 0.8 + l.ph * 7) + l.amp * 0.5 * Math.sin(t * 1.7 + l.ph * 3) }); };
});

layer(57, 'bunga-kecil', S => {
  const items = [];
  const mk = (x0, y0, x1, y1, px, py, paint, amp = 0.02) => items.push({ px, py, amp, sp: S.sprite(x0, y0, x1, y1, paint), ph: x0 * 0.013 });
  // bunga bintang jingga (enam kelopak sempit, selang-seling merah muda)
  mk(285, 1335, 410, 1445, 346, 1386, g => {
    for (let i = 0; i < 6; i++) { const a = -0.3 + i / 6 * TAU, p = petal(346, 1386, a, 50, 24, { k: 0.8, p: 0.9 }); wash(g, p, i % 2 ? '#e9949c' : '#eba866', { a: 0.94, blobs: 2, dark: '#b85a34', da: 0.4, light: '#fbe0b0' }); ink(g, p, { closed: true, w: 1.1, col: '#6a3222' }); ink(g, [[346, 1386], [346 + Math.cos(a) * 40, 1386 + Math.sin(a) * 40]], { w: 0.7, col: '#6a3222' }); }
    stain(g, 346, 1386, 9, 9, '#8a3a4a', 0.8);
  });
  // kantong semar: tutup kuning, kantong jingga, sulur
  mk(1110, 1425, 1205, 1605, 1160, 1600, g => {
    ink(g, '1140 1600, 1128 1540, 1150 1490, 1166 1470', { w: 1.6, col: '#6a5a3a' });
    const lid = P('1168 1440, 1194 1466, 1176 1500, 1150 1470'); wash(g, blob(lid, 4), '#d9cf6a', { a: 0.95, blobs: 2, dark: '#8a9a3a', da: 0.45 }); ink(g, blob(lid, 4), { closed: true, w: 1.2 }); for (let k = 0; k < 4; k++) ink(g, [[1170, 1446], [1158 + k * 9, 1490]], { w: 0.6, a: 0.7 });
    const pit = blob('1148 1504, 1176 1498, 1192 1516, 1194 1560, 1184 1600, 1146 1602, 1134 1560, 1138 1522'); wash(g, pit, '#e58a62', { a: 0.95, blobs: 4, dark: '#a8442c', da: 0.45, light: '#f6c89a' }); ink(g, pit, { closed: true, w: 1.3, col: '#4a2018' });
    for (let k = 0; k < 5; k++) ink(g, curve([[1144 + k * 10, 1510], [1140 + k * 11, 1556], [1146 + k * 9, 1598]]), { w: 0.7, col: '#7a3222', a: 0.7 });
    ink(g, ell(1164, 1506, 18, 6, -0.1), { closed: true, w: 1.3, col: '#4a2018' });
    for (const s of ['1120 1560, 1108 1530, 1124 1512, 1116 1496', '1196 1540, 1204 1520, 1198 1500']) ink(g, s, { w: 1.1, col: '#8a5a3a' });
  });
  // gugus bunga putih + aster kuning + pelepah palem
  mk(880, 535, 990, 660, 930, 650, g => {
    const r = RNG(5); for (let i = 0; i < 22; i++) flower(g, 902 + (i % 6) * 13 + r.g() * 3, 552 + Math.floor(i / 6) * 13 + r.g() * 3, 7.5, 5, '#f6f6ee', { ink: '#5a5a4a', wid: 0.95, seed: i, dark: '#c9c9a8' });
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, p = petal(906, 598, a, 12, 5.5, { k: 0.8 }); wash(g, p, '#f4d86a', { a: 0.95, blobs: 0, rough: 0.3 }); ink(g, p, { closed: true, w: 0.7, col: '#8a6a22' }); } stain(g, 906, 598, 4, 4, '#c98a22', 0.9);
    for (let i = 0; i < 9; i++) blade(g, 962, 652, -2.6 + i * 0.22, 46, 7, i % 2 ? '#7fc070' : '#a9d880', { droop: 0.2, seed: i });
  });
  // buah lonjong menggantung
  mk(1125, 395, 1185, 480, 1150, 400, g => { for (const [x, y, sx] of [[1142, 440, 0], [1166, 438, 1], [1150, 474, 0]]) { ink(g, curve([[1150, 398], [x + 4, y - 26], [x, y - 14]]), { w: 1, col: '#3f6a4c' }); const e = ell(x, y, 8, 15, 0.15); wash(g, e, '#b9c98a', { a: 0.95, blobs: 1, dark: '#6a8a4a', da: 0.45 }); ink(g, e, { closed: true, w: 1.1 }); ink(g, [[x, y - 12], [x, y + 12]], { w: 0.6, a: 0.6 }); } }, 0.06);
  // buah bersisik (tumpukan sisik segi lima), di kanan air terjun
  mk(770, 1185, 840, 1290, 805, 1190, g => { const b = blob('806 1192, 826 1208, 832 1244, 822 1274, 804 1284, 786 1272, 778 1240, 786 1208'); wash(g, b, '#c9a882', { a: 0.95, blobs: 3, dark: '#7a5a3a', da: 0.45 }); for (let row = 0; row < 9; row++) for (let i = 0; i < 5; i++) { const x = 786 + i * 10 + (row % 2) * 5, y = 1200 + row * 9.5; if (inside(b, x, y)) ink(g, curve([[x - 5, y], [x, y + 6], [x + 5, y]]), { w: 0.9, col: '#5a3a26' }); } ink(g, b, { closed: true, w: 1.2 }); }, 0.03);
  // bunga pucat & sulur di batang kanan
  mk(990, 820, 1085, 905, 1030, 900, g => { for (const [x, y, c] of [[1020, 850, '#f1ecc0'], [1046, 864, '#e9e6a0'], [1030, 880, '#f6f3d6']]) flower(g, x, y, 15, 5, c, { ink: '#5a5a3a', seed: x, dark: '#b9b06a' }); for (let i = 0; i < 6; i++) leaf(g, 1052, 880, -0.6 + i * 0.4, 22, 7, '#b9d86a', { veins: 0 }); });
  return (ctx, t) => { for (const l of items) S.put(ctx, l.sp, { px: l.px, py: l.py, rot: l.amp * Math.sin(t * 0.9 + l.ph * 7) }); };
});

// pakis gelap di sudut kiri bawah (lapisan depan)
layer(70, 'pakis-depan', S => {
  const fr = [[10, 1600, -1.25, 150, 0.5], [60, 1604, -1.0, 170, 0.45], [120, 1606, -0.75, 150, 0.4], [0, 1540, -0.5, 130, 0.5], [180, 1604, -0.55, 120, 0.3], [0, 1480, -0.2, 110, 0.5], [230, 1608, -0.4, 90, 0.3]]
    .map(([x, y, a, len, curl], i) => ({ x, y, ph: i * 1.7, sp: S.sprite(x - 40, y - len - 30, x + len + 40, y + 40, g => fern(g, x, y, a, len, i % 2 ? '#1f6a70' : '#16525c', { curl, n: 20, w: len * 0.26, ink: false, a: 0.9 })) }));
  return (ctx, t) => { for (const f of fr) S.put(ctx, f.sp, { px: f.x, py: f.y, rot: 0.025 * Math.sin(t * 0.9 + f.ph) }); };
});
// ───────────────────────── batu, air terjun, kolam ─────────────────────────
function rock(g, ctrl, col, o = {}) {
  const p = rough(blob(ctrl, 6), 4, ctrl.length, 0.05); wash(g, p, col, { a: 0.9, blobs: 6, dark: o.dark ?? '#2f6470', da: 0.45, light: '#f4f1e2', la: 0.5, shade: [o.sx ?? -0.5, 1, 0.55, o.dark ?? '#1f5462'], rough: 0, raw: true, edge: 0.3 });
  dashes(g, p.concat([p[0]]), { w: 1.15, len: 9, gap: 2 });
  const [x0, y0, x1, y1] = bbox(p); hatch(g, p.filter(q => q[1] > lerp(y0, y1, 0.5) && (o.sx > 0 ? q[0] > lerp(x0, x1, 0.3) : q[0] < lerp(x0, x1, 0.7))), { ang: o.hang ?? (o.sx > 0 ? 0.9 : -0.9), gap: 3, col: C.deep, a: 0.7 });
  const r = RNG(Math.round(x0 + y0)); for (let i = 0; i < 3; i++) { const x = r.r(x0 + 4, x1 - 4), y = r.r(y0 + 4, y1 - 4); dashes(g, curve([[x, y], [x + r.r(6, 16), y + r.r(4, 14)], [x + r.r(10, 26), y + r.r(12, 26)]]), { w: 0.9, len: 4 }); }
  if (o.moss) { stain(g, (x0 + x1) / 2, y0 + 6, (x1 - x0) * 0.5, 12, C.green, 0.6); fur(g, ell((x0 + x1) / 2, y0 + 5, (x1 - x0) * 0.4, 7), { n: 16, len: 7, dir: -1.4, col: '#2d6a4a', a: 0.7 }); }
}
layer(20, 'tebing', S => {
  const sp = S.sprite(396, 955, 830, 1345, g => {
    // tebing kiri
    const cl = blob('400 968, 500 964, 506 1040, 500 1300, 470 1330, 400 1330'); wash(g, cl, '#3f8f8c', { a: 0.8, blobs: 8, dark: C.deep, da: 0.55, rough: 3 }); mottle(g, cl, [C.teal, C.green, C.deep, '#7fbfa8'], { n: 22, size: 34, a: 0.5 });
    rock(g, '406 1010, 436 990, 482 1000, 494 1034, 470 1060, 428 1058', '#b9c4a6', { moss: 1 });
    rock(g, '412 1070, 452 1060, 498 1076, 500 1118, 462 1134, 420 1118', '#8fb0aa', {});
    rock(g, '430 1150, 470 1140, 500 1160, 496 1190, 450 1196', '#6f9c9a', { dark: '#1a4656' });
    rock(g, '436 1204, 484 1190, 503 1226, 500 1286, 466 1308, 438 1280', '#7aa09c', { dark: '#1a4656' });
    rock(g, '476 1288, 520 1276, 556 1298, 552 1330, 508 1338, 480 1322', '#cfbdb8', { sx: 0.5 });
    // tebing kanan
    const cr2 = blob('604 968, 700 960, 790 980, 830 1100, 826 1320, 620 1326, 612 1150'); wash(g, cr2, '#4f9a84', { a: 0.8, blobs: 9, dark: C.deep, da: 0.5, rough: 3 }); mottle(g, cr2, [C.teal, C.green, C.deep, '#8fc79a', C.lime], { n: 36, size: 36, a: 0.5 });
    rock(g, '636 1020, 668 1000, 706 1012, 712 1050, 682 1070, 644 1060', '#c3c8a0', { moss: 1, sx: 0.5 });
    rock(g, '622 1080, 656 1066, 694 1084, 688 1124, 648 1134, 622 1112', '#a9b8a8', { sx: 0.5 });
    rock(g, '634 1146, 684 1128, 728 1150, 724 1200, 676 1214, 638 1192', '#dcc79c', { sx: 0.5, dark: '#5a6a5c' });
    rock(g, '700 1094, 744 1088, 774 1110, 768 1146, 728 1152', '#aebcc0', { sx: 0.5 });
    rock(g, '640 1224, 690 1212, 716 1240, 710 1304, 670 1320, 640 1298', '#d6c29a', { sx: 0.5, dark: '#3f5a5c' });
    rock(g, '716 1204, 764 1200, 790 1232, 782 1284, 738 1294', '#86ac98', { sx: 0.5 });
    underbrush(g, cr2, { n: 26, size: 24, seed: 3, cols: [C.green, C.green2, C.teal], kinds: ['leaf', 'dark', 'grass', 'hatch'] }); underbrush(g, cl, { n: 12, size: 22, seed: 4, cols: [C.green, C.teal], kinds: ['leaf', 'dark', 'grass'] });
    // pakis di tebing
    for (const [x, y, a, l, c] of [[470, 1096, 2.0, 60, C.green], [486, 1104, 1.4, 70, '#4f9a5c'], [452, 1110, 2.5, 50, C.green], [478, 1180, 1.8, 46, C.teal],
      [640, 978, 2.6, 60, '#4f9a5c'], [628, 980, 1.9, 54, C.green], [650, 976, 0.9, 50, C.green], [676, 988, 0.4, 44, '#4f9a5c'], [730, 1060, 1.3, 50, C.green], [760, 1160, 2.0, 46, C.teal], [700, 1210, 1.2, 40, C.green]])
      fern(g, x, y, a, l, c, { curl: 0.5, n: 13, ink: false });
    for (const x of [620, 628, 612]) ink(g, curve([[x, 990], [x + 2, 1040], [x - 3, 1086]]), { w: 1, col: '#3f7a4c' });
  });
  return ctx => S.put(ctx, sp);
});

layer(21, 'air-terjun', S => {
  const X0 = 502, X1 = 602, Y0 = 968, Y1 = 1306;
  const wAt = y => 1 + (y - Y0) / (Y1 - Y0) * 0.18;
  const base = S.sprite(480, 955, 640, 1340, g => {
    const p = P('503 968, 601 968, 606 1060, 612 1180, 618 1306, 496 1306, 498 1180, 502 1060');
    wash(g, p, '#bfe1f2', { a: 0.95, blobs: 8, dark: '#7fc0e2', da: 0.4, light: '#ffffff', la: 0.7, rough: 1.5, edge: 0.15 });
    for (let i = 0; i < 9; i++) stain(g, 510 + i * 12, 1000 + (i * 97 % 260), 9, 60, '#ffffff', 0.5);
    stain(g, 556, 1300, 70, 26, '#ffffff', 0.9); stain(g, 520, 1100, 14, 120, '#eaf4f4', 0.6);
    // batu & pakis di balik air
    const st = ell(536, 1030, 11, 21, 0.1); wash(g, st, '#e9efe6', { a: 0.8, blobs: 1, dark: '#9fc0b0' }); ink(g, st, { closed: true, w: 0.9, a: 0.7 });
    const st2 = ell(530, 1136, 9, 40, 0.05); ink(g, st2, { closed: true, w: 0.9, a: 0.7 }); const st3 = ell(520, 1180, 6, 26, 0); ink(g, st3, { closed: true, w: 0.8, a: 0.6 });
    fern(g, 548, 1120, 1.8, 50, '#4f9a5c', { curl: 0.2, n: 11, ink: false }); fern(g, 540, 1126, 2.4, 34, C.green, { n: 9, ink: false });
    wash(g, tube(curve(P('586 1106, 588 1140, 586 1176')), 7), '#6fb070', { a: 0.85, blobs: 0 });
    // garis air: goresan tegak putus-putus
    const r = RNG(3); for (let i = 0; i < 26; i++) { const x = r.r(506, 610), y = r.r(980, 1260); dashes(g, [[x, y], [x + r.g(), y + r.r(30, 90)]], { w: 0.8, a: 0.55, len: 3, gap: 2, col: INK2 }); }
    ink(g, [[503, 968], [502, 1060], [498, 1180], [496, 1300]], { w: 1.1, a: 0.8 }); ink(g, [[601, 968], [606, 1060], [612, 1180], [618, 1300]], { w: 1.1, a: 0.8 });
    ink(g, '480 968, 520 962, 560 966, 600 962, 630 968', { w: 1.4 });
  });
  const r = RNG(77), streaks = []; for (let i = 0; i < 110; i++) streaks.push({ u: r(), v: r.r(170, 330), len: r.r(24, 80), ph: r.r(0, 400), w: r.r(1, 3.2), a: r.r(0.25, 0.7), blue: r() < 0.3 });
  const foam = []; for (let i = 0; i < 26; i++) foam.push({ x: r.r(500, 618), ph: r(), sp: r.r(0.5, 1.4), r: r.r(4, 11) });
  const leafSp = S.sprite(570, 1020, 598, 1082, g => { const p = leafPts(584, 1026, 1.5, 50, 17, 0.08); wash(g, p, '#9a5a34', { a: 0.95, blobs: 1, dark: '#5a2c1c', da: 0.5 }); ink(g, p, { closed: true, w: 1.1 }); ink(g, [[584, 1028], [586, 1072]], { w: 0.8 }); });
  S.spot('air', 556, 1140, 75, 'Air terjun');
  return (ctx, t) => {
    S.put(ctx, base);
    const pk = S.poke('air'), surge = pk < 3 ? 1 + 1.2 * Math.sin(pk / 3 * Math.PI) : 1;
    ctx.save(); ctx.globalAlpha = S.fade; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(503, Y0); ctx.lineTo(601, Y0); ctx.lineTo(618, Y1 + 6); ctx.lineTo(496, Y1 + 6); ctx.closePath(); ctx.clip();
    const H = Y1 - Y0 + 90;
    for (const s of streaks) {
      const y = Y0 - 60 + ((t * s.v * surge + s.ph * 9) % H), w = wAt(y), x = 552 + (s.u - 0.5) * (X1 - X0) * w + Math.sin(y * 0.045 + s.ph) * 1.6;
      ctx.strokeStyle = s.blue ? css('#8fc8e6', s.a * 0.8) : css('#ffffff', s.a); ctx.lineWidth = s.w; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 0.6, y + s.len * (0.8 + 0.4 * surge)); ctx.stroke();
    }
    ctx.restore();
    // daun cokelat yang tersangkut, bergoyang di arus
    S.put(ctx, leafSp, { px: 584, py: 1026, rot: 0.1 * Math.sin(t * 2.1) + 0.05 * Math.sin(t * 5.3), dy: 2 * Math.sin(t * 1.7) });
    // buih & kabut di kaki air terjun
    ctx.save();
    for (const f of foam) { const u = (t * f.sp + f.ph) % 1, rr = f.r * (0.4 + u) * (surge > 1 ? 1.2 : 1); ctx.globalAlpha = S.fade * 0.75 * (1 - u); ctx.beginPath(); ctx.arc(f.x + Math.sin(t + f.ph * 9) * 3, 1298 + u * 20 - f.r * 0.5, rr, 0, TAU); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.globalAlpha = S.fade * 0.35 * (1 - u); ctx.strokeStyle = css(INK2); ctx.lineWidth = 0.7; ctx.stroke(); }
    ctx.restore();
    for (let i = 0; i < 5; i++) { const u = (t * 0.07 + i / 5) % 1; ctx.save(); ctx.globalAlpha = S.fade; stain(ctx, 520 + i * 22 + Math.sin(t * 0.3 + i) * 12, 1296 - u * 90, 40 + u * 50, 18 + u * 26, '#ffffff', 0.34 * Math.sin(u * Math.PI)); ctx.restore(); }
  };
});

layer(22, 'kolam', S => {
  const base = S.sprite(330, 1310, 900, 1600, g => {
    const pool = blob('452 1330, 560 1318, 650 1326, 700 1380, 760 1470, 820 1540, 880 1600, 330 1600, 400 1520, 430 1440, 420 1380');
    wash(g, pool, '#b4dceb', { a: 0.92, blobs: 12, dark: '#3f9aa8', da: 0.38, light: '#f1f8f6', la: 0.5, rough: 3, grad: ['#4fa8a6', 0, 1330, 0, 1620, 0.5] });
    // bayang gelap: sabit-sabit toska
    for (const [s, w, a] of [['500 1436, 540 1428, 590 1440, 640 1436', 14, 0.6], ['470 1470, 520 1486, 600 1482', 10, 0.45], ['560 1380, 620 1372, 660 1384', 8, 0.4], ['700 1420, 740 1470, 790 1520', 22, 0.55], ['440 1550, 520 1566, 600 1556', 12, 0.4], ['620 1560, 700 1580, 780 1576', 14, 0.5], ['380 1590, 450 1578, 520 1592', 12, 0.5]])
      { g.save(); trace(g, rough(tube(curve(P(s), false, 8), t => w * Math.sin(Math.PI * t) + 1), 1.5, w)); g.fillStyle = css('#1f7a86', a); g.fill(); g.restore(); }
    // bercak teratai
    for (const [x, y, rx, ry, c] of [[466, 1366, 44, 22, '#b9dcae'], [444, 1410, 32, 14, '#9fd0a0'], [560, 1522, 76, 20, '#a8d49a'], [690, 1410, 30, 12, '#b9dcae'], [520, 1388, 20, 8, '#c9e4c0']]) { const p = scallop(x, y, rx, ry, { seed: x, n: 5, depth: 0.1, wild: 0.3 }); wash(g, p, c, { a: 0.8, blobs: 3, dark: C.green, da: 0.35 }); ink(g, p.slice(0, Math.floor(p.length * 0.7)), { w: 0.95 }); }
    const r = RNG(12); for (let i = 0; i < 40; i++) { const x = r.r(440, 800), y = r.r(1340, 1596); dashes(g, [[x, y], [x + r.r(16, 50), y + r.g() * 2]], { w: 0.8, a: 0.5, len: 5, gap: 3, col: INK2 }); }
    for (const [x, y] of [[566, 1552], [578, 1556], [556, 1562], [588, 1548]]) { g.fillStyle = css(C.deep, 0.8); g.beginPath(); g.ellipse(x, y, 4, 2, 0, 0, TAU); g.fill(); }
    // tepi kanan: gundukan hijau
    const mound = blob('690 1392, 740 1378, 800 1386, 830 1420, 824 1462, 770 1472, 720 1456, 696 1426'); wash(g, mound, '#a9d6a0', { a: 0.9, blobs: 5, dark: C.teal, da: 0.4 }); ink(g, mound, { closed: true, w: 1.1 }); fur(g, mound, { n: 40, len: 7, dir: -1.3, col: '#2d6a4a', a: 0.6 });
  });
  const reeds = []; const r = RNG(9);
  for (const [x, y, n, h] of [[540, 1440, 3, 46], [484, 1500, 2, 50], [756, 1580, 7, 110], [452, 1460, 2, 40]]) for (let i = 0; i < n; i++) reeds.push({ x: x + (i - n / 2) * 7 + r.g() * 2, y, h: h * r.r(0.7, 1.15), lean: r.g() * 0.25, ph: r.r(0, 6), w: r.r(1.6, 3) });
  const rip = []; for (let i = 0; i < 7; i++) rip.push({ ph: i / 7, x: 556 + r.g() * 30 });
  const glints = []; for (let i = 0; i < 46; i++) glints.push({ x: r.r(440, 800), y0: r.r(1340, 1600), len: r.r(8, 30), sp: r.r(3, 9), ph: r.r(0, 6) });
  return (ctx, t) => {
    S.put(ctx, base);
    ctx.save(); ctx.lineCap = 'round';
    // riak: elips yang membesar dan memudar dari kaki air terjun
    for (const p of rip) { const u = (t * 0.16 + p.ph) % 1; ctx.globalAlpha = S.fade * 0.55 * (1 - u); ctx.beginPath(); ctx.ellipse(p.x, 1334 + u * 36, 30 + u * 150, 5 + u * 26, 0, 0.15, Math.PI - 0.15); ctx.strokeStyle = u < 0.5 ? '#ffffff' : css('#2f7f8c'); ctx.lineWidth = 1.6 - u; ctx.stroke(); }
    // kilau: garis-garis pendek yang hanyut ke bawah
    for (const q of glints) { const y = 1340 + ((q.y0 - 1340 + t * q.sp) % 260), k = (y - 1340) / 260, x = q.x + (q.x - 600) * k * 0.25 + Math.sin(t * 0.8 + q.ph) * 4; ctx.globalAlpha = S.fade * (0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.7 + q.ph))); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + q.len * (0.6 + k), y); ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.2 + k; ctx.stroke(); }
    // gelagah
    ctx.globalAlpha = S.fade;
    for (const d of reeds) { const sw = Math.sin(t * 1.1 + d.ph) * 0.06 + d.lean, tx = d.x + Math.sin(sw) * d.h, ty = d.y - Math.cos(sw) * d.h; ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.quadraticCurveTo(d.x + (tx - d.x) * 0.3, d.y - d.h * 0.6, tx, ty); ctx.strokeStyle = css('#1f5f66', 0.85); ctx.lineWidth = d.w; ctx.stroke(); }
    ctx.restore();
  };
});
// ───────────────────────── udara: serbuk cahaya, daun gugur, riak sentuhan ─────────────────────────
layer(80, 'udara', S => {
  const r = RNG(99), motes = [], leaves = [];
  for (let i = 0; i < 34; i++) motes.push({ x: r.r(430, 760), y: r.r(520, 1000), ax: r.r(10, 40), ay: r.r(8, 30), sp: r.r(0.15, 0.5), ph: r.r(0, 6), rad: r.r(1.2, 3.2) });
  for (let i = 0; i < 5; i++) leaves.push({ x: r.r(150, 1050), sp: r.r(22, 40), ph: r.r(0, 60), sw: r.r(30, 70), col: r.pick(['#86bf7a', '#d9c26a', '#58a76c', '#e0a060']) });
  const taps = [];
  return (ctx, t) => {
    ctx.save();
    for (const m of motes) { const x = m.x + Math.sin(t * m.sp + m.ph) * m.ax, y = m.y + Math.cos(t * m.sp * 0.8 + m.ph) * m.ay - ((t * 6 + m.ph * 40) % 120) * 0.3, a = 0.35 + 0.35 * Math.sin(t * 1.3 + m.ph * 3); ctx.globalAlpha = S.fade * Math.max(0, a); const g = ctx.createRadialGradient(x, y, 0, x, y, m.rad * 3); g.addColorStop(0, 'rgba(255,250,200,1)'); g.addColorStop(1, 'rgba(255,250,200,0)'); ctx.fillStyle = g; ctx.fillRect(x - m.rad * 3, y - m.rad * 3, m.rad * 6, m.rad * 6); }
    for (const l of leaves) { const cyc = (t * l.sp + l.ph * 50) % 2600, y = cyc - 100; if (y > 1650) continue; const x = l.x + Math.sin(y * 0.012 + l.ph) * l.sw, rot = Math.sin(y * 0.02 + l.ph) * 1.2; ctx.globalAlpha = S.fade * 0.85; ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.beginPath(); ctx.moveTo(-9, 0); ctx.quadraticCurveTo(0, -6, 9, 0); ctx.quadraticCurveTo(0, 6, -9, 0); ctx.fillStyle = l.col; ctx.fill(); ctx.strokeStyle = css(INK, 0.8); ctx.lineWidth = 0.8; ctx.stroke(); ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(9, 0); ctx.stroke(); ctx.restore(); }
    // sentuhan di tempat kosong: riak cincin
    if (S.tap != null && S.tap !== taps._last) { taps._last = S.tap; taps.push({ x: S.px, y: S.py, t0: S.tap }); if (taps.length > 6) taps.shift(); }
    for (const p of taps) { const u = (t - p.t0) / 1.4; if (u < 0 || u > 1) continue; const water = p.y > 1320 && p.x > 380 && p.x < 880; for (let k = 0; k < 3; k++) { const v = u - k * 0.14; if (v <= 0) continue; ctx.globalAlpha = S.fade * 0.7 * (1 - v); ctx.beginPath(); ctx.ellipse(p.x, p.y, 10 + v * 70, (water ? 4 : 10) + v * (water ? 22 : 70), 0, 0, TAU); ctx.strokeStyle = water ? '#ffffff' : css('#f6f0c0'); ctx.lineWidth = 2 - v; ctx.stroke(); } }
    ctx.restore();
  };
});
// ───────────────────────── mesin: sprite, putaran gambar, sentuhan ─────────────────────────
function mountRimba(el, opts = {}) {
  const PROF = opts.prof ? (window.__prof = {}) : null;
  const cv = document.createElement('canvas'); cv.className = 'rimba-geo'; cv.style.cssText = 'display:block;width:100%;height:auto;touch-action:manipulation';
  cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', 'Lukisan Multispesies karya Ejak, digambar ulang seluruhnya dengan geometri dan matematika, dan bergerak.');
  const box = document.createElement('div'); box.style.cssText = 'position:relative;line-height:0'; box.appendChild(cv);
  const paper = document.createElement('div'); paper.style.cssText = 'position:absolute;inset:0;pointer-events:none;mix-blend-mode:multiply;background-size:220px 220px'; box.appendChild(paper); el.appendChild(box);
  const ctx = cv.getContext('2d');
  const reduce = opts.still || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  let lastDraw = 0, K = 1, alive = true, visible = true, raf = 0, items = [], queue = [], t0 = performance.now(), tFix = opts.t ?? null, grain = null;
  const spots = [], pokes = {};
  const S = {
    get K() { return K; }, fade: 1, t: 0, opts,
    sprite(x0, y0, x1, y1, paint) {
      const pad = 8; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      const c = document.createElement('canvas'); c.width = Math.max(2, Math.ceil((x1 - x0) * K)); c.height = Math.max(2, Math.ceil((y1 - y0) * K));
      const g = c.getContext('2d'); g.scale(K, K); g.translate(-x0, -y0); paint(g);
      return { c, x0, y0, w: x1 - x0, h: y1 - y0 };
    },
    put(c, s, o) {
      if (!o) { c.globalAlpha = S.fade; c.drawImage(s.c, s.x0, s.y0, s.w, s.h); c.globalAlpha = 1; return; }
      c.save(); c.translate(o.px + (o.dx || 0), o.py + (o.dy || 0)); if (o.rot) c.rotate(o.rot); if (o.skx) c.transform(1, 0, o.skx, 1, 0, 0);
      if (o.sx != null || o.sy != null) c.scale(o.sx ?? 1, o.sy ?? 1); c.translate(-o.px, -o.py);
      c.globalAlpha = S.fade * (o.a ?? 1); c.drawImage(s.c, s.x0, s.y0, s.w, s.h); c.restore();
    },
    spot(id, x, y, r, label) { spots.push({ id, x, y, r, label }); },
    poke(id) { return pokes[id] == null ? 99 : S.t - pokes[id]; },      // detik sejak disentuh
    doPoke(id) { pokes[id] = S.t; },
  };
  function size() {
    const cssW = el.clientWidth || 600, dpr = Math.min(window.devicePixelRatio || 1, opts.maxDpr ?? 2);
    const w = Math.round(Math.min(cssW * dpr, opts.maxPx ?? 1800));
    cv.width = w; cv.height = Math.round(w * H0 / W0); K = w / W0;
    if (!grain) { grain = makeGrain(); paper.style.backgroundImage = 'url(' + grain + ')'; }
    items = []; spots.length = 0;
    queue = SCENE.slice().sort((a, b) => a.z - b.z);
    if (reduce || opts.sync) { while (queue.length) buildOne(); }
  }
  function makeGrain() {
    const n = 220, c = document.createElement('canvas'); c.width = c.height = n; const g = c.getContext('2d'), im = g.createImageData(n, n), r = RNG(77);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const i = (y * n + x) * 4, f = fbm(x * 0.09, y * 0.5, 9, 3), v = 247 + (r() - 0.5) * 12 + (f - 0.5) * 16 + (((y + (x * 0.15 | 0)) % 5) === 0 ? -2 : 0);
      im.data[i] = v; im.data[i + 1] = v; im.data[i + 2] = v * 0.992; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0); return c.toDataURL('image/png');
  }
  function buildOne() {
    const L = queue.shift(); if (!L) return;
    try { const draw = L.build(S); if (draw) items.push({ z: L.z, name: L.name, draw, born: performance.now() }); }
    catch (e) { console.error('lapisan gagal:', L.name, e); }
  }
  function frame(now) {
    if (!alive) return;
    if (!reduce) raf = requestAnimationFrame(frame);
    if (!visible && !reduce) return;
    if (opts.fps && now - lastDraw < 1000 / opts.fps - 2 && !queue.length) return; lastDraw = now;
    const st = performance.now(); let built = 0;
    while (queue.length && (built < 1 || performance.now() - st < 10)) { buildOne(); built++; }
    const t = tFix != null ? tFix : (now - t0) / 1000; S.t = t;
    ctx.setTransform(K, 0, 0, K, 0, 0); ctx.globalAlpha = 1;
    ctx.fillStyle = PAPER; ctx.fillRect(0, 0, W0, H0);
    for (const it of items) {
      S.fade = reduce || tFix != null ? 1 : clamp((now - it.born) / 700);
      ctx.globalAlpha = 1;
      const p0 = PROF ? performance.now() : 0;
      try { it.draw(ctx, t); if (PROF) { ctx.getImageData(0, 0, 1, 1); PROF[it.name] = (PROF[it.name] || 0) * 0.95 + (performance.now() - p0) * 0.05; } } catch (e) { if (!it.err) { it.err = 1; console.error('gambar gagal:', it.name, e); } }
    }
    S.fade = 1; ctx.globalAlpha = 1;
    if (opts.onFrame) opts.onFrame(t, queue.length);
  }
  function toUnits(ev) { const r = cv.getBoundingClientRect(); return [(ev.clientX - r.left) / r.width * W0, (ev.clientY - r.top) / r.height * H0]; }
  function hit(x, y) { let best = null, bd = 1e9; for (const s of spots) { const d = Math.hypot(x - s.x, y - s.y) / s.r; if (d < 1 && d < bd) { bd = d; best = s; } } return best; }
  const onDown = ev => { const [x, y] = toUnits(ev), s = hit(x, y); S.px = x; S.py = y; S.tap = S.t; if (s) { pokes[s.id] = S.t; if (opts.onPoke) opts.onPoke(s); } else pokes._air = S.t; };
  const onMove = ev => { const [x, y] = toUnits(ev); S.mx = x; S.my = y; const s = hit(x, y); cv.style.cursor = s ? 'pointer' : ''; cv.title = s ? s.label : ''; };
  cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
  let rz = 0; const ro = new ResizeObserver(() => { clearTimeout(rz); rz = setTimeout(() => { if (alive && Math.abs((el.clientWidth || 0) * Math.min(devicePixelRatio || 1, opts.maxDpr ?? 2) - cv.width) > 24) { size(); if (reduce) frame(performance.now()); } }, 250); });
  ro.observe(el);
  const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { visible = es[0].isIntersecting; }) : null; if (io) io.observe(cv);
  const onVis = () => { visible = !document.hidden; }; document.addEventListener('visibilitychange', onVis);
  size(); raf = requestAnimationFrame(frame);
  return {
    canvas: cv, spots, poke: id => S.doPoke(id),
    destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); if (io) io.disconnect(); document.removeEventListener('visibilitychange', onVis); box.remove(); },
  };
}
if (typeof window !== 'undefined') window.RimbaGeo = { mount: mountRimba };

export { mountRimba };
