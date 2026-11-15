// node tests/contrast.mjs : WCAG contrast of the main text/background pairs in both themes (needs ≥ 4.5)
const hex = h => { h = h.replace('#', ''); return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255); };
const lum = c => { const [r, g, b] = hex(c).map(v => v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return .2126 * r + .7152 * g + .0722 * b; };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
const T = {
  light: { page: '#F2EEE2', card: '#FBF9F2', ink: '#1E2A22', head: '#1A3A2E', muted: '#5B6452', link: '#1D6A63', primary: '#22756E', onPrimary: '#FFFFFF', good: '#3E6A33', goodBg: '#E4EDD9', warn: '#8A5A12', warnBg: '#F5EAD2', bad: '#A8432B', badBg: '#F6E3DB', deep: '#1B2A21', onDeep: '#ECEFE4', onDeepMuted: '#BFCBBE', water: '#DDF0EA', dew: '#EEE6D0', tanah: '#8A6B43' },
  dark: { page: '#101812', card: '#18231C', ink: '#E6EBDD', head: '#EEF2E6', muted: '#A5B19C', link: '#7FD0C3', primary: '#6FC7BA', onPrimary: '#0E1A15', good: '#A6CF92', goodBg: '#1D2E1E', warn: '#E8BE6E', warnBg: '#2E2716', bad: '#F39A80', badBg: '#33201A', deep: '#0B120D', onDeep: '#E6EBDD', onDeepMuted: '#A9B6A5', water: '#16302C', dew: '#252A1D', tanah: '#CBA77B' },
};
const pairs = [['ink', 'page'], ['ink', 'card'], ['muted', 'page'], ['muted', 'card'], ['muted', 'water'], ['muted', 'dew'], ['link', 'page'], ['link', 'card'], ['onPrimary', 'primary'], ['head', 'water'], ['good', 'goodBg'], ['warn', 'warnBg'], ['bad', 'badBg'], ['bad', 'card'], ['onDeep', 'deep'], ['onDeepMuted', 'deep'], ['tanah', 'card']];
let fail = 0;
for (const [name, t] of Object.entries(T)) {
  console.log(`\n${name}`);
  for (const [f, b] of pairs) { const r = cr(t[f], t[b]); if (r < 4.5) fail++; console.log(`${r < 4.5 ? 'FAIL' : ' ok '} ${r.toFixed(2).padStart(5)}  ${f} on ${b}`); }
}
// fixed colours: white on the active nav (#22756E) and on the dark toska bits, both themes
for (const [f, b] of [['#FFFFFF', '#22756E'], ['#FFFFFF', '#17524E'], ['#ECEFE4', '#17403B'], ['#1B2A21', '#EEE6D0']]) { const r = cr(f, b); if (r < 4.5) fail++; console.log(`${r < 4.5 ? 'FAIL' : ' ok '} ${r.toFixed(2).padStart(5)}  ${f} on ${b}`); }
process.exit(fail ? 1 : 0);
