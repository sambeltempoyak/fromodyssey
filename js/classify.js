// Menebak berkas apa ini (CV, ijazah, catatan lapangan, rekaman, bacaan...) dan di folder mana sebaiknya disimpan.
// Fungsi murni (tanpa DOM) supaya bisa dites di Node: nama + mime + teks pembuka + halaman + daftar proyek -> hasil.
import { DIR_MAP, FIELD_SUB, FIELD_CATS, PERSONAL_SUB, UNKNOWN_PROJECT, DEFAULT_TOPIC, folderFor } from './folders.js';

export const CATS = {
  cv: { label: 'CV & surat lamaran', icon: '🧾' },
  ijazah: { label: 'Ijazah & transkrip nilai', icon: '🎓' },
  proposal: { label: 'Proposal & draf', icon: '✍️' },
  rekomendasi: { label: 'Surat rekomendasi', icon: '✉️' },
  catatan: { label: 'Catatan lapangan', icon: '📓' },
  rekaman: { label: 'Rekaman suara', icon: '🎙️' },
  transkrip: { label: 'Transkrip wawancara', icon: '🗒️' },
  foto: { label: 'Foto & video', icon: '📷' },
  'dokumen-lapangan': { label: 'Dokumen lapangan', icon: '📂' },
  bacaan: { label: 'Bacaan (paper)', icon: '📚' },
  tulisan: { label: 'Tulisan sendiri', icon: '🖋️' },
  lainnya: { label: 'Lainnya', icon: '📎' },
};
export const CAT_ORDER = Object.keys(CATS);

// Topik bacaan: kelompok kata kunci antropologi. Kelompok dengan hit terbanyak menang.
export const TOPICS = [
  ['Masyarakat adat & hak', /(masyarakat adat|indigenous|adat\b|customary|land rights|hak ulayat|hak atas tanah|native title|free,? prior|fpic|tanah ulayat|first nations|aborigin)/gi],
  ['Dekolonisasi & pascakolonial', /(dekolonis|decoloni|postcolonial|post-colonial|pascakolonial|kolonial|colonial|settler|imperial|epistemic violence)/gi],
  ['Ontologi & pluriverse', /(ontolog|pluriverse|more-than-human|multinatural|perspectiv(al|ism)|cosmolog|cosmopolitic|relational|animis|worlding|ontological turn)/gi],
  ['Gender & seksualitas', /(gender|perempuan|women|feminis|seksualitas|sexualit|queer|lgbt|patriark|kesetaraan|masculin)/gi],
  ['Pendidikan', /(pendidikan|education|pedagog|literacy|literasi|sekolah|schooling|learning|belajar|kurikulum|curricul)/gi],
  ['Bunyi & indra', /(soundscape|sound|bunyi|listening|acoustic|akustik|sensory|sensorial|indra|auditory|ethnomusic|ekologi akustik|deep listening|visual ethnograph|multimodal)/gi],
  ['Lingkungan & multispesies', /(multispecies|multi-species|multispesies|anthropocene|antroposen|climate|iklim|ecolog|ekolog|environment|lingkungan|forest|hutan|biodivers|extinction|planetary|waste|sampah)/gi],
  ['Metode & etika', /(methodolog|metodolog|ethnograph|etnograf|fieldwork|kerja lapangan|research ethics|etika penelitian|participant observation|observasi partisipan|reflexiv|positionality|informed consent|participatory|partisipatif)/gi],
  ['Indonesia & Asia Tenggara', /(indonesia|southeast asia|asia tenggara|java\b|jawa|sumatra|sumatera|borneo|kalimantan|sumba|papua|jambi|malay|nusantara|orang rimba|suku anak dalam)/gi],
];

// Proyek lapangan bawaan + alias. Nama proyek di state dicocokkan dengan kunci (huruf kecil).
export const PROJECT_ALIASES = {
  'orang rimba': ['orang rimba', 'rimba', 'bukit duabelas', 'bukit dua belas', 'makekal', 'jambi', 'tumenggung', 'suku anak dalam'],
  'sumba': ['sumba', 'sodan', 'waikabubak', 'marapu', 'kodi', 'waikacura'],
  'semarang': ['semarang', 'bank sampah'],
};

const AUDIO_EXT = ['m4a', 'mp3', 'wav', 'ogg', 'opus', 'aac', 'flac', 'wma', 'amr', '3gp', 'oga'];
const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif', 'gif', 'tif', 'tiff', 'bmp', 'avif'];
const VIDEO_EXT = ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'];
export const extOf = name => (String(name || '').match(/\.([a-z0-9]+)$/i) || [, ''])[1].toLowerCase();
export function mediaKind(name, mime = '') {
  const e = extOf(name), m = String(mime || '').toLowerCase();
  if (m.startsWith('audio/') || AUDIO_EXT.includes(e)) return 'audio';
  if (m.startsWith('image/') || IMAGE_EXT.includes(e)) return 'image';
  if (m.startsWith('video/') || VIDEO_EXT.includes(e)) return 'video';
  return 'doc';
}

export function pickTopic(text) {
  let best = null, bn = 1;
  for (const [name, re] of TOPICS) { const n = (String(text || '').match(re) || []).length; if (n > bn) { bn = n; best = name; } }
  return best || DEFAULT_TOPIC;
}

const norm = s => String(s || '').toLowerCase();
const countMatches = (re, s) => (s.match(re) || []).length;
const wordHit = (needle, hay) => {
  const n = norm(needle).trim(); if (!n) return 0;
  const esc = n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (hay.match(new RegExp('(^|[^a-z0-9])' + esc + '(?![a-z0-9])', 'g')) || []).length;
};

/** Cari proyek dari nama berkas + teks. MengembalikAn {project, hits} (project '' kalau tidak ada). */
export function detectProject(fn, text, projects = []) {
  const f = norm(fn), t = norm(text).slice(0, 8000);
  const groups = new Map(); // nama tampil -> daftar kata
  const canonByKey = {};
  for (const p of projects || []) { const k = norm(p).trim(); if (k) { canonByKey[k] = p.trim(); groups.set(p.trim(), [k]); } }
  for (const [key, words] of Object.entries(PROJECT_ALIASES)) {
    const display = canonByKey[key] || key.replace(/(^|\s)\S/g, c => c.toUpperCase());
    const cur = groups.get(display) || [];
    groups.set(display, [...new Set([...cur, ...words])]);
  }
  let best = '', bs = 0;
  for (const [display, words] of groups) {
    let s = 0;
    for (const w of words) s += wordHit(w, f) * 3 + Math.min(wordHit(w, t), 6);
    if (s > bs) { bs = s; best = display; }
  }
  return { project: best, hits: bs };
}

/**
 * @param name   nama berkas asli
 * @param o      { mime, text (teks pembuka), pages, projects: ['Orang Rimba', ...] }
 * @returns {cat, sub, project, topic, folder, conf, reasons}
 */
export function classify(name, o = {}) {
  if (typeof o === 'string') o = { text: o };
  const text = String(o.text || '').slice(0, 8000), pages = o.pages || 0;
  const fn = norm(String(name || '').replace(/\.[a-z0-9]+$/i, '')).replace(/[_\-.]+/g, ' ').replace(/\s+/g, ' ').trim();
  const low = norm(text);
  const kind = mediaKind(name, o.mime), ext = extOf(name);
  const score = {}, why = {};
  const add = (cat, s, reason) => { if (s > (score[cat] || 0)) { score[cat] = s; why[cat] = reason; } };
  const re = (r, s) => r.test(s);

  // --- jenis media
  if (kind === 'audio') add('rekaman', 0.95, 'berkas suara');
  if (kind === 'image') add('foto', 0.6, 'berkas gambar');
  if (kind === 'video') add('foto', 0.95, 'berkas video');
  if (['xlsx', 'xls', 'csv', 'ods', 'kml', 'kmz', 'geojson', 'gpx', 'shp'].includes(ext)) add('dokumen-lapangan', 0.5, 'lembar data / peta');

  // --- petunjuk nama berkas
  if (re(/\b(cv|curriculum vitae|resume|riwayat hidup|daftar riwayat hidup)\b/, fn)) add('cv', 0.9, 'nama berkas menyebut CV');
  if (re(/\b(cover letter|motivation(al)? letter|letter of motivation|personal statement|statement of purpose|surat lamaran|surat motivasi|surat pengantar)\b/, fn)) add('cv', 0.9, 'nama berkas menyebut surat lamaran / motivasi');
  if (re(/\b(ijazah|sertifikat|certificate|transkrip nilai|transkrip akademik|academic transcript|official transcript|transcript of records|diploma|ielts|toefl|khs|kartu hasil studi|degree certificate|surat keterangan lulus|skl)\b/, fn)) add('ijazah', 0.92, 'nama berkas menyebut ijazah / transkrip nilai / sertifikat');
  if (re(/\b(rekomendasi|recommendation|reference letter|referee|testimonial|letter of support|surat dukungan)\b/, fn)) add('rekomendasi', 0.88, 'nama berkas menyebut surat rekomendasi');
  if (re(/\b(proposal|research plan|rencana penelitian|rancangan penelitian|research outline|grant application)\b/, fn)) add('proposal', 0.85, 'nama berkas menyebut proposal');
  if (re(/\b(outline|draft|draf|konsep|skripsi|tesis|thesis|disertasi|dissertation|bab \d)\b/, fn)) add('proposal', 0.55, 'nama berkas menyebut draf');
  if (re(/\b(essay|esai|opini|artikel saya|blog|refleksi|reflection|op ed|kolom|policy brief|tulisan|my writing|manuscript|naskah|cerita|cerpen)\b/, fn)) add('tulisan', 0.75, 'nama berkas menyebut esai / tulisan');
  if (re(/\b(catatan lapangan|catatan wawancara|catatan harian|catatan observasi|field ?notes?|jurnal lapangan|jurnal harian|jurnal penelitian|logbook|log lapangan|observasi lapangan|field journal|field diary)\b/, fn)) add('catatan', 0.92, 'nama berkas menyebut catatan lapangan');
  if (re(/\b(transkrip wawancara|transkrip fgd|transkrip diskusi|transkrip rekaman|transkripsi|verbatim|interview transcript|transcript (of )?(the )?(interview|fgd)|transcript interview|hasil transkrip)\b/, fn)) add('transkrip', 0.93, 'nama berkas menyebut transkrip wawancara');
  else if (re(/\b(wawancara|interview|fgd|focus group|diskusi kelompok)\b/, fn) && kind === 'doc') add('transkrip', 0.68, 'nama berkas menyebut wawancara / FGD');
  if (re(/\btranskrip\b/, fn) && !re(/\b(nilai|akademik|wawancara|fgd|rekaman|diskusi)\b/, fn)) add('transkrip', 0.5, 'nama berkas menyebut transkrip');
  if (re(/\b(transcript|transcripts)\b/, fn) && !re(/\b(academic|official|records|interview|fgd|grade|degree)\b/, fn)) add('transkrip', 0.5, 'nama berkas menyebut transcript');
  if (re(/\b(surat izin|izin penelitian|informed consent|persetujuan|lembar|daftar hadir|absensi|kuesioner|kuisioner|questionnaire|laporan kegiatan|laporan lapangan|notulen|panduan wawancara|interview guide|protokol|field report|survei|survey|peta|sketsa|rab|anggaran|jadwal)\b/, fn)) add('dokumen-lapangan', 0.7, 'nama berkas seperti dokumen kerja lapangan');
  // pola nama paper: "Penulis 2019 - Judul", "Penulis et al", "Penulis (2019)"
  if (kind === 'doc' && (re(/^[a-z' ]{2,30}( et al)? (19|20)\d\d\b/, fn) || re(/\bet al\b/, fn) || re(/\((19|20)\d\d\)/, String(name || '').toLowerCase()))) add('bacaan', 0.62, 'nama berkas seperti rujukan paper (penulis + tahun)');

  // --- petunjuk isi
  if (low) {
    const dateLine = /^\s*(#+\s*)?(senin|selasa|rabu|kamis|jumat|jum'at|sabtu|minggu|monday|tuesday|wednesday|thursday|friday|saturday|sunday)?[, ]*(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}|\d{4}-\d{2}-\d{2}|\d{1,2} (jan|feb|mar|apr|mei|may|jun|jul|agu|aug|sep|okt|oct|nov|des|dec)[a-z]*\.? \d{2,4}|hari (ke|ke-) ?\d+)/gim;
    const dates = countMatches(dateLine, text);
    const diary = countMatches(/\b(hari ini|tadi (pagi|siang|sore|malam)|observasi|aku tiba|saya tiba|kami tiba|berangkat|catatan hari|refleksi hari|today i|this morning|we arrived|i arrived)\b/g, low);
    if (dates >= 2 && diary >= 1) add('catatan', 0.78 + Math.min(0.1, dates * 0.02), 'isinya bergaya catatan harian bertanggal');
    else if (dates >= 3) add('catatan', 0.66, 'isinya banyak entri bertanggal');
    const turns = countMatches(/^\s*(p|n|i|r|q|a|peneliti|narasumber|informan|interviewer|interviewee|responden|moderator|peserta|pewawancara|ibu|bapak)\s*\d*\s*[:：]/gim, text)
      + countMatches(/^\s*\[?\d{1,2}:\d{2}(:\d{2})?\]?\s+[^\n]{0,30}[:：]/gm, text);
    if (turns >= 4) add('transkrip', 0.86 + Math.min(0.06, turns * 0.005), 'isinya giliran bicara (P: / N: / Informan:)');
    if (re(/\b(curriculum vitae|riwayat hidup|work experience|professional experience|pengalaman kerja|riwayat pendidikan)\b/, low) && countMatches(/\b(education|skills|languages|publications|pendidikan|keahlian|bahasa|publikasi|pengalaman|organisasi)\b/g, low) >= 3 && pages <= 4) add('cv', 0.8, 'isinya bagian-bagian CV (pengalaman, pendidikan, keahlian)');
    if (re(/\b(dear (sir|madam|hiring|dr|prof|mr|ms|mrs)|yth\.?|kepada yth)\b/, low) && re(/\b(yours (sincerely|faithfully)|kind regards|i am writing to apply|i am applying|hormat saya|dengan hormat|bersama surat ini saya)\b/, low)) {
      if (re(/\b(rekomendasi|recommend|i have known|saya (telah|sudah) mengenal|to whom it may concern)\b/, low)) add('rekomendasi', 0.8, 'isinya seperti surat rekomendasi');
      else add('cv', 0.78, 'isinya seperti surat lamaran');
    } else if (re(/\b(i am pleased to recommend|i have known|to whom it may concern|dengan ini merekomendasikan|saya merekomendasikan)\b/, low)) add('rekomendasi', 0.8, 'isinya seperti surat rekomendasi');
    if (re(/\b(transcript of records|academic transcript|this is to certify|has been awarded|grade point average|\bgpa\b|indeks prestasi|\bipk\b|telah menyelesaikan|dinyatakan lulus|kartu hasil studi)\b/, low) && !re(/\babstract\b/, low)) add('ijazah', 0.8, 'isinya seperti ijazah / transkrip nilai');
    const paperSig = (re(/\b(abstract|abstrak)\b/, low) ? 1 : 0) + (re(/\b(doi\b|10\.\d{4,9}\/)/, low) ? 1 : 0)
      + (re(/\b(et al\.|keywords?:|kata kunci|introduction|pendahuluan|materials and methods|results and discussion|references|daftar pustaka|bibliography)\b/, low) ? 1 : 0)
      + (re(/\b(journal|jurnal|press|elsevier|springer|wiley|sage|routledge|taylor|cambridge|jstor|plos|mdpi|received:|accepted:)\b/, low) ? 1 : 0) + (pages >= 8 ? 1 : 0);
    if (paperSig >= 3 && !(score.transkrip > 0.8)) add('bacaan', 0.55 + paperSig * 0.07, 'isinya seperti artikel ilmiah (abstrak, DOI, daftar pustaka)');
    if (re(/\b(research proposal|proposed research|research questions?|pertanyaan penelitian|latar belakang|tujuan penelitian|aims and objectives|work plan|rencana kerja|jadwal penelitian|timeline)\b/, low) && !re(/\bdoi\b/, low) && paperSig < 3) add('proposal', 0.64, 'isinya seperti proposal / rencana penelitian');
    if (re(/\b(informed consent|lembar persetujuan|surat izin penelitian|panduan wawancara|interview guide|kuesioner)\b/, low)) add('dokumen-lapangan', 0.66, 'isinya dokumen kerja lapangan');
  }

  // --- pilih pemenang
  let cat = 'lainnya', conf = 0.3, reason = 'tidak ada petunjuk jelas, ditaruh di Lainnya';
  for (const [c, s] of Object.entries(score)) if (s > conf) { cat = c; conf = s; reason = why[c]; }
  const reasons = [reason];
  // Gambar hasil pindai dokumen (mis. ijazah.jpg) boleh menang atas "foto"; selain itu foto tetap foto.
  const pd = detectProject(fn, text, o.projects);
  const isField = FIELD_CATS.includes(cat);
  const project = isField ? (pd.project || UNKNOWN_PROJECT) : (pd.hits >= 3 ? pd.project : '');
  if (isField && pd.project) reasons.push('proyek dari kata kunci: ' + pd.project);
  const topic = cat === 'bacaan' ? pickTopic(text + ' ' + fn) : '';
  const folder = folderFor(cat, { project, topic });
  const sub = isField ? FIELD_SUB[cat] : cat === 'bacaan' ? topic : PERSONAL_SUB[cat] || '';
  return { cat, sub, project, topic, folder, conf: Math.min(0.99, conf), reasons };
}

/** Kategori dari lokasi folder (dipakai saat mengadopsi berkas yang dipindahkan sendiri di Drive). Mengembalikan null kalau tak jelas. */
export function catFromPath(path) {
  const seg = String(path || '').split('/').filter(Boolean);
  if (seg.length < 2) return null;
  const top = seg[0];
  if (top === DIR_MAP.lapangan.split('/')[0] || top === DIR_MAP.lapangan) {
    const subName = seg[2]; const hit = Object.entries(FIELD_SUB).find(([, v]) => v === subName);
    return { cat: hit ? hit[0] : 'dokumen-lapangan', project: seg[1] || '', topic: '' };
  }
  if (top === DIR_MAP.bacaan) return { cat: 'bacaan', project: '', topic: seg[1] || '' };
  if (top === DIR_MAP.tulisan) return { cat: 'tulisan', project: '', topic: '' };
  if (top === DIR_MAP.docs) { const hit = Object.entries(PERSONAL_SUB).find(([, v]) => v === seg[1]); return hit ? { cat: hit[0], project: '', topic: '' } : null; }
  return null;
}

export function niceTitle(name, mdTitle, cat) {
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (cat === 'bacaan' && mdTitle && mdTitle.length > 12) return mdTitle.replace(/\s+/g, ' ').trim().slice(0, 110);
  return base || 'Tanpa judul';
}
