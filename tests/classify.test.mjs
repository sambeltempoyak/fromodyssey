import assert from 'node:assert/strict';
import { classify, catFromPath, mediaKind } from '../js/classify.js';
const P = ['Orang Rimba', 'Sumba', 'Semarang'];
const c = (name, o = {}) => classify(name, { projects: P, ...o });
let n = 0; const t = (label, fn) => { fn(); n++; console.log('ok', label); };

t('CV', () => { const r = c('CV Alberta 2026.pdf'); assert.equal(r.cat, 'cv'); assert.equal(r.folder, '02 Dokumen Pribadi/CV & Surat'); });
t('ijazah', () => assert.equal(c('Ijazah S1 UI.pdf').cat, 'ijazah'));
t('transkrip nilai = ijazah', () => { const r = c('Transkrip Nilai ANU.pdf'); assert.equal(r.cat, 'ijazah'); assert.equal(r.folder, '02 Dokumen Pribadi/Ijazah & Transkrip'); });
t('academic transcript = ijazah', () => assert.equal(c('academic transcript.pdf').cat, 'ijazah'));
t('transkrip wawancara + proyek', () => { const r = c('Transkrip wawancara Tumenggung Makekal.docx'); assert.equal(r.cat, 'transkrip'); assert.equal(r.project, 'Orang Rimba'); assert.equal(r.folder, '03 Data Lapangan/Orang Rimba/Transkrip'); });
t('interview transcript Kodi', () => { const r = c('interview transcript Kodi.docx'); assert.equal(r.cat, 'transkrip'); assert.equal(r.project, 'Sumba'); });
t('catatan lapangan Sodan', () => { const r = c('Catatan lapangan Sodan Mei 2025.docx'); assert.equal(r.cat, 'catatan'); assert.equal(r.project, 'Sumba'); assert.equal(r.sub, 'Catatan Lapangan'); });
t('rekaman audio Semarang', () => { const r = c('rekaman FGD ibu-ibu Semarang.m4a', { mime: 'audio/mp4' }); assert.equal(r.cat, 'rekaman'); assert.equal(r.project, 'Semarang'); });
t('foto tanpa proyek', () => { const r = c('IMG_2043.jpg', { mime: 'image/jpeg' }); assert.equal(r.cat, 'foto'); assert.equal(r.project, 'Belum ditentukan'); assert.equal(r.folder, '03 Data Lapangan/Belum ditentukan/Foto & Video'); });
t('video', () => assert.equal(c('DJI_0012.MP4').cat, 'foto'));
t('ijazah hasil foto', () => assert.equal(c('ijazah.jpg', { mime: 'image/jpeg' }).cat, 'ijazah'));
t('proposal', () => assert.equal(c('Proposal PhD Bukit Duabelas v3.docx').cat, 'proposal'));
t('rekomendasi', () => assert.equal(c('Surat rekomendasi Prof Sari.pdf').cat, 'rekomendasi'));
t('esai = tulisan', () => { const r = c('Esai dekolonisasi sampah.docx'); assert.equal(r.cat, 'tulisan'); assert.equal(r.folder, '05 Tulisan Sendiri'); });
t('paper + topik', () => {
  const text = 'Abstract. This article develops ontological pluriverse thinking, relational ontologies and multinatural cosmologies. Keywords: ontology. DOI 10.1111/amet.12345. Journal of Cambridge Anthropology. References';
  const r = c('Tsing 2015 mushroom.pdf', { text, pages: 14 }); assert.equal(r.cat, 'bacaan'); assert.equal(r.topic, 'Ontologi & pluriverse'); assert.equal(r.folder, '04 Bacaan/Ontologi & pluriverse');
});
t('isi catatan harian', () => {
  const text = '12 Maret 2025\nHari ini kami tiba di rombong. Observasi pagi di sungai.\n13 Maret 2025\nTadi pagi ikut berburu.\n14 Maret 2025\nRefleksi hari ini.';
  const r = c('Dokumen baru.docx', { text }); assert.equal(r.cat, 'catatan');
});
t('isi giliran bicara', () => {
  const text = 'P: Sudah berapa lama tinggal di sini?\nN: Dari kecil.\nP: Kenapa pindah?\nN: Hutan makin habis.\nP: Lalu?\nN: Ya begitu.';
  const r = c('interview1.txt', { text }); assert.equal(r.cat, 'transkrip');
});
t('tak jelas', () => { const r = c('random.xyz'); assert.equal(r.cat, 'lainnya'); assert.equal(r.folder, '02 Dokumen Pribadi/Lainnya'); });
t('proyek dari teks', () => { const r = c('catatan lapangan.docx', { text: 'Di Waikabubak hari ini...' }); assert.equal(r.project, 'Sumba'); });
t('catFromPath', () => {
  assert.deepEqual(catFromPath('03 Data Lapangan/Sumba/Rekaman/a.m4a'), { cat: 'rekaman', project: 'Sumba', topic: '' });
  assert.equal(catFromPath('04 Bacaan/Pendidikan/x.pdf').topic, 'Pendidikan');
  assert.equal(catFromPath('00 Kotak Masuk/x.pdf'), null);
});
t('mediaKind', () => assert.equal(mediaKind('a.opus'), 'audio'));
console.log(n, 'tes lulus');
