// Jalankan: node tests/analyze.test.mjs
import assert from 'node:assert/strict';
import { analyse, findDates, toMarkdown } from '../js/analyze.js';

const today = '2026-11-15';
const keywords = ['masyarakat adat', 'indigenous', 'anthropology', 'soundscape', 'gender', 'indonesia'];
const ctx = extra => ({ today, keywords, custom: [], places: ['Australia', 'Belanda', 'Indonesia'], ...extra });
let n = 0;
const t = (name, fn) => { fn(); n++; console.log('ok', name); };

t('tanggal Inggris dan Indonesia', () => {
  assert.equal(findDates('closes 15 January 2027')[0].iso, '2027-01-15');
  assert.equal(findDates('batas akhir 20 Januari 2027')[0].iso, '2027-01-20');
  assert.equal(findDates('ditutup 3 Agustus 2027')[0].iso, '2027-08-03');
  assert.equal(findDates('paling lambat 1 Desember 2026')[0].iso, '2026-12-01');
  assert.equal(findDates('Deadline: March 5, 2027')[0].iso, '2027-03-05');
  assert.equal(findDates('tenggat 12 Okt 2027')[0].iso, '2027-10-12');
});

t('PhD antropologi didanai penuh, terbuka internasional → top', () => {
  const a = analyse({ id: 'r1', type: 'phd', title: 'Fully funded PhD in Anthropology: Indigenous futures and listening in Southeast Asia',
    summary: 'The studentship covers tuition fees and a tax-free stipend for living costs. International applicants are welcome to apply. Applicants should hold a master\'s degree in anthropology or a related field. Closing date: 15 January 2027.' }, ctx());
  assert.equal(a.verdict, 'top', JSON.stringify({ p: a.priority, b: a.blockers }));
  assert.equal(a.deadline, '2027-01-15');
  assert.equal(a.applicant, 'individu');
  assert.ok(a.themes.includes('adat') && a.themes.includes('bunyi'));
  assert.match(a.whyRelevant, /^Nyambung dengan: /);
  assert.match(a.summary, /cek lagi di laman aslinya/i);
});

t('"domestic students only" → skip', () => {
  const a = analyse({ id: 'r2', type: 'phd', title: 'PhD scholarship in Indigenous anthropology',
    summary: 'This scholarship is available to domestic students only. Fully funded stipend. Deadline 1 March 2027.' }, ctx());
  assert.equal(a.verdict, 'skip');
  const b = a.blockers.find(x => x.id === 'citizenship');
  assert.ok(b && /domestic students only/i.test(b.quote));
});

t('postdoc yang butuh PhD → skip', () => {
  const a = analyse({ id: 'r3', type: 'fellowship', title: 'Postdoctoral Research Fellow in Anthropology of Indigenous Education',
    summary: 'Applicants must have completed a PhD in anthropology within five years. Closing date 10 February 2027.' }, ctx());
  assert.equal(a.verdict, 'skip');
  assert.ok(a.blockers.some(b => b.sev === 'high'));
});

t('hibah Indonesia untuk komunitas/lembaga tentang masyarakat adat → good/top, pengaju lembaga', () => {
  const a = analyse({ id: 'r4', type: 'grant', title: 'Hibah Penguatan Komunitas Masyarakat Adat 2027',
    summary: 'Hibah ini terbuka bagi lembaga swadaya masyarakat dan komunitas yang bekerja bersama masyarakat adat di Indonesia. Dana hingga Rp 150.000.000 per lembaga. Batas akhir pendaftaran 20 Januari 2027.' }, ctx());
  assert.ok(['good', 'top'].includes(a.verdict), JSON.stringify({ p: a.priority, v: a.verdict, b: a.blockers, pos: a.positives }));
  assert.equal(a.applicant, 'lembaga');
  assert.ok(a.amount.includes('150'));
  assert.equal(a.deadline, '2027-01-20');
});

t('tenggat sudah lewat → skip', () => {
  const a = analyse({ id: 'r5', type: 'grant', title: 'Grant for ethnography of sound', summary: 'Open to all nationalities. Deadline: 1 October 2026.' }, ctx());
  assert.equal(a.verdict, 'skip');
  assert.equal(a.blockers[0].id, 'closed');
});

t('lowongan admin tanpa relevansi → low', () => {
  const a = analyse({ id: 'r6', title: 'Finance Administrator', summary: 'We are looking for a finance administrator to manage invoices and payroll in our office.' }, ctx());
  assert.equal(a.verdict, 'low', String(a.priority));
});

t('kata kunci pribadinya menaikkan skor', () => {
  const o = { id: 'r7', type: 'grant', title: 'Small research grant', summary: 'Supports community research on Mentawai storytelling and riverine life.' };
  const base = analyse(o, ctx());
  const mine = analyse(o, ctx({ custom: ['Mentawai'] }));
  assert.ok(mine.priority > base.priority, `${mine.priority} > ${base.priority}`);
  assert.ok(mine.userHits.includes('mentawai'));
  assert.match(mine.whyRelevant, /mentawai/);
});

t('afiliasi kampus (NIDN) → skip dengan label jelas', () => {
  const a = analyse({ id: 'r8', type: 'grant', title: 'Hibah Penelitian Antropologi', summary: 'Ketua peneliti wajib dosen tetap dengan NIDN. Batas akhir 10 Februari 2027.' }, ctx());
  assert.equal(a.verdict, 'skip');
  assert.match(a.blockers.find(b => b.id === 'campus').text, /bisa lewat mitra universitas/);
});

t('tanpa substring palsu: "sound knowledge" bukan tema bunyi', () => {
  const a = analyse({ id: 'r9', title: 'Data officer', summary: 'Requires sound knowledge of spreadsheets.' }, ctx());
  assert.ok(!a.themes.includes('bunyi'));
});

t('markdown dalam bahasa Indonesia', () => {
  const a = analyse({ id: 'r10', type: 'phd', title: 'PhD in anthropology', link: 'https://example.org', summary: 'Funded. International applicants are welcome.' }, ctx());
  const md = toMarkdown(a);
  assert.match(md, /## Fakta penting/); assert.match(md, /cek lagi di laman aslinya/i);
});

console.log(`\n${n} tes lulus`);
