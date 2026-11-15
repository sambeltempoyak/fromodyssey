// Membaca satu peluang (PhD, hibah, fellowship) dari ringkasan feed atau teks laman lengkap, lalu
// mengambil yang penting: tenggat, mulai, dana, siapa yang mengajukan, syarat, cara daftar, kontak,
// penghalang (dengan kalimat bukti), hal yang menguntungkan, prioritas 1–99 dan langkah berikutnya.
// Fungsi murni (tanpa DOM, tanpa AI) supaya bisa dites di Node: node tests/analyze.test.mjs
import { fmQuote } from './md.js';

/* ---------------- tanggal (Inggris + Indonesia) ---------------- */
const MON_SRC = '(january|february|march|april|may|june|july|august|september|october|november|december|januari|februari|maret|mei|juni|juli|agustus|oktober|desember|jan|feb|mar|apr|jun|jul|aug|agu|agt|ags|sept|sep|oct|okt|nov|dec|des)';
const MN = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, mei: 5, jun: 6, jul: 7, aug: 8, agu: 8, agt: 8, ags: 8, sep: 9, oct: 10, okt: 10, nov: 11, dec: 12, des: 12 };
const mnum = s => { const k = s.toLowerCase(); return MN[k.slice(0, 3)] || MN[k] || null; };
const pad = n => String(n).padStart(2, '0');
const iso = (y, m, d) => { if (!m) return null; const dt = new Date(Date.UTC(y, m - 1, d)); return dt.getUTCMonth() === m - 1 && d >= 1 ? `${y}-${pad(m)}-${pad(d)}` : null; };

export function findDates(text) {
  const out = []; const t = String(text || '');
  const push = (i, len, v) => { if (v) out.push({ i, len, iso: v }); };
  let m;
  const d1 = new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MON_SRC}\\.?,?\\s+(\\d{4})\\b`, 'gi');
  while ((m = d1.exec(t))) push(m.index, m[0].length, iso(+m[3], mnum(m[2]), +m[1]));
  const d2 = new RegExp(`\\b${MON_SRC}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})\\b`, 'gi');
  while ((m = d2.exec(t))) push(m.index, m[0].length, iso(+m[3], mnum(m[1]), +m[2]));
  const d3 = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](20\d{2})\b/g;
  while ((m = d3.exec(t))) push(m.index, m[0].length, iso(+m[3], +m[2], +m[1]));
  const d4 = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
  while ((m = d4.exec(t))) push(m.index, m[0].length, iso(+m[1], +m[2], +m[3]));
  // hapus tumpang tindih (mis. "January 5, 2027" juga cocok sebagian di pola lain)
  out.sort((a, b) => a.i - b.i || b.len - a.len);
  return out.filter((d, k) => !out.slice(0, k).some(e => d.i >= e.i && d.i < e.i + e.len));
}

const DL_KEY = /(closing date|closes?\b|close on|deadline|apply by|due (date|by)|applications? (?:must be received|should be received|received) by|applications? (?:close|will close|are open until|accepted until|due)|submit(?:ted)? (?:your )?(?:application|proposal)s? by|last date|batas (?:akhir|waktu)|tenggat|ditutup|penutupan|paling lambat|selambat-lambatnya|pendaftaran(?: dibuka)? (?:hingga|sampai)|sampai dengan|s\.\s?d\.)/gi;
const START_KEY = /(start(?:ing)? date|starting|commenc(?:e|ing)|begin(?:s|ning)?|intake|expected start|to start|start in|start:|mulai|dimulai|tahun ajaran|periode)/gi;
const ROLLING = /\b(rolling (basis|deadline|applications?)|applications? (are )?accepted (on a rolling basis|year[- ]round|at any time)|open (year[- ]round|all year|continuously)|no (fixed )?deadline|ongoing call|dibuka sepanjang tahun|tanpa batas waktu|kapan saja)\b/i;

export function htmlToText(html) {
  let h = String(html || '');
  const h1 = (/<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(h) || [])[1] || '';
  const title = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(h) || [])[1] || '';
  h = h.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg|nav|footer|iframe)[\s\S]*?<\/\1>/gi, ' ');
  const main = /<(main|article)[^>]*>([\s\S]*?)<\/\1>/i.exec(h);
  if (main && main[2].length > 800) h = main[2];
  h = h.replace(/<(br|\/p|\/div|\/h[1-6]|\/tr|\/section|\/ul|\/ol|\/table|\/dd|\/dt)[^>]*>/gi, '\n').replace(/<li[^>]*>/gi, '\n• ').replace(/<\/(td|th)>/gi, ' | ').replace(/<[^>]+>/g, ' ');
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', pound: '£', euro: '€', ndash: '–', mdash: '—', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', hellip: '…' };
  h = h.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (s, e) => {
    if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return n ? String.fromCodePoint(n) : ' '; }
    return ent[e.toLowerCase()] ?? ' ';
  });
  const text = h.split('\n').map(l => l.replace(/[ \t ]+/g, ' ').trim()).filter(Boolean).join('\n');
  return { text, title: clean(h1) || clean(title) };
}
const clean = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

const sentences = text => String(text || '').split(/\n+|(?<=[.!?])\s+(?=[A-Z•])/).map(s => s.replace(/^[•\-–*]\s*/, '').trim()).filter(s => s.length >= 25 && s.length <= 420);
const uniq = (arr, n = 6) => { const seen = new Set(), out = []; for (const s of arr) { const k = s.toLowerCase().slice(0, 45); if (!seen.has(k)) { seen.add(k); out.push(s.length > 260 ? s.slice(0, 257).replace(/\s+\S*$/, '') + '…' : s); } if (out.length >= n) break; } return out; };
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000);

/** Kalimat utuh tempat sebuah temuan muncul (bukti), maksimal ~300 karakter. */
export function sentenceAt(s, i, len = 0) {
  const str = String(s || '');
  let a = i; while (a > 0 && !/[.!?\n]/.test(str[a - 1]) && i - a < 220) a--;
  let b = i + len; while (b < str.length && !/[.!?\n]/.test(str[b]) && b - i < 260) b++;
  if (b < str.length && /[.!?]/.test(str[b])) b++;
  const out = str.slice(a, b).replace(/\s+/g, ' ').trim();
  return (a > 0 && !/[.!?\n]/.test(str[a - 1]) ? '…' : '') + out + (b < str.length && !/[.!?\n]/.test(str[b - 1]) ? '…' : '');
}

function pickDeadline(text, fallback, today) {
  const dates = findDates(text); let best = null;
  for (const m of text.matchAll(DL_KEY)) {
    const after = dates.find(d => d.i >= m.index && d.i - m.index <= 150);
    const before = dates.find(d => d.i < m.index && m.index - d.i - d.len <= 25 && m.index - d.i - d.len >= 0);
    const d = after || before; if (!d) continue;
    const cand = { iso: d.iso, text: sentenceAt(text, m.index, m[0].length) };
    if (!best) best = cand;
    else if (daysBetween(today, cand.iso) >= -1 && (daysBetween(today, best.iso) < -1 || cand.iso < best.iso)) best = cand;
  }
  if (best) return best;
  if (fallback) return { iso: fallback, text: '' };
  return null;
}
function pickStart(text) {
  for (const m of text.matchAll(START_KEY)) {
    const seg = text.slice(m.index, m.index + 110);
    const d = findDates(seg)[0]; if (d) return { iso: d.iso, label: seg.slice(d.i, d.i + d.len) };
    const my = new RegExp(`${MON_SRC}\\.?\\s+(20\\d{2})`, 'i').exec(seg); if (my) return { iso: iso(+my[2], mnum(my[1]), 1), label: my[0] };
    const sea = /(autumn|fall|spring|summer|winter|semester (gasal|genap|ganjil))\s+(20\d{2})/i.exec(seg); if (sea) return { iso: null, label: sea[0] };
  }
  return null;
}

/* ---------------- keluarga tema (cocok di awal kata, Inggris + Indonesia) ---------------- */
const W = src => new RegExp('\\b(?:' + src + ')', 'gi');
export const THEMES = [
  { id: 'adat', label: 'masyarakat adat', re: W("indigen|masyarakat adat|komunitas adat|adat\\b|first nations|aborigin|native (?:people|communit|american|nation)|orang asli|orang rimba|customary (?:land|law|right)|hak ulayat|tribal") },
  { id: 'dekolonial', label: 'dekolonial', re: W('decoloni|de-coloni|dekoloni|postcoloni|post-coloni|pascakolon|poskolon|anticoloni|anti-coloni|coloniality|settler coloni') },
  { id: 'pluriverse', label: 'pluriverse & ontologi', re: W('pluriver|ontolog|cosmopolitic|kosmopolitik|cosmolog|kosmolog|relational (?:ontolog|worlds?)|worlding') },
  { id: 'gender', label: 'gender', re: W("gender|sexualit|seksualitas|feminis|queer|lgbt|women['’]?s (?:group|right|empower|studies|knowledge)|perempuan|kesetaraan") },
  { id: 'pendidikan', label: 'pendidikan', re: W('educat|pedagog|literac|literasi|pendidikan|sekolah|schooling|curricul|kurikulum') },
  { id: 'bunyi', label: 'bunyi', re: W('sound(?!\\s+(?:knowledge|understanding|judge?ment|track|grasp|background|financial|management|basis))|soundscape|listening|acoust|akustik|music|musik|bunyi|suara|sonic|ethnomusicolog|etnomusikolog|auditor') },
  { id: 'lingkungan', label: 'lingkungan & planetary', re: W('environment|lingkungan|planetar|multispecies|multispesies|more-than-human|more than human|climate|iklim|forest|hutan|extractiv|ekstraktiv|ecolog|ekolog|anthropocene|antroposen|biodivers|keanekaragaman hayati|conservation|konservasi|waste|sampah') },
  { id: 'asia', label: 'Indonesia & Asia Tenggara', re: W('indonesia|southeast asia|south-east asia|south east asia|asia tenggara|asia[- ]pacific|asia pasifik|nusantara|sumba|jambi|sumatra|sumatera|borneo|kalimantan|papua|jawa|java\\b|semarang|malaysia|philippines|filipina|timor|melanesia|austronesia|asean') },
  { id: 'multimodal', label: 'metode multimodal', re: W('multimodal|visual (?:anthropolog|ethnograph|method|culture|research)|film|documentar|dokumenter|photograph|fotograf|stop[- ]motion|creative (?:method|practice|research)|arts?-based|metode kreatif|sensory ethnograph|video') },
  { id: 'antropologi', label: 'antropologi', re: W('anthropolog|antropolog|ethnograph|etnograf|fieldwork|kerja lapangan|ethnolog|etnolog') },
  { id: 'agraria', label: 'desa–kota & agraria', re: W('rural|perdesaan|pedesaan|agrari|agraria|land (?:right|tenure|use|grab)|tanah adat|urban|perkotaan|peri-urban|peasant|petani|village') },
];
const esc_ = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = w => new RegExp('\\b' + esc_(w.toLowerCase()), 'i');

/** Tempat yang ia sukai (dari Pengaturan) -> kata-kata yang dicari di teks. */
const PLACE_ALIAS = {
  belanda: ['Netherlands', 'Dutch', 'Belanda', 'Amsterdam', 'Leiden', 'Utrecht', 'Nijmegen', 'Groningen', 'Rotterdam', 'The Hague', 'Den Haag', 'Wageningen', 'Tilburg'],
  australia: ['Australia', 'Australian', 'Canberra', 'ANU', 'Sydney', 'Melbourne', 'Brisbane', 'Perth', 'Adelaide'],
  indonesia: ['Indonesia', 'Jakarta', 'Yogyakarta', 'Bandung', 'Depok', 'Bali'],
};
function placeHit(full, places) {
  for (const p of places || []) {
    const words = PLACE_ALIAS[String(p).toLowerCase()] || [p];
    for (const w of words) if (w && wordRe(w).test(full)) return p;
  }
  return '';
}

/* ---------------- kelayakan, dana, jenjang, siapa yang mengajukan ---------------- */
const INTL_OK = /(international (students|applicants|candidates|scholars|researchers)[^.\n]{0,60}(welcome|eligible|encouraged|can apply|may apply|are invited)|open to (applicants|researchers|scholars|candidates|students)? ?(of|from) (all|any) (nationalit|countr)|open to (all|international)|all nationalities|any nationality|regardless of (nationality|citizenship|country)|international fee|global south|developing countr|low[- ] (and|or) middle[- ]income countr|\bLMICs?\b|southeast asian (scholars|researchers|applicants|countries|nationals)|(researchers|scholars|applicants|citizens|nationals|students) (from|of) (southeast asia|asia|indonesia|asean)|indonesian (citizens|nationals|researchers|scholars|students|applicants|organi[sz]ations|ngos|csos)|warga negara indonesia|\bWNI\b|terbuka untuk (umum|seluruh|semua)|(organisasi|lembaga|komunitas|peneliti|warga|yayasan)[^.\n]{0,40}(di|dari|berbasis di) indonesia|asia[- ]pacific (region )?(applicants|researchers|scholars))/i;
const FUNDED_FULL = /(fully[- ]funded|full(y)? (scholarship|funding|studentship)|full tuition[^.\n]{0,40}(stipend|living)|covers? (full )?(tuition|fees)[^.\n]{0,60}(stipend|living|allowance)|stipend[^.\n]{0,80}(tuition|fees?) (waiver|covered|paid|included)|tuition (fee )?waiver[^.\n]{0,80}(stipend|living)|salaried|paid (phd )?(position|employment)|employment contract|(gross )?(monthly )?salary of|beasiswa penuh|biaya hidup[^.\n]{0,60}(biaya kuliah|uang kuliah|spp)|(biaya kuliah|uang kuliah|spp)[^.\n]{0,60}biaya hidup)/i;
const FUNDED_PART = /(stipend|bursary|partial(ly)? funded|partial scholarship|tuition (fee )?(waiver|scholarship)|fee waiver|living allowance|scholarship|beasiswa|tunjangan|tuition (fee )?offset)/i;
const SELF_FUNDED = /\b(self[- ]funded|unfunded|no funding (is )?(available|attached)|without funding|fees? only|must (secure|find) (your|their) own funding|biaya (sendiri|mandiri)|tidak (ada|disediakan) (beasiswa|pendanaan))\b/i;
const LEVEL_OK = /\b(master['’]?s (degree|holders?|graduates?|level)|MA or equivalent|\bS2\b|magister|early[- ]career|emerging (scholars?|researchers?)|practitioners?|praktisi|pre-?doctoral|peneliti muda|young researchers?|activists?|aktivis|community researchers?|non-academic)/i;
const ORG_RE = /\b(organi[sz]ations?|NGOs?|CSOs?|civil society|non-?profits?|nonprofits?|charit(y|ies)|community[- ]based|grassroots|lembaga|yayasan|komunitas|organisasi|LSM|ornop|kelompok (masyarakat|perempuan)|legal entit|badan hukum|institutions? (may|can) apply|collectives?)/i;
const ELIG_CUE = /\b(eligib|open to|apply|applicants?|may submit|can submit|invites?|terbuka|mengajukan|pemohon|pengusul|sasaran|peserta|dapat|diundang|untuk)\b/i;
const IND_RE = /\b(individuals?|individual researchers?|perorangan|individu|pribadi|independent (researchers?|scholars?)|early[- ]career researchers?|graduate students?|doctoral (students|candidates)|scholars? (may|can) apply|applicants? must (hold|have))\b/i;

function money(text) {
  const CUR = '(?:USD|US\\$|\\$|€|EUR|£|GBP|AUD|A\\$|NZD|CAD|SGD|Rp\\.?|IDR)';
  const AMT = `${CUR}\\s?\\d[\\d.,]*(?:\\s?(?:k|K|million|juta|miliar|M)\\b)?|\\d[\\d.,]*\\s?(?:USD|EUR|euros?|AUD|GBP|juta rupiah|juta|rupiah)\\b`;
  const out = { stipend: '', amount: '', fees: '' };
  let m = new RegExp(`(?:stipend|salary|gaji|living (?:allowance|costs?)|biaya hidup|tunjangan|allowance)[^\\n]{0,70}?(${AMT})([^\\n]{0,40}?)(?=[.;]\\s|\\n|$)`, 'i').exec(text);
  if (m) out.stipend = (m[1] + m[2]).replace(/\s+/g, ' ').trim().replace(/[,;:\s]+$/, '');
  m = new RegExp(`(?:grants?|awards?|hibah|dana|funding|up to|hingga|sampai|maksimal|maximum|maks\\.?|besaran)[^\\n]{0,50}?(${AMT})`, 'i').exec(text);
  if (m) out.amount = m[1].replace(/\s+/g, ' ').trim().replace(/[,;:.\s]+$/, '');
  if (!out.amount && !out.stipend) { m = new RegExp(AMT, 'i').exec(text); if (m) out.amount = m[0].replace(/\s+/g, ' ').trim().replace(/[,;:.\s]+$/, ''); }
  m = /(tuition fees?|course fees?|fees? (?:will be )?(?:paid|covered|waived)|biaya kuliah|uang kuliah)[^\n]{0,110}?(?=[.;]\s|\n|$)/i.exec(text); if (m) out.fees = m[0].replace(/\s+/g, ' ').trim();
  out.funded = FUNDED_FULL.test(text) ? 'full' : SELF_FUNDED.test(text) ? 'none' : FUNDED_PART.test(text) ? 'partial' : 'unknown';
  return out;
}

export function guessType(title, text) {
  const t = String(title || ''), all = t + ' ' + String(text || '').slice(0, 600);
  if (/\b(phd|ph\.d|doctoral|doctorate|dphil|promovend|program doktor|\bS3\b|studentship)/i.test(t)) return 'phd';
  if (/\bfellowship|\bresidenc(y|ies)\b|\bvisiting (scholar|researcher)/i.test(t)) return 'fellowship';
  if (/\b(grant|hibah|award|funding|call for (proposals|applications)|dana|fund\b)/i.test(t)) return 'grant';
  if (/\b(summer school|winter school|course|kursus|workshop|lokakarya|training|pelatihan)\b/i.test(t)) return 'course';
  if (/\b(phd|doctoral)\b/i.test(all)) return 'phd';
  if (/\bfellowship/i.test(all)) return 'fellowship';
  if (/\b(grant|hibah)/i.test(all)) return 'grant';
  return 'grant';
}

/* ---------------- penghalang ---------------- */
const HAS_ID = /(warga negara indonesia|\bWNI\b|indonesian (citizens|nationals)|citizens of indonesia|southeast asia|asean|global south|developing countr|all nationalities|any nationality)/i;
const HIGH = [
  { id: 'citizenship', text: 'Sepertinya hanya untuk warga negara/penduduk tertentu (bukan pelamar dari Indonesia).', res: [
    /\b(US|U\.S\.|American|EU|EEA|UK|British|Australian|Dutch|Canadian|New Zealand|domestic|home)\b[^.\n]{0,30}\b(citizens?|nationals?|students?|applicants?|residents?)\b[^.\n]{0,25}\bonly\b/i,
    /\bonly\b[^.\n]{0,30}\b(US|U\.S\.|EU|EEA|UK|home|domestic|Australian|Dutch|Canadian)\b[^.\n]{0,20}\b(citizens?|nationals?|students?|residents?|applicants?)\b/i,
    /\bmust be (a |an )?(US|U\.S\.|American|Australian|UK|British|EU|Dutch|Canadian) (citizen|national|permanent resident)/i,
    /\b(not (open|available) to international|international (students|applicants|candidates) (are )?(not eligible|cannot apply|ineligible)|home fee status only|domestic (students|candidates|applicants) only)\b/i,
    /\b(open|available|restricted|limited) (only )?to (citizens|nationals|residents|permanent residents) of (the )?(United States|USA|U\.S\.|European Union|EU|UK|United Kingdom|Australia|Canada|the Netherlands)\b/i] },
  { id: 'needs-phd', text: 'Butuh gelar doktor yang sudah selesai (ini jalur postdoc, bukan untuk calon PhD).', notPhd: true, res: [
    /\b(PhD|doctorate|doctoral degree)\s+(is |are )?(required|essential|must have been (awarded|completed))/i,
    /\b(completed|been awarded|hold(s|ing)?|have|possess) (a |an |their |your )?(PhD|doctorate|doctoral degree)\b/i,
    /\bwithin \w+ years? of (completing|receiving|the award of|being awarded) (their|your|the|a) (PhD|doctorate)/i,
    /\b(gelar doktor|lulusan S3|bergelar (doktor|S3)|sudah (meraih|memiliki) gelar (doktor|S3))/i] },
  { id: 'postdoc-title', text: 'Ini posisi postdoc / dosen senior: butuh PhD yang sudah selesai.', title: true, res: [/\b(post-?doc|postdoctoral|lecturer|professor|assistant professor|associate professor|tenure)/i] },
  { id: 'own-students', text: 'Kelihatannya hanya untuk mahasiswa/staf institusi itu sendiri.', res: [
    /\b(only|exclusively|solely)\b[^.\n]{0,45}\b(current|existing|enrolled|registered)\b[^.\n]{0,30}\b(students?|postgraduates?|staff|faculty)\b/i,
    /\b(open|available|restricted|limited|reserved)\s+(only\s+|exclusively\s+)?(to|for)\s+(current|existing|enrolled|registered)\b[^.\n]{0,40}\b(students?|postgraduates?|staff|faculty|employees)\b/i,
    /\b(must|need to) be (currently )?(a )?(registered|enrolled)\b[^.\n]{0,25}\b(student|at the university|on a (degree|course|programme))/i,
    /\binternal (candidates|applicants) only\b|\b(staff|employees) only\b/i,
    /\b(khusus|hanya (untuk|bagi)) (mahasiswa aktif|civitas|sivitas|dosen dan mahasiswa)/i] },
  { id: 'campus', text: 'Butuh afiliasi kampus (mis. dosen ber-NIDN/NIDK atau ketua peneliti dari universitas) — bisa lewat mitra universitas.', res: [
    /\b(NIDN|NIDK|NUPTK)\b/,
    /\b(dosen tetap|dosen perguruan tinggi|ketua (tim )?peneliti (harus|wajib) (dosen|berasal dari perguruan)|(harus|wajib) berafiliasi (dengan|pada) perguruan tinggi)/i,
    /\b(must|should) be (based|employed|affiliated) (at|with) (a|an) (university|higher education|academic|research) institution/i,
    /\b(principal investigator|lead applicant|PI)s? must (be|hold) (employed|based|affiliated|a (faculty|tenured|permanent))/i,
    /\b(faculty members? only|tenure-track faculty|academic staff (only|employed))\b/i] },
];
const MED = [
  { id: 'self-funded', text: 'Tidak didanai / hanya potongan biaya: kamu perlu cari dana sendiri.', re: SELF_FUNDED },
  { id: 'supervisor', text: 'Langkah awal: hubungi calon supervisor dulu (biasanya perlu persetujuan sebelum mendaftar).', phd: true, re: /\b((agreed|identify|find|secure|contact)\b[^.\n]{0,30}\b(a )?(potential |prospective )?(supervisor|promotor)\b[^.\n]{0,40}\b(before|prior to)|letter of (acceptance|support) from (a |your )?(supervisor|promotor)|\bLoA\b|surat (penerimaan|persetujuan) (calon )?(promotor|pembimbing|supervisor)|persetujuan (calon )?(promotor|pembimbing))/i },
  { id: 'language', text: 'Ada syarat tes bahasa (IELTS/TOEFL atau sejenisnya).', re: /\b(IELTS|TOEFL|PTE Academic|Duolingo English|Cambridge (English|C1)|language (test|certificate|proficiency) (is )?(required|score)|(tes|sertifikat) (kemampuan )?bahasa)\b/i },
  { id: 'cofunding', text: 'Ada syarat dana pendamping / co-funding.', re: /\b(co-?fund(ing|ed)|matching (funds?|grant|contribution)|cost[- ]shar(e|ing)|dana pendamping|in-kind contribution (is )?required)\b/i },
];

/**
 * @param o    item feed {id,title,org,link,summary,type,deadline,location,published,applicant,amount,why,steps}
 * @param ctx  {keywords:[], custom:[], places:[], avoid:[], html?, text?, today?}
 *             keywords: semua kata kunci (allKeywords()); custom: kata yang ia tambahkan sendiri.
 *             (ctx.profile lama {keywords, avoid, location} juga diterima.)
 */
export function analyse(o, ctx = {}) {
  const today = ctx.today || todayISO();
  const prof = ctx.profile || {};
  const keywords = (ctx.keywords || prof.keywords || []).map(k => String(k).toLowerCase().trim()).filter(Boolean);
  const places = ctx.places || prof.places || (prof.location ? [prof.location] : []);
  const avoid = ctx.avoid || prof.avoid || [];
  let text = '', pageTitle = '', source = 'feed';
  if (ctx.html) { const r = htmlToText(ctx.html); text = r.text; pageTitle = r.title; source = text.length > 500 ? 'page' : 'feed'; }
  else if (ctx.text) { text = String(ctx.text); source = 'page'; }
  const title = o.title || pageTitle || '';
  const feedText = [title, o.org, o.summary].filter(Boolean).join('\n');
  const full = source === 'page' ? title + '\n' + text + '\n' + feedText : feedText;
  const body = source === 'page' ? text + '\n' + (o.org || '') + '\n' + (o.summary || '') : [o.org, o.summary].filter(Boolean).join('\n');
  const type = ['phd', 'grant', 'fellowship', 'course'].includes(o.type) ? o.type : guessType(title, full);
  const isPhd = type === 'phd';
  const level = { phd: 'PhD', grant: 'Hibah', fellowship: 'Fellowship', course: 'Kursus / sekolah musim panas' }[type];

  const dl = pickDeadline(full, o.deadline, today);
  const start = pickStart(full);
  const pay = money(full);
  const days = dl ? daysBetween(today, dl.iso) : null;
  const rolling = !dl && ROLLING.test(full);

  /* --- tema --- */
  const inTitle = [], inBody = [];
  for (const th of THEMES) {
    th.re.lastIndex = 0; const t = th.re.test(title); th.re.lastIndex = 0;
    if (t) inTitle.push(th); else if (th.re.test(body)) inBody.push(th);
    th.re.lastIndex = 0;
  }
  const themes = [...inTitle, ...inBody].map(t => t.id);
  // kata kunci pribadinya (yang ia tambahkan sendiri); tanpa daftar custom, pakai kata kunci yang tidak tercakup tema
  const coveredByTheme = k => THEMES.some(th => { th.re.lastIndex = 0; const r = th.re.test(k); th.re.lastIndex = 0; return r; });
  const custom = ctx.custom ? ctx.custom.map(c => String(typeof c === 'string' ? c : c && c.w || '').toLowerCase().trim()).filter(Boolean) : keywords.filter(k => !coveredByTheme(k));
  const userHits = [...new Set(custom)].filter(k => wordRe(k).test(full));
  const hits = [...new Set([...keywords.filter(k => wordRe(k).test(full)), ...userHits])];
  const themeScore = Math.min(36, inTitle.length * 9 + inBody.length * 4 + userHits.length * 5);

  /* --- penghalang --- */
  const blockers = [], positives = [], notes = [];
  const idOk = HAS_ID.test(full);
  for (const r of HIGH) {
    if (r.notPhd && isPhd) continue;
    if (r.id === 'citizenship' && idOk) continue;
    if (r.id === 'postdoc-title' && (isPhd || /\b(pre-?doc|predoctoral)/i.test(title))) continue;
    const hay = r.title ? title : full;
    const hit = r.res.map(re => re.exec(hay)).find(Boolean);
    if (hit) blockers.push({ id: r.id, sev: 'high', text: r.text, quote: sentenceAt(hay, hit.index, hit[0].length) });
  }
  if (blockers.some(b => b.id === 'postdoc-title')) { const i = blockers.findIndex(b => b.id === 'needs-phd'); if (i >= 0) blockers.splice(i, 1); }
  if (days != null && days < 0) blockers.unshift({ id: 'closed', sev: 'high', text: `Tenggatnya sudah lewat (${dl.iso}).`, quote: dl.text });
  for (const r of MED) {
    if (r.phd && !isPhd) continue;
    const hit = r.re.exec(full);
    if (hit) blockers.push({ id: r.id, sev: 'med', text: r.text, quote: sentenceAt(full, hit.index, hit[0].length) });
  }
  if (days != null && days >= 0 && days < 14) blockers.push({ id: 'tight', sev: 'med', text: days === 0 ? 'Mepet: tutup hari ini.' : `Mepet: tinggal ${days} hari.`, quote: dl.text });
  for (const a of avoid) if (a && wordRe(a).test(full)) { const m = wordRe(a).exec(full); blockers.push({ id: 'avoid', sev: 'med', text: `Menyebut "${a}", yang ingin kamu hindari.`, quote: sentenceAt(full, m.index, m[0].length) }); }

  /* --- hal yang menguntungkan --- */
  let pr = 20 + themeScore;
  const intl = INTL_OK.exec(full);
  if (intl) { pr += 12; positives.push({ id: 'intl', text: 'Terbuka untuk pelamar internasional / dari Indonesia.', quote: sentenceAt(full, intl.index, intl[0].length) }); }
  else if (o.intl === true) { pr += 12; positives.push({ id: 'intl', text: 'Menurut robot, terbuka untuk pelamar internasional.', quote: '' }); }
  if (type === 'phd' || type === 'fellowship') {
    if (pay.funded === 'full') { pr += 10; const m = FUNDED_FULL.exec(full); positives.push({ id: 'funded', text: 'Didanai penuh (biaya kuliah dan biaya hidup / gaji).', quote: m ? sentenceAt(full, m.index, m[0].length) : '' }); }
    else if (pay.funded === 'partial') { pr += 4; const m = FUNDED_PART.exec(full); positives.push({ id: 'partial', text: 'Ada pendanaan sebagian (stipend atau potongan biaya).', quote: m ? sentenceAt(full, m.index, m[0].length) : '' }); }
  }
  if (type === 'grant' && (pay.amount || o.amount)) { pr += 3; positives.push({ id: 'amount', text: `Besaran dana disebutkan: ${pay.amount || o.amount}.`, quote: '' }); }
  const lv = LEVEL_OK.exec(full);
  if (lv) { pr += 6; positives.push({ id: 'level', text: 'Cocok untuk jenjangmu (lulusan S2 / peneliti awal karier / praktisi).', quote: sentenceAt(full, lv.index, lv[0].length) }); }

  // siapa yang mengajukan
  const S_ = sentences(full);
  const orgSent = S_.find(s => ORG_RE.test(s) && ELIG_CUE.test(s));
  const indSent = S_.find(s => IND_RE.test(s));
  let applicant = ['individu', 'lembaga', 'keduanya'].includes(o.applicant) ? o.applicant : null;
  if (!applicant) {
    if (type === 'phd' || type === 'course') applicant = 'individu';
    else if (orgSent && (indSent || type === 'fellowship')) applicant = 'keduanya';
    else if (orgSent) applicant = 'lembaga';
    else if (indSent || type === 'fellowship') applicant = 'individu';
  }
  if (orgSent || applicant === 'lembaga' || applicant === 'keduanya') { pr += 5; positives.push({ id: 'sokola', text: 'Lembaga / komunitas boleh mengajukan: bisa lewat Sokola.', quote: orgSent || '' }); }

  if (days != null && days >= 14 && days <= 90) pr += 8; else if (days != null && days > 90) pr += 4; else if (rolling) { pr += 4; positives.push({ id: 'rolling', text: 'Dibuka terus (rolling): bisa diajukan kapan saja.', quote: '' }); }
  const place = placeHit(full + ' ' + (o.location || ''), places);
  if (place) { pr += 3; positives.push({ id: 'place', text: `Di tempat pilihanmu: ${place}.`, quote: '' }); }
  if (String(o.id || '').startsWith('scout-') || o.curated) pr += 8;

  const nHigh = blockers.filter(b => b.sev === 'high').length, nMed = blockers.filter(b => b.sev === 'med').length;
  pr -= Math.min(60, nHigh * 40) + Math.min(25, nMed * 10);
  pr = Math.max(1, Math.min(99, Math.round(pr)));
  const verdict = nHigh ? 'skip' : pr >= 68 ? 'top' : pr >= 50 ? 'good' : pr >= 34 ? 'maybe' : 'low';

  const labels = [...inTitle, ...inBody].map(t => t.label);
  const whyBits = [...labels, ...userHits.filter(k => !labels.includes(k))];
  const whyRelevant = whyBits.length ? 'Nyambung dengan: ' + whyBits.slice(0, 5).join(' · ') : 'Belum kelihatan nyambung dengan tema-temamu.';

  const deg = /(2[:.]1|upper[- ]second|first[- ]class|GPA[^.\n]{0,20}\d[.,]\d+|IPK[^.\n]{0,20}\d[.,]\d+)/i.exec(full);
  if (deg) notes.push(`Ada syarat nilai: ${deg[0]}. Cocokkan dengan transkripmu.`);
  const ielts = /(IELTS|TOEFL)[^\n]{0,45}?(?=\)|;|\.\s|\n|$)/i.exec(full); if (ielts) notes.push('Tes bahasa: ' + ielts[0].replace(/\s+/g, ' ').trim());
  const age = /\b(maksimal|maximum|under|below|not older than|paling tinggi|usia)\b[^.\n]{0,20}\b(\d{2}) (tahun|years)/i.exec(full); if (age) notes.push('Ada batas usia: ' + age[0]);

  /* --- syarat & cara daftar --- */
  const SS = sentences(source === 'page' ? text : feedText);
  const cue = /\b(must|should|required|requires?|essential|desirable|minimum|hold|ideally|expected|need to|equivalent|will have|have a|have an|wajib|harus|minimal|diutamakan|memiliki|persyaratan|syarat)\b/i;
  const req = { degree: [], skills: [], english: [], eligibility: [] };
  for (const s of SS) {
    if (/\b(english|ielts|toefl|language (test|requirement|proficiency)|bahasa inggris)\b/i.test(s) && cue.test(s)) req.english.push(s);
    else if (/\b(eligib|nationalit|citizen|residen|fee status|visa|open to|terbuka (untuk|bagi)|warga negara|kewarganegaraan|pemohon|pengusul|sasaran)/i.test(s) && !/^(about|read more)/i.test(s)) req.eligibility.push(s);
    else if (/\b(degree|bachelor|master|honours|qualification|undergraduate|postgraduate|doctorate|phd|ijazah|sarjana|magister|lulusan|S1|S2|S3)\b/i.test(s) && cue.test(s)) req.degree.push(s);
    else if (/\b(experience|knowledge|skills?|familiar|proficien|ability|competen|understanding|fieldwork|track record|publication|pengalaman|keterampilan|kemampuan|rekam jejak|publikasi)\b/i.test(s) && cue.test(s)) req.skills.push(s);
  }
  const used = new Set(Object.values(req).flat());
  const apply = SS.filter(s => !used.has(s) && /\b(apply|application|submit|send|e-?mail|cover letter|motivation letter|personal statement|research proposal|concept note|referees?|references|curriculum vitae|CV|daftar|pendaftaran|kirim|unggah|proposal|surat (motivasi|rekomendasi)|formulir)\b/i.test(s) && /\b(please|should|must|to apply|by|via|online|through|include|attach|submit|send|complete|melalui|lewat|wajib|harus|silakan|dikirim|diunggah)\b/i.test(s) && !/cookie|privacy|subscribe|newsletter/i.test(s));
  const contacts = [...new Set((full.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []).filter(e => !/noreply|no-reply|example|sentry|wix/i.test(e)))].slice(0, 3);

  /* --- kalimat ringkas --- */
  const firstHigh = blockers.find(b => b.sev === 'high'), firstMed = blockers.find(b => b.sev === 'med');
  const fit = labels.length ? labels.slice(0, 3).join(', ') : 'profilmu';
  const verdictText = {
    top: `Cocok sekali: nyambung dengan ${fit}${positives[0] ? ', dan ' + positives[0].text.charAt(0).toLowerCase() + positives[0].text.slice(1).replace(/\.$/, '') : ''}. Sejauh ini tidak ada penghalang.`,
    good: `Layak dilirik serius.${firstMed ? ' Cek dulu: ' + firstMed.text : ' Sejauh ini tidak ada penghalang.'}`,
    maybe: `Peluang coba-coba.${firstMed ? ' ' + firstMed.text : ' Kecocokannya dengan profilmu sedang-sedang saja.'}`,
    low: 'Kurang nyambung dengan profilmu: simpan untuk nanti kalau tidak ada yang lebih pas.',
    skip: `Kayaknya bukan buatmu: ${firstHigh ? firstHigh.text.charAt(0).toLowerCase() + firstHigh.text.slice(1) : 'ada syarat wajib yang tidak cocok.'}`,
  }[verdict];
  const summary = verdictText + ' Cek lagi di laman aslinya.';
  let nextStep;
  if (verdict === 'skip') nextStep = firstHigh && firstHigh.id === 'campus' ? 'Kalau temanya pas, cari mitra universitas (dosen ber-NIDN) yang mau jadi pengusul utama, dan Sokola jadi mitra lapangan. Kalau tidak, tandai "Bukan untukku".' : 'Tandai "Bukan untukku" supaya daftarmu bersih.';
  else if (isPhd) nextStep = contacts.length ? `Kirim email singkat ke kontak (${contacts[0]}) dengan CV dan 3 kalimat tentang minat risetmu sebelum mendaftar.` : 'Cari calon supervisor di laman program, baca satu tulisannya, lalu kirim email singkat dengan CV sebelum mendaftar (template ada di Pelacak).';
  else if (applicant === 'lembaga') nextStep = 'Cek apakah Sokola memenuhi syarat lembaga (badan hukum, rekening, laporan program), lalu siapkan concept note 1–2 halaman.';
  else if (applicant === 'keduanya') nextStep = 'Putuskan dulu: ajukan sebagai Sokola atau pribadi (lihat Rute → "Hibah lewat Sokola atau pribadi"), lalu siapkan concept note.';
  else nextStep = 'Baca syarat lengkapnya, catat dokumen yang diminta, lalu buat draf proposal / research statement singkat.';

  return {
    id: o.id, title, org: o.org || '', link: o.link, type, level, source,
    deadline: dl ? dl.iso : null, deadlineText: dl ? dl.text : '', daysLeft: days, rolling,
    start: start ? start.label : '',
    amount: pay.amount || o.amount || '', stipend: pay.stipend || '', pay: pay.stipend || pay.amount || o.amount || '', fees: pay.fees || '', funded: pay.funded,
    applicant, themes, whyRelevant,
    location: o.location || place || '', contacts,
    blockers, positives, notes, requirements: Object.fromEntries(Object.entries(req).map(([k, v]) => [k, uniq(v, 5)])),
    howToApply: uniq(apply, 5), hits: hits.slice(0, 8), userHits,
    priority: pr, verdict, verdictText, summary, nextStep,
    analysedAt: today, expires: dl ? addDays(dl.iso, 3) : addDays(today, 30),
  };
}
function addDays(isoStr, n) { const d = new Date(Date.parse(isoStr) + n * 86400000); return d.toISOString().slice(0, 10); }

export const VERDICT = {
  top: { label: 'Mulai dari sini', icon: '🌟', cls: 'v-top' }, good: { label: 'Layak dilirik', icon: '👍', cls: 'v-good' },
  maybe: { label: 'Coba-coba berhadiah', icon: '🤔', cls: 'v-maybe' }, low: { label: 'Nanti saja', icon: '💤', cls: 'v-low' },
  skip: { label: 'Kayaknya bukan buatmu', icon: '🚫', cls: 'v-skip' },
};
export const APPLICANT = { individu: 'Pribadi', lembaga: 'Sebagai Sokola', keduanya: 'Dua-duanya bisa' };
export const TYPE_LABEL = { phd: 'PhD', grant: 'Hibah', fellowship: 'Fellowship', course: 'Kursus' };

export function toMarkdown(a) {
  const L = [];
  L.push('---', 'type: analisis-peluang', `id: ${a.id}`, `title: ${fmQuote(a.title)}`, `url: ${a.link || ''}`, `jenis: ${a.type}`, `tenggat: ${a.deadline || ''}`, `prioritas: ${a.priority}`, `verdict: ${a.verdict}`,
    `pengaju: ${a.applicant || ''}`, `dibaca-dari: ${a.source === 'page' ? 'laman lengkap' : 'ringkasan feed saja'}`, `dianalisis: ${a.analysedAt}`, `kedaluwarsa: ${a.expires}`, '---', '');
  L.push(`# ${a.title}`, '', `**${VERDICT[a.verdict].icon} ${VERDICT[a.verdict].label}** (prioritas ${a.priority}/99). ${a.summary || a.verdictText}`, '', `${a.whyRelevant}`, '', `**Langkah berikutnya:** ${a.nextStep}`, '');
  L.push('## Fakta penting', '', '| | |', '|---|---|');
  const row = (k, v) => v && L.push(`| ${k} | ${String(v).replace(/\|/g, '/')} |`);
  row('Jenis', a.level); row('Lembaga', a.org);
  row('Tenggat', a.deadline ? `${a.deadline}${a.daysLeft != null ? ` (${a.daysLeft < 0 ? 'sudah lewat' : 'sisa ' + a.daysLeft + ' hari'})` : ''}` : a.rolling ? 'Dibuka terus (rolling)' : 'Tidak ketemu: cek di laman aslinya');
  row('Mulai', a.start); row('Dana', a.amount); row('Stipend / gaji', a.stipend); row('Biaya kuliah', a.fees);
  row('Pendanaan', { full: 'Didanai penuh', partial: 'Sebagian', none: 'Tidak didanai', unknown: '' }[a.funded]);
  row('Siapa yang mengajukan', APPLICANT[a.applicant] || ''); row('Lokasi', a.location); row('Kontak', (a.contacts || []).join(', '));
  L.push('');
  if (a.blockers.length) { L.push('## Cek dulu sebelum mendaftar', ''); a.blockers.forEach(b => L.push(`- ${b.sev === 'high' ? '🚩' : '⚠️'} **${b.text}**${b.quote ? ` — "${b.quote}"` : ''}`)); L.push(''); }
  if (a.positives.length) { L.push('## Yang menguntungkanmu', ''); a.positives.forEach(b => L.push(`- ✅ ${b.text}${b.quote ? ` — "${b.quote}"` : ''}`)); L.push(''); }
  const R = a.requirements, rs = [['Gelar & kualifikasi', R.degree], ['Pengalaman & keterampilan', R.skills], ['Bahasa', R.english], ['Kelayakan', R.eligibility]].filter(([, v]) => v && v.length);
  if (rs.length) { L.push('## Yang mereka minta', ''); rs.forEach(([k, v]) => { L.push(`**${k}**`, ''); v.forEach(x => L.push(`- ${x}`)); L.push(''); }); }
  if (a.notes.length) { L.push('## Catatan', ''); a.notes.forEach(n => L.push(`- ${n}`)); L.push(''); }
  if (a.howToApply.length) { L.push('## Cara daftar', ''); a.howToApply.forEach(x => L.push(`- ${x}`)); L.push(''); }
  if (a.hits.length) L.push('## Kata kuncimu yang muncul', '', a.hits.join(', ') + '.', '');
  L.push('---', '', `[Buka laman aslinya](${a.link || ''}). ${a.source === 'page' ? 'Dibaca dari laman lengkap' : 'Bacaan cepat dari ringkasan feed saja'} pada ${a.analysedAt}. Ringkasan ini otomatis: cek lagi di laman aslinya untuk tenggat, kelayakan dan besaran dana.`);
  return L.join('\n');
}
