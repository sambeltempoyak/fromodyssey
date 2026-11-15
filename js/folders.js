// Peta folder Drive: satu-satunya sumber kebenaran (tanpa import, jadi bisa dipakai tes Node).
export const DIR_MAP = {
  inbox: '00 Kotak Masuk',
  peluang: '01 Peluang',
  apps: '01 Peluang/Lamaran',
  docs: '02 Dokumen Pribadi',
  cv: '02 Dokumen Pribadi/CV & Surat',
  ijazah: '02 Dokumen Pribadi/Ijazah & Transkrip',
  proposal: '02 Dokumen Pribadi/Proposal & Draf',
  rekomendasi: '02 Dokumen Pribadi/Rekomendasi',
  lainnya: '02 Dokumen Pribadi/Lainnya',
  lapangan: '03 Data Lapangan',
  bacaan: '04 Bacaan',
  tulisan: '05 Tulisan Sendiri',
  sys: '99 Sistem',
  aset: '99 Sistem/aset',
  cache: '99 Sistem/cache-peluang',
};
export const UNKNOWN_PROJECT = 'Belum ditentukan';
// kategori data lapangan -> nama subfolder di 03 Data Lapangan/<Proyek>/
export const FIELD_SUB = {
  catatan: 'Catatan Lapangan',
  rekaman: 'Rekaman',
  transkrip: 'Transkrip',
  foto: 'Foto & Video',
  'dokumen-lapangan': 'Dokumen',
};
export const FIELD_CATS = Object.keys(FIELD_SUB);
export const PERSONAL_SUB = {
  cv: 'CV & Surat', ijazah: 'Ijazah & Transkrip', proposal: 'Proposal & Draf', rekomendasi: 'Rekomendasi', lainnya: 'Lainnya',
};
export const DEFAULT_TOPIC = 'Umum';

const clean = s => String(s || '').replace(/[\\/<>:"|?*\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();

/** Folder tujuan untuk satu kategori. */
export function folderFor(cat, { project = '', topic = '' } = {}) {
  if (FIELD_SUB[cat]) return `${DIR_MAP.lapangan}/${clean(project) || UNKNOWN_PROJECT}/${FIELD_SUB[cat]}`;
  if (cat === 'bacaan') return `${DIR_MAP.bacaan}/${clean(topic) || DEFAULT_TOPIC}`;
  if (cat === 'tulisan') return DIR_MAP.tulisan;
  if (PERSONAL_SUB[cat]) return DIR_MAP[cat];
  return DIR_MAP.lainnya;
}
