// Ruang baca: cari makalah (OpenAlex), ringkasan lokal, glosarium antropologi, perpustakaan, daftar jurnal, baca PDF.
import * as U from './util.js';
import { S, save, esc, $, $$, toast, today, addXP, copyText, modal, fmtDate, download } from './util.js';

const OA = 'https://api.openalex.org';
const PDFJS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/';
const SELECT = 'id,doi,title,display_name,publication_year,cited_by_count,abstract_inverted_index,open_access,best_oa_location,primary_location,authorships,type,keywords';

/* ---------------- OpenAlex ---------------- */
const stripTags = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

/** OpenAlex ships abstracts as {word: [positions]}. Rebuild the running text. */
export function decodeAbstract(inv) {
  if (!inv || typeof inv !== 'object') return '';
  const out = [];
  for (const [w, pos] of Object.entries(inv)) if (Array.isArray(pos)) for (const p of pos) out[p] = w;
  return out.filter(x => x !== undefined).join(' ').replace(/\s+([.,;:!?)])/g, '$1').replace(/\s+/g, ' ').trim();
}

export function toPaper(w) {
  const id = String(w.id || '').split('/').pop();
  const best = w.best_oa_location || {};
  const prim = w.primary_location || {};
  return {
    key: 'oa:' + id, source: 'OpenAlex', id,
    doi: String(w.doi || '').replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') || null,
    title: stripTags(w.display_name || w.title || '').replace(/\.$/, ''),
    authors: (w.authorships || []).map(a => a.author?.display_name).filter(Boolean),
    journal: prim.source?.display_name || best.source?.display_name || '',
    year: w.publication_year || '',
    abstract: decodeAbstract(w.abstract_inverted_index),
    oa: !!w.open_access?.is_oa,
    oaUrl: w.open_access?.oa_url || best.pdf_url || best.landing_page_url || '',
    cited: w.cited_by_count || 0,
    type: w.type || '',
    keywords: (w.keywords || []).map(k => k.display_name || k.keyword).filter(Boolean),
  };
}

const cache = new Map();
async function oaFetch(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('OpenAlex ' + r.status);
  return r.json();
}
async function oaSearch(query, { perPage = 20, page = 1, sort = 'relevance_score:desc', oaOnly = false, from = '', hasAbstract = true } = {}) {
  const f = [];
  if (hasAbstract) f.push('has_abstract:true');
  if (oaOnly) f.push('open_access.is_oa:true');
  if (from) f.push(`publication_year:${from}-${new Date().getFullYear()}`);
  const u = `${OA}/works?search=${encodeURIComponent(query)}&per-page=${perPage}&page=${page}` +
    (f.length ? `&filter=${f.join(',')}` : '') + `&sort=${sort}&select=${SELECT}`;
  const j = await oaFetch(u);
  const list = (j.results || []).map(toPaper);
  list.forEach(p => cache.set(p.key, p));
  return { list, total: j.meta?.count || list.length };
}
async function getPaper(key) {
  const saved = S().papers.find(p => p.key === key);
  if (saved && saved.abstract) return saved;
  if (cache.has(key)) return cache.get(key);
  if (key.startsWith('oa:')) {
    const j = await oaFetch(`${OA}/works/${encodeURIComponent(key.slice(3))}?select=${SELECT}`);
    const p = toPaper(j); cache.set(p.key, p); return p;
  }
  return saved || null;
}

/* ---------------- shared helpers ---------------- */
const authorsArr = a => Array.isArray(a) ? a : String(a || '').split(/,\s*|;\s*/).map(s => s.trim()).filter(Boolean);
const shortAuthors = a => { const l = authorsArr(a); return l.length > 3 ? l.slice(0, 3).join(', ') + ' dkk.' : l.join(', '); };
const kw = () => { try { return typeof U.allKeywords === 'function' ? U.allKeywords() : [...(S().profile.keywords || []), ...((S().customKeywords || []).map(k => k.w))].map(x => String(x).toLowerCase()).filter((x, i, a) => a.indexOf(x) === i); } catch (_) { return []; } };
const STATUS = { 'to-read': 'Belum dibaca', reading: 'Sedang dibaca', done: 'Sudah dibaca' };
const typeLabel = t => ({ article: 'Artikel', review: 'Ulasan', book: 'Buku', 'book-chapter': 'Bab buku', dissertation: 'Disertasi', preprint: 'Pracetak' }[t] || '');

function apaAuthor(n) {
  const parts = n.replace(/\s+/g, ' ').trim().split(' ');
  if (parts.length < 2) return n;
  const last = parts.pop();
  return `${last}, ${parts.map(x => x[0] ? x[0].toUpperCase() + '.' : '').join(' ')}`;
}
export function apaCitation(p) {
  const a = authorsArr(p.authors).map(apaAuthor);
  let au = '';
  if (a.length === 1) au = a[0];
  else if (a.length === 2) au = `${a[0]}, & ${a[1]}`;
  else if (a.length > 2 && a.length <= 20) au = a.slice(0, -1).join(', ') + ', & ' + a[a.length - 1];
  else if (a.length > 20) au = a.slice(0, 19).join(', ') + ', ... ' + a[a.length - 1];
  const t = (p.title || '').replace(/[.?!]$/, m => m);
  const end = /[.?!]$/.test(t) ? '' : '.';
  return `${au ? au + ' ' : ''}(${p.year || 't.t.'}). ${t}${end}${p.journal ? ' ' + p.journal + '.' : ''}${p.doi ? ' https://doi.org/' + p.doi : ''}`.replace(/\.\./g, '.');
}

/* ---------------- digest engine (lokal, tanpa AI) ---------------- */
const STOP = new Set(('a an the and or of to in on for with by from at as is are was were be been being this that these those it its we our their they which who whom whose what when where how than then there here also into onto over under between among within without via per not no nor can could may might must should would will shall do does did done using used use both each such more most less least very however therefore thus while whereas although though because since after before during about above below up down out further only own same so too just paper article study essay chapter ' +
  'yang dan di ke dari untuk pada dengan dalam adalah ini itu atau juga oleh akan telah sudah belum tidak bukan saja sebagai karena sehingga serta para suatu sebuah seorang lebih sangat dapat bisa harus perlu antara terhadap tentang melalui hingga sampai setelah sebelum saat ketika dimana mana siapa apa bagaimana namun tetapi tapi atau maupun bahwa jika apabila agar supaya yaitu yakni yaitu mereka kami kita kamu anda saya dia ia nya pun lah kah dalam secara oleh bagi masih sedang ada tersebut dll dsb hal artikel penelitian studi makalah bab').split(' '));
const ABBR = /\b(e\.g|i\.e|et al|vs|cf|ca|approx|Dr|Prof|Mr|Mrs|Ms|St|No|Vol|pp|ed|eds|hlm|dll|dsb|dst|yg|dkk|mis|spt|tsb|Bpk|Ir|Drs|Hj|Jl|Tn|Ny)\./gi;
export function sentences(text) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  t = t.replace(ABBR, m => m.slice(0, -1) + '\u0001');
  t = t.replace(/\b(\p{Lu})\.(?=\s?\p{Lu})/gu, '$1\u0001');
  return t.split(/(?<=[.!?]["')\]”’]?)\s+(?=[\p{Lu}\p{N}"'(\[“‘])/u).map(s => s.replace(/\u0001/g, '.').trim()).filter(s => s.length > 25);
}
const WORD = /\p{L}[\p{L}'’-]{2,}/gu;
const CUES = /\b(we (find|found|show|argue|demonstrate|report|suggest|propose)|(this )?(article|paper|essay|chapter|study) (argues|shows|examines|explores|analy[sz]es|demonstrates|suggests|proposes)|results? (show|indicate|suggest)|in conclusion|conclude|in summary|overall|i argue|kami (menemukan|menunjukkan|berargumen|mengusulkan)|(artikel|tulisan|makalah|studi|penelitian|bab) ini (berargumen|menunjukkan|mengkaji|menganalisis|membahas|mengeksplorasi|menelaah)|hasil(nya)? (menunjukkan|memperlihatkan)|temuan|kesimpulan(nya)?|simpulan|disimpulkan|berargumen)\b/i;
export function summarise(text, n = 3) {
  const sents = sentences(text); if (sents.length <= n) return sents;
  const freq = {};
  for (const w of String(text).toLowerCase().match(WORD) || []) if (!STOP.has(w)) freq[w] = (freq[w] || 0) + 1;
  const max = Math.max(...Object.values(freq), 1);
  const scored = sents.map((s, i) => {
    const words = s.toLowerCase().match(WORD) || [];
    let sc = words.reduce((a, w) => a + (STOP.has(w) ? 0 : (freq[w] || 0) / max), 0) / Math.sqrt(words.length + 1);
    if (CUES.test(s)) sc *= 1.5;
    if (words.length > 55) sc *= 0.8;
    if (i === 0) sc *= 1.2;
    if (i === sents.length - 1) sc *= 1.25;
    return { s, i, sc };
  });
  return scored.sort((a, b) => b.sc - a.sc).slice(0, n).sort((a, b) => a.i - b.i).map(x => x.s);
}
export function looksIndonesian(text) {
  const w = String(text || '').toLowerCase().match(/\p{L}+/gu) || [];
  const id = new Set(['yang', 'dan', 'di', 'dengan', 'untuk', 'dari', 'pada', 'adalah', 'ini', 'itu', 'dalam', 'tidak', 'juga', 'oleh', 'atau', 'akan', 'karena', 'sebagai']);
  const en = new Set(['the', 'of', 'and', 'to', 'in', 'is', 'that', 'for', 'with', 'as', 'by', 'was', 'are']);
  let a = 0, b = 0; for (const x of w) { if (id.has(x)) a++; else if (en.has(x)) b++; }
  return a > b;
}

function structuredAbstract(abs) {
  const t = stripTags(abs);
  const m = t.split(/\b(BACKGROUND|INTRODUCTION|OBJECTIVES?|AIMS?|PURPOSE|METHODS?|METHODOLOGY|RESULTS?|FINDINGS|CONCLUSIONS?|SIGNIFICANCE|LATAR BELAKANG|TUJUAN|METODE|HASIL|KESIMPULAN|SIMPULAN)\s*[:.]\s*/);
  if (m.length > 2) { const out = []; for (let i = 1; i < m.length; i += 2) out.push({ h: cap(m[i]), t: (m[i + 1] || '').trim() }); return out; }
  return [{ h: '', t }];
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/* ---------------- glosarium antropologi (tap untuk penjelasan) ---------------- */
// [pola regex (spasi = spasi/tanda hubung), istilah tampilan, definisi satu kalimat]
const GLOSS = [
  ['thick description|deskripsi tebal', 'Thick description (Geertz)', 'Deskripsi yang menafsirkan lapisan makna di balik sebuah tindakan, bukan sekadar mencatat perilakunya.'],
  ['emic|emik', 'Emik', 'Sudut pandang orang dalam: cara masyarakat sendiri memahami dan menamai dunianya.'],
  ['etic|etik', 'Etik', 'Sudut pandang peneliti dari luar, memakai kategori analitis yang tidak selalu dipakai masyarakatnya.'],
  ['positionality|posisionalitas', 'Posisionalitas', 'Kesadaran peneliti tentang posisi sosialnya (gender, kelas, asal, relasi kuasa) dan bagaimana itu membentuk riset.'],
  ['reflexivity|reflexive|refleksivitas|refleksif', 'Refleksivitas', 'Kebiasaan peneliti menimbang peran dirinya sendiri dalam proses dan hasil penelitian.'],
  ['habitus', 'Habitus (Bourdieu)', 'Pola kebiasaan, selera, dan cara bertindak yang tertanam dalam tubuh lewat pengalaman sosial.'],
  ['hegemony|hegemoni|hegemonic|hegemonik', 'Hegemoni (Gramsci)', 'Dominasi yang bekerja lewat persetujuan dan akal sehat, bukan hanya paksaan.'],
  ['subaltern', 'Subaltern', 'Kelompok yang dipinggirkan dari struktur kuasa sehingga suaranya sulit didengar (Gramsci, Spivak).'],
  ['coloniality|kolonialitas', 'Kolonialitas (Quijano)', 'Pola kuasa, pengetahuan, dan hierarki ras yang bertahan setelah kolonialisme formal berakhir.'],
  ['decolonial|decoloni[sz]ation|dekolonial|dekolonisasi', 'Dekolonisasi', 'Upaya membongkar warisan kolonial dalam kuasa, pengetahuan, dan cara kita meneliti.'],
  ['ontology|ontologies|ontologi|ontologis|ontological', 'Ontologi', 'Pertanyaan tentang apa yang ada dan seperti apa dunia itu; dalam antropologi, cara berbagai masyarakat mengalami "yang nyata" secara berbeda.'],
  ['ontological turn|giliran ontologis', 'Ontological turn', 'Arus antropologi yang menganggap perbedaan budaya sebagai perbedaan dunia, bukan sekadar perbedaan pandangan atas satu dunia.'],
  ['perspectivism|perspektivisme', 'Perspektivisme (Viveiros de Castro)', 'Gagasan Amerindian bahwa setiap makhluk melihat dirinya sebagai manusia dan makhluk lain dari sudut tubuhnya masing-masing.'],
  ['pluriverse|pluriversal|pluriversum', 'Pluriverse', 'Dunia yang memuat banyak dunia sekaligus ("a world where many worlds fit"), lawan dari satu universalisme.'],
  ['acoustemology|akustemologi', 'Akustemologi (Feld)', 'Mengetahui dan menjalani dunia lewat bunyi.'],
  ['soundscape|lanskap bunyi|bentang bunyi', 'Soundscape', 'Keseluruhan bunyi di sebuah tempat sebagaimana didengar dan dihayati orang yang tinggal di sana.'],
  ['multispecies|multispesies', 'Multispesies', 'Pendekatan yang melihat kehidupan sosial sebagai jalinan manusia dengan hewan, tumbuhan, jamur, dan makhluk lain.'],
  ['more-than-human|lebih-dari-manusia|lebih dari manusia', 'Lebih-dari-manusia', 'Dunia yang dibentuk bersama oleh manusia dan non-manusia, tidak berpusat pada manusia.'],
  ['anthropocene|antroposen', 'Antroposen', 'Usulan nama zaman geologi ketika aktivitas manusia menjadi kekuatan yang mengubah planet.'],
  ['plantationocene|plantationosen', 'Plantationocene', 'Cara membaca krisis planet dari sejarah perkebunan: tanaman seragam, tenaga kerja paksa, dan penyederhanaan ekologi.'],
  ['capitalocene|kapitalosen', 'Capitalocene', 'Usulan bahwa penyebab krisis ekologis adalah kapitalisme, bukan "manusia" secara umum.'],
  ['friction|friksi', 'Friksi (Tsing)', 'Pertemuan tak mulus antara pihak berbeda yang justru menghasilkan gerak, kuasa, dan perubahan.'],
  ['articulation|artikulasi', 'Artikulasi', 'Cara unsur-unsur yang berbeda dirangkai menjadi satu formasi sosial atau identitas (Hall, Li).'],
  ['tribal slot|slot tribal', 'Tribal slot (Li)', 'Posisi yang sudah disiapkan negara dan publik bagi "masyarakat adat" yang dianggap autentik; yang tidak cocok sering tersisih.'],
  ['FPIC|free,? prior,? and informed consent|PADIATAPA|persetujuan.{0,30}tanpa paksaan', 'FPIC', 'Hak komunitas memberi atau menolak persetujuan atas proyek di wilayahnya, secara bebas, sebelum proyek dimulai, dan dengan informasi lengkap.'],
  ['refusal|penolakan etnografis', 'Refusal', 'Sikap menolak memberi atau menampilkan sesuatu kepada peneliti atau negara sebagai bentuk kedaulatan (Simpson).'],
  ['intersectionality|interseksionalitas', 'Interseksionalitas (Crenshaw)', 'Cara berbagai penanda (gender, ras, kelas, dsb.) bersilangan dan menciptakan pengalaman ketidakadilan yang khas.'],
  ['liminality|liminal|liminalitas', 'Liminalitas', 'Keadaan "di ambang" ketika seseorang telah lepas dari status lama tetapi belum menempati yang baru (van Gennep, Turner).'],
  ['kinship|kekerabatan', 'Kekerabatan', 'Cara masyarakat mengatur hubungan keluarga, keturunan, dan keterikatan, termasuk yang tidak berdasar darah.'],
  ['reciprocity|resiprositas|timbal balik', 'Resiprositas', 'Pertukaran yang saling mengikat, bukan jual-beli semata.'],
  ['gift exchange|the gift|pertukaran hadiah|teori pemberian', 'Pertukaran hadiah (Mauss)', 'Pemberian menciptakan kewajiban untuk menerima dan membalas, sehingga mengikat hubungan sosial.'],
  ['agency|agensi', 'Agensi', 'Kemampuan seseorang atau kelompok bertindak dan memengaruhi keadaannya, di dalam batas struktur.'],
  ['governmentality|governmentalitas', 'Governmentalitas (Foucault)', 'Cara negara dan lembaga mengatur perilaku orang lewat pengetahuan, statistik, dan program, bukan hanya larangan.'],
  ['biopolitics|biopolitik', 'Biopolitik', 'Kuasa yang mengatur kehidupan penduduk: kesehatan, kelahiran, kependudukan.'],
  ['participant observation|observasi partisipan|pengamatan terlibat', 'Observasi partisipan', 'Metode inti etnografi: ikut hidup dalam keseharian masyarakat sambil mengamati dan mencatat.'],
  ['fieldwork|kerja lapangan', 'Kerja lapangan', 'Tinggal dan meneliti langsung bersama masyarakat dalam waktu lama.'],
  ['ethnography|etnografi', 'Etnografi', 'Penelitian dan tulisan tentang kehidupan suatu masyarakat berdasarkan keterlibatan jangka panjang.'],
  ['multi[\\s-]?sited', 'Multi-sited', 'Etnografi yang mengikuti orang, benda, atau gagasan melintasi banyak tempat, bukan satu lokasi.'],
  ['autoethnography|autoetnografi', 'Autoetnografi', 'Menulis pengalaman pribadi peneliti sebagai jalan memahami konteks budaya yang lebih luas.'],
  ['collaborative ethnography|etnografi kolaboratif', 'Etnografi kolaboratif', 'Riset yang dirancang dan ditulis bersama komunitas, bukan hanya tentang mereka.'],
  ['participatory action research|penelitian aksi partisipatif', 'PAR', 'Riset yang melibatkan komunitas sebagai pencipta pengetahuan sekaligus penggerak perubahan.'],
  ['sensory ethnography|etnografi indrawi', 'Etnografi indrawi', 'Etnografi yang memperhatikan pengalaman indra (bunyi, bau, rasa, sentuhan) sebagai jalan pengetahuan.'],
  ['visual anthropology|antropologi visual', 'Antropologi visual', 'Kajian dan praktik antropologi lewat gambar, film, dan fotografi.'],
  ['indigeneity|keadatan', 'Indigeneity', 'Identitas dan klaim sebagai masyarakat adat atau asli, yang dibentuk bersama oleh sejarah, politik, dan pengakuan.'],
  ['masyarakat adat|indigenous peoples?|indigenous communit(y|ies)', 'Masyarakat adat', 'Komunitas dengan asal-usul leluhur, wilayah, dan tatanan sosial-budaya yang diwariskan, yang menuntut pengakuan haknya.'],
  ['adat', 'Adat', 'Tatanan kebiasaan, hukum, dan etika yang hidup di suatu masyarakat dan dijaga turun-temurun.'],
  ['tanah ulayat|hutan adat|customary land|customary forest', 'Tanah/hutan adat', 'Wilayah yang dikuasai dan diatur menurut hukum adat suatu komunitas.'],
  ['land grabbing|perampasan tanah', 'Perampasan tanah', 'Pengambilalihan tanah dari penghuni atau pengguna lamanya, sering oleh investasi besar atau negara.'],
  ['extractivism|ekstraktivisme', 'Ekstraktivisme', 'Model ekonomi yang bertumpu pada pengerukan sumber daya alam untuk dijual ke luar.'],
  ['dispossession|dispossessed|perampasan hak', 'Dispossession', 'Proses ketika orang atau komunitas kehilangan tanah, sumber hidup, atau haknya.'],
  ['settler colonialism|kolonialisme pemukim', 'Kolonialisme pemukim', 'Kolonialisme yang bertujuan menetap dan menggantikan penduduk asli, sebuah struktur yang berlanjut, bukan peristiwa tunggal.'],
  ['epistemic violence|kekerasan epistemik', 'Kekerasan epistemik', 'Merendahkan atau membungkam cara mengetahui suatu kelompok demi pengetahuan yang dominan.'],
  ['epistemology|epistemologi|epistemic|epistemik', 'Epistemologi', 'Cara kita tahu apa yang kita tahu: apa yang dihitung sebagai pengetahuan dan siapa yang berhak mengatakannya.'],
  ['situated knowledge|situated knowledges|pengetahuan situasional', 'Pengetahuan situasional (Haraway)', 'Semua pengetahuan lahir dari posisi tertentu; objektivitas berarti jujur tentang posisi itu.'],
  ['animism|animisme', 'Animisme', 'Pandangan bahwa banyak makhluk dan benda memiliki jiwa atau agensi; kini dibaca sebagai bentuk relasi, bukan "kepercayaan primitif".'],
  ['cosmology|kosmologi|cosmovision|kosmovisi', 'Kosmologi', 'Pemahaman suatu masyarakat tentang susunan dunia dan tempat manusia di dalamnya.'],
  ['ritual|ritus', 'Ritual', 'Tindakan terstruktur dan berulang yang menyimpan makna sosial atau religius.'],
  ['modernity|modernitas', 'Modernitas', 'Gugus gagasan dan institusi tentang kemajuan, rasio, dan negara-bangsa yang kerap dianggap universal.'],
  ['neoliberalism|neoliberal(isme)?', 'Neoliberalisme', 'Pola pikir dan kebijakan yang menempatkan pasar dan tanggung jawab individu sebagai pengatur utama kehidupan.'],
  ['cultural relativism|relativisme budaya', 'Relativisme budaya', 'Prinsip memahami budaya menurut ukurannya sendiri, bukan ukuran budaya peneliti.'],
  ['ethnocentrism|etnosentrisme', 'Etnosentrisme', 'Menilai budaya lain dengan ukuran budaya sendiri sebagai yang paling benar.'],
  ['orientalism|orientalisme', 'Orientalisme (Said)', 'Cara Barat membayangkan "Timur" sebagai yang eksotis dan terbelakang, sehingga membenarkan dominasi.'],
  ['othering|peliyanan', 'Othering', 'Proses menjadikan sekelompok orang sebagai "yang lain" yang berbeda dan lebih rendah dari "kita".'],
  ['performativity|performativitas', 'Performativitas (Butler)', 'Identitas, termasuk gender, dibentuk lewat tindakan yang diulang terus-menerus, bukan sifat bawaan.'],
  ['heteronormativity|heteronormativitas', 'Heteronormativitas', 'Anggapan bahwa heteroseksual adalah norma tunggal dan bentuk lain menyimpang.'],
  ['queer', 'Queer', 'Istilah payung dan sikap kritis terhadap norma gender dan seksualitas yang dianggap baku.'],
  ['embodiment|ketubuhan', 'Ketubuhan', 'Gagasan bahwa pengalaman dan budaya dijalani dan diketahui lewat tubuh.'],
  ['relationality|relasionalitas', 'Relasionalitas', 'Pandangan bahwa makhluk dan hal-hal ada karena dan di dalam hubungannya satu sama lain.'],
  ['data sovereignty|kedaulatan data', 'Kedaulatan data', 'Hak komunitas mengendalikan siapa mengumpulkan, menyimpan, dan memakai data tentang mereka.'],
  ['ethics of care|etika kepedulian', 'Etika kepedulian', 'Etika yang berangkat dari relasi saling bergantung dan tanggung jawab merawat, bukan aturan abstrak.'],
  ['swidden|ladang berpindah', 'Ladang berpindah', 'Sistem berladang yang membuka lahan sementara lalu membiarkannya pulih, sering salah dibaca sebagai perusak hutan.'],
  ['subsistence|subsisten|subsistensi', 'Subsistensi', 'Penghidupan yang terutama memenuhi kebutuhan sendiri, bukan untuk dijual.'],
  ['posthumanism|posthuman|pascahumanisme', 'Pascahumanisme', 'Arus pemikiran yang menggeser manusia dari pusat dan menekankan jalinan dengan teknologi dan makhluk lain.'],
  ['deep listening|regenerative listening|mendengar mendalam', 'Mendengar mendalam', 'Praktik mendengar penuh perhatian pada manusia dan lingkungan sebagai cara belajar dan merawat relasi.'],
];
const GL = GLOSS.map(([pat, term, def]) => ({ pat, term, def }));
const GLOSS_RE = new RegExp('(?<![\\p{L}\\p{N}])(?:' + GL.map(g => '(' + g.pat.replace(/ /g, '[\\s-]+').replace(/\((?!\?)/g, '(?:') + ')(?:s|es)?').join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
function annotate(text, found) {
  return esc(text).replace(GLOSS_RE, (m, ...g) => {
    const i = g.findIndex((x, k) => k < GL.length && x !== undefined);
    if (i < 0) return m;
    if (found) found.set(GL[i].term, GL[i].def);
    return `<mark class="term" tabindex="0" data-t="${esc(GL[i].term)}" data-d="${esc(GL[i].def)}" title="${esc(GL[i].def)}">${m}</mark>`;
  });
}
let tipBound = false;
function bindGlossTip() {
  if (tipBound) return; tipBound = true;
  const show = mk => {
    let tip = document.getElementById('glossTip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'glossTip'; tip.className = 'gloss-tip'; tip.setAttribute('role', 'status'); document.body.appendChild(tip); }
    tip.innerHTML = `<b>${esc(mk.dataset.t)}</b><span>${esc(mk.dataset.d)}</span><button class="gloss-x" aria-label="Tutup">×</button>`;
    tip.classList.add('on');
  };
  document.addEventListener('click', e => {
    const mk = e.target.closest('mark.term'); const tip = document.getElementById('glossTip');
    if (mk) { show(mk); return; }
    if (tip && (e.target.closest('.gloss-x') || !e.target.closest('#glossTip'))) tip.classList.remove('on');
  });
  document.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('mark.term')) { e.preventDefault(); show(e.target); } else if (e.key === 'Escape') document.getElementById('glossTip')?.classList.remove('on'); });
}

/* ---------------- topik & bacaan hari ini ---------------- */
const TOPICS = [
  ['masyarakat adat', '"masyarakat adat" OR "indigenous peoples" Indonesia'],
  ['dekolonisasi', 'decolonial OR decolonization anthropology'],
  ['pluriverse', 'pluriverse OR "ontological politics"'],
  ['gender', 'gender anthropology Southeast Asia'],
  ['pendidikan adat', '"indigenous education" OR "pendidikan adat"'],
  ['soundscape', 'soundscape OR acoustemology OR "listening" ethnography'],
  ['multispesies', 'multispecies ethnography'],
  ['Orang Rimba', '"Orang Rimba" OR "Orang Rimba" Jambi'],
  ['Sumba', 'Sumba'],
  ['etnografi multimodal', '"multimodal anthropology" OR "visual ethnography" OR "sensory ethnography"'],
];
const dayNum = () => Math.floor(new Date(today()).getTime() / 864e5);
async function pickPaper(offset = 0) {
  const pool = [...TOPICS.map(t => t[1])];
  const ri = (S().profile.readingInterests || '').trim(); if (ri) pool.push(ri);
  kw().slice(0, 40).forEach(k => pool.push(k));
  const d = dayNum() + offset;
  const q = pool[d % pool.length];
  const from = new Date().getFullYear() - 8;
  let { list } = await oaSearch(q, { perPage: 25, oaOnly: true, from });
  if (!list.length) ({ list } = await oaSearch(q, { perPage: 25, from }));
  if (!list.length) return null;
  const withAbs = list.filter(p => p.abstract.length > 200);
  const arr = withAbs.length ? withAbs : list;
  const p = arr[(d * 7) % arr.length];
  return { ...p, topic: q };
}
export async function paperOfDay() {
  if (S().pod?.date === today() && S().pod.paper) return S().pod.paper;
  try {
    const p = await pickPaper(0); if (!p) return null;
    S().pod = { date: today(), paper: p }; save(); return p;
  } catch (e) { return null; }
}

/* ---------------- halaman ---------------- */
const TABS = [['', 'Cari'], ['hari-ini', 'Bacaan hari ini'], ['library', 'Perpustakaanku'], ['jurnal', 'Jurnal'], ['pdf', 'PDF']];
let last = null; // hasil pencarian terakhir, supaya kembali dari halaman makalah tidak mengulang
export function renderRead(el, sub = []) {
  bindGlossTip();
  if (sub[0] === 'paper') return reader(el, decodeKey(sub.slice(1).join('/')));
  const tab = sub[0] || '';
  el.innerHTML = `<div class="eyebrow">Ruang baca</div><h1>Baca jurnal, pelan-pelan saja</h1>
  <p class="lede">Cari makalah di OpenAlex (jutaan artikel ilmu sosial dan humaniora, gratis), dapatkan ringkasan singkat, dan ketuk istilah antropologi untuk penjelasannya. Alon-alon asal kelakon.</p>
  <div class="tabs">${TABS.map(([k, l]) => `<a href="#/read${k ? '/' + k : ''}" class="${k === tab ? 'on' : ''}">${l}</a>`).join('')}</div><div id="readBody"></div>`;
  const body = $('#readBody', el);
  (({ '': discover, 'hari-ini': today_, library, jurnal, pdf: pdfTab })[tab] || discover)(body);
}
function decodeKey(k) { try { return /%[0-9A-F]{2}/i.test(k) ? decodeURIComponent(k) : k; } catch (_) { return k; } }

function isSaved(key) { return S().papers.some(x => x.key === key); }
function savePaper(p) {
  if (isSaved(p.key)) return;
  S().papers.unshift({ ...p, status: 'to-read', notes: '', takeaway: '', added: today() }); save(); toast('Tersimpan di perpustakaanmu');
}

function discover(el) {
  const custom = kw().filter(k => !TOPICS.some(t => t[0].toLowerCase() === k)).slice(0, 14);
  const o = last?.opts || { oa: false, from: '', sort: 'relevance_score:desc' };
  el.innerHTML = `
    <div class="card">
      <form class="searchbar" id="sf"><input type="search" id="sq" placeholder="Topik, penulis, atau judul" value="${esc(last?.q || '')}"><button class="btn">Cari</button></form>
      <div class="row" style="margin-top:10px">${TOPICS.map((t, i) => `<button class="chip" data-t="${i}">${esc(t[0])}</button>`).join('')}</div>
      ${custom.length ? `<div class="row" style="margin-top:8px"><small class="muted">Kata kunciku:</small>${custom.map(k => `<button class="chip" data-k="${esc(k)}">${esc(k)}</button>`).join('')}</div>` : ''}
      <div class="row rd-filters" style="margin-top:12px;gap:14px;font-size:13.5px">
        <label>Tahun <select id="yr" style="width:auto"><option value="">Semua</option><option value="5">5 tahun terakhir</option><option value="10">10 tahun terakhir</option><option value="2000">Sejak 2000</option></select></label>
        <label><input type="checkbox" id="oaOnly" ${o.oa ? 'checked' : ''}> Akses terbuka saja</label>
        <label>Urut <select id="sort" style="width:auto"><option value="relevance_score:desc">Paling relevan</option><option value="publication_date:desc">Terbaru</option><option value="cited_by_count:desc">Paling banyak dikutip</option></select></label>
      </div>
    </div>
    <div id="results" class="card" style="margin-top:14px"><p class="muted" style="margin:0">Tips: mulai dari artikel ulasan atau satu etnografi yang kamu suka, lalu lihat siapa yang dikutip dan siapa yang mengutipnya. Monggo dicoba salah satu topik di atas.</p></div>`;
  $('#yr', el).value = o.from || ''; $('#sort', el).value = o.sort || 'relevance_score:desc';
  const res = $('#results', el);
  const run = async (q, page = 1) => {
    if (!q) return;
    const opts = { oa: $('#oaOnly', el).checked, from: $('#yr', el).value, sort: $('#sort', el).value };
    if (page === 1) res.innerHTML = '<p class="muted">Mencari di OpenAlex…</p>';
    const yrs = opts.from ? (opts.from === '2000' ? 2000 : new Date().getFullYear() - +opts.from) : '';
    try {
      const { list, total } = await oaSearch(q, { page, sort: opts.sort, oaOnly: opts.oa, from: yrs });
      const prev = page > 1 && last ? last.list : [];
      const all = [...prev, ...list];
      last = { q, opts, list: all, page, total };
      draw(all, total);
    } catch (e) { res.innerHTML = `<div class="notice dew">Gagal menghubungi OpenAlex (${esc(e.message)}). Cek sambungan internetmu lalu coba lagi.</div>`; }
  };
  const draw = (all, total) => {
    res.innerHTML = all.length ? `<p class="muted" style="margin:0 0 4px;font-size:13px">${total.toLocaleString('id-ID')} hasil untuk "${esc(last.q)}"</p>${all.map(paperRow).join('')}${all.length < total ? '<div class="row" style="justify-content:center;margin-top:12px"><button class="btn soft" id="more">Muat lagi</button></div>' : ''}`
      : '<div class="empty">Tidak ada makalah yang cocok. Coba kata yang lebih umum, atau pakai bahasa Inggris.</div>';
    bindRows(res, all);
    $('#more', res)?.addEventListener('click', () => run(last.q, last.page + 1));
  };
  $('#sf', el).onsubmit = e => { e.preventDefault(); run($('#sq', el).value.trim()); };
  $$('[data-t]', el).forEach(b => b.onclick = () => { const t = TOPICS[+b.dataset.t]; $('#sq', el).value = t[1]; run(t[1]); });
  $$('[data-k]', el).forEach(b => b.onclick = () => { $('#sq', el).value = b.dataset.k; run(b.dataset.k); });
  if (last?.list?.length) draw(last.list, last.total);
}
function paperRow(p) {
  const href = `#/read/paper/${encodeURIComponent(p.key)}`;
  return `<div class="paper" data-key="${esc(p.key)}"><h3><a href="${href}">${esc(p.title)}</a></h3>
    <div class="meta">${esc(shortAuthors(p.authors))} · <i>${esc(p.journal)}</i> ${esc(p.year)} ${p.oa ? '<span class="chip good">Akses terbuka</span>' : ''} ${typeLabel(p.type) && p.type !== 'article' ? `<span class="chip water">${typeLabel(p.type)}</span>` : ''} ${p.cited ? `<span class="chip">dikutip ${p.cited}×</span>` : ''}</div>
    <div class="row" style="margin-top:6px"><a class="btn sm" href="${href}">Ringkasan</a><button class="btn sm ghost" data-save>${isSaved(p.key) ? '✓ Tersimpan' : '+ Simpan'}</button></div></div>`;
}
function bindRows(root, list) {
  $$('[data-save]', root).forEach(b => b.onclick = () => {
    const p = list.find(x => x.key === b.closest('.paper').dataset.key); if (!p) return;
    savePaper(p); b.textContent = '✓ Tersimpan';
  });
}

/* ---- bacaan hari ini ---- */
async function today_(el) {
  let offset = 0;
  const show = async () => {
    el.innerHTML = '<p class="muted">Memilihkan bacaan untukmu…</p>';
    try {
      const p = offset === 0 ? await paperOfDay() : await pickPaper(offset);
      if (!p) { el.innerHTML = '<div class="empty">Belum ada bacaan yang cocok hari ini. Coba <a href="#/read">cari sendiri</a>.</div>'; return; }
      cache.set(p.key, p);
      const tl = summarise(p.abstract, 3);
      el.innerHTML = `<div class="card"><div class="eyebrow">Bacaan hari ini · ${esc(fmtDate(today()))}</div>
        <h2 style="margin-top:2px"><a href="#/read/paper/${encodeURIComponent(p.key)}" style="text-decoration:none">${esc(p.title)}</a></h2>
        <p class="muted">${esc(shortAuthors(p.authors))} · <i>${esc(p.journal)}</i> ${esc(p.year)}${p.topic ? ` · dipilih dari minat: <i>${esc(String(p.topic).replace(/"/g, '').slice(0, 50))}</i>` : ''}</p>
        ${tl.length ? `<div class="digest"><ul>${tl.map(s => `<li>${annotate(s)}</li>`).join('')}</ul></div>` : ''}
        <div class="row" style="margin-top:14px"><a class="btn" href="#/read/paper/${encodeURIComponent(p.key)}">Buka ringkasan</a><button class="btn ghost" data-save>${isSaved(p.key) ? '✓ Tersimpan' : '+ Simpan'}</button><button class="btn soft" id="other">Ganti bacaan</button></div></div>`;
      $('[data-save]', el).onclick = e => { savePaper(p); e.target.textContent = '✓ Tersimpan'; };
      $('#other', el).onclick = () => { offset++; show(); };
    } catch (e) { el.innerHTML = `<div class="notice dew">Belum bisa mengambil bacaan (${esc(e.message)}). Coba lagi nanti ya.</div>`; }
  };
  show();
}

/* ---- halaman makalah ---- */
async function reader(el, key) {
  el.innerHTML = '<p class="muted">Membuka makalah…</p>';
  let p; try { p = await getPaper(key); } catch (e) { }
  if (!p) { el.innerHTML = `<div class="empty">Makalah ini tidak bisa dimuat. <a href="#/read">Kembali</a></div>`; return; }
  const absParts = structuredAbstract(p.abstract || '');
  const absText = absParts.map(x => x.t).join(' ');
  const tldr = summarise(absText, 3);
  const found = new Map();
  const tldrHtml = tldr.map(s => `<li>${annotate(s, found)}</li>`).join('');
  const absHtml = absParts.map(x => `<p>${x.h ? `<b>${esc(x.h)}.</b> ` : ''}${annotate(x.t, found)}</p>`).join('');
  const saved = () => S().papers.find(x => x.key === p.key);
  const link = p.oaUrl || (p.doi ? 'https://doi.org/' + p.doi : '');
  el.innerHTML = `<div class="reader">
    <a href="#/read" class="muted" style="text-decoration:none">← Ruang baca</a>
    <div class="eyebrow" style="margin-top:10px">${esc(p.journal)} · ${esc(p.year)} ${typeLabel(p.type) && p.type !== 'article' ? '· ' + typeLabel(p.type) : ''}</div>
    <h1 style="font-size:26px">${esc(p.title)}</h1>
    <p class="muted">${esc(authorsArr(p.authors).join(', '))}${p.doi ? ` · <a href="https://doi.org/${esc(p.doi)}" target="_blank" rel="noopener">doi.org/${esc(p.doi)}</a>` : ''}${p.cited ? ` · dikutip ${p.cited}×` : ''}</p>
    <div class="row" style="margin-bottom:16px"><button class="btn" id="saveP">${saved() ? '✓ Ada di perpustakaan' : '+ Simpan ke perpustakaan'}</button>
      ${p.oa && p.oaUrl ? `<a class="btn soft" href="${esc(p.oaUrl)}" target="_blank" rel="noopener">Baca teks lengkap ↗</a>` : ''}
      <button class="btn soft" id="citeBtn">Kutipan</button><button class="btn ghost" id="aiBtn">Diskusi dengan AI</button><button class="btn ghost" id="focusBtn">Mode fokus</button></div>
    <div class="digest"><div class="eyebrow">Ringkasan 3 kalimat · dibuat di browsermu</div>
      ${tldr.length ? `<ul>${tldrHtml}</ul>` : '<p class="muted">Rekaman ini tidak punya abstrak.</p>'}</div>
    <div class="spacer"></div>
    <section class="card"><h2>Abstrak</h2><div class="abs">${absHtml || '<p class="muted">Tidak ada abstrak.</p>'}</div>
      <p class="muted" style="font-size:12.5px">Ketuk <mark class="term">istilah yang disorot</mark> untuk melihat penjelasannya.</p></section>
    ${found.size ? `<div class="spacer"></div><section class="card"><h2>Istilah kunci</h2><dl class="kt">${[...found].map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl></section>` : ''}
    ${p.keywords?.length ? `<div class="row" style="margin-top:12px">${p.keywords.slice(0, 8).map(k => `<span class="chip">${esc(k)}</span>`).join('')}</div>` : ''}
    <div class="spacer"></div>
    <section class="card"><h3>Teks lengkap</h3>${p.oa && link ? `<p>Tersedia akses terbuka. <a href="${esc(link)}" target="_blank" rel="noopener">Buka teks lengkap ↗</a>. Kalau kamu mengunduh PDF-nya, bisa dibaca dengan ringkasan per bagian di tab <a href="#/read/pdf">PDF</a>.</p>` : `<p class="muted">Belum ada akses terbuka yang tercatat. Coba tautan DOI (akun perpustakaan kampus mungkin membukanya), cari di <a href="https://unpaywall.org/" target="_blank" rel="noopener">Unpaywall</a>, atau minta langsung ke penulisnya, biasanya dikirim dengan senang hati.</p>`}</section>
    <div class="spacer"></div>
    <section class="card dew"><h2>Baca dengan sadar</h2>
      <ol class="steps"><li><b>Putaran 1 (5 menit)</b>: judul, abstrak, kesimpulan. Pertanyaan apa yang dijawab dan siapa lawan argumennya?</li><li><b>Putaran 2 (30 menit)</b>: baca argumen utama dan data etnografinya. Di mana penulis berdiri (posisionalitas)?</li><li><b>Putaran 3 (untuk bacaan kunci)</b>: metode dan kutipan penting. Apa yang bisa kamu pinjam untuk risetmu?</li></ol>
      <label class="f">Intisari satu kalimat, dengan kata-katamu sendiri</label><textarea id="takeaway" rows="2" placeholder="Makalah ini berargumen bahwa…">${esc(saved()?.takeaway || '')}</textarea>
      <label class="f">Catatan / pertanyaan untuk diskusi</label><textarea id="notes" rows="3">${esc(saved()?.notes || '')}</textarea>
      <div class="spacer"></div><button class="btn" id="doneBtn">${saved()?.status === 'done' ? '✓ Sudah dibaca' : 'Tandai sudah dibaca (+15 XP)'}</button>
    </section></div>`;
  $('#saveP', el).onclick = () => { savePaper(p); $('#saveP', el).textContent = '✓ Ada di perpustakaan'; };
  $('#citeBtn', el).onclick = () => copyText(apaCitation(p));
  $('#focusBtn', el).onclick = () => { document.body.classList.toggle('focus-mode'); toast(document.body.classList.contains('focus-mode') ? 'Mode fokus nyala: teks lebih besar dan tenang' : 'Mode fokus mati'); };
  $('#aiBtn', el).onclick = () => aiModal(p, absText, null);
  const persist = () => { if (!saved()) savePaper(p); const s = saved(); s.takeaway = $('#takeaway', el).value; s.notes = $('#notes', el).value; save(); };
  $('#takeaway', el).onchange = persist; $('#notes', el).onchange = persist;
  $('#doneBtn', el).onclick = () => {
    if ($('#takeaway', el).value.trim().length < 15) return toast('Tulis dulu intisari satu kalimat, supaya benar-benar nempel');
    persist(); const s = saved();
    if (s.status !== 'done') { s.status = 'done'; s.doneAt = today(); save(); addXP(15); window.dispatchEvent(new Event('fromodyssey:stats')); }
    $('#doneBtn', el).textContent = '✓ Sudah dibaca'; toast('Mantap, sudah dibaca! +15 XP');
  };
}

/* ---------------- diskusi dengan AI (salin prompt) ---------------- */
function buildPrompt(p, absText, sections, mode) {
  const ft = sections ? sections.map(s => `## ${s.title}\n${s.text}`).join('\n\n') : '';
  const body = ft ? ft.slice(0, 60000) : absText;
  const me = S().profile.background || 'seorang antropolog';
  const ask = {
    explain: `Jelaskan makalah ini kepadaku, ${me}. Berikan: (1) pertanyaan penelitiannya dalam satu kalimat, (2) data dan metodenya, (3) argumen utama, (4) keterbatasan atau hal yang bisa diperdebatkan, (5) tiga istilah kunci dengan penjelasan sederhana, (6) dua pertanyaan yang bisa kuajukan kepada penulis.`,
    critique: `Telaah makalah ini secara kritis: kerangka teori, posisi penulis, kualitas data etnografis, etika riset (termasuk persetujuan komunitas), dan apakah kesimpulannya didukung data. Jujur dan adil.`,
    use: `Aku sedang menyusun proposal riset dan tulisan. Dari makalah ini, bagian mana yang bisa kupinjam (konsep, metode, kutipan), dengan siapa makalah ini bisa kudialogkan, dan apa bacaan lanjutannya?`,
  }[mode];
  return `${ask}\n\nJudul: ${p.title}\nPenulis: ${authorsArr(p.authors).join(', ')}\nTerbit: ${p.journal} (${p.year})${p.doi ? `\nDOI: ${p.doi}` : ''}\n\n${ft ? 'TEKS LENGKAP' : 'ABSTRAK'}:\n${body}`;
}
function aiModal(p, absText, sections) {
  modal(`<div class="row between"><h2 style="margin:0">Diskusi makalah ini dengan AI</h2><button class="btn sm ghost" data-close>Tutup</button></div>
    <p class="muted">Fromodyssey menyiapkan prompt dengan isi makalah${sections ? ' (teks lengkap)' : ' (hanya abstrak)'}. Salin, lalu tempel ke asisten AI yang kamu pakai.</p>
    <div class="row"><span class="muted">Aku ingin…</span>
      <div class="os-switch"><button data-m="explain" class="on">Memahaminya</button><button data-m="critique">Menelaahnya</button><button data-m="use">Memakainya</button></div></div>
    <div class="row" style="margin-top:14px">
      <button class="btn" id="cp">Salin prompt</button>
      <a class="btn soft" href="https://claude.ai/new" target="_blank" rel="noopener">Buka Claude ↗</a>
      <a class="btn soft" href="https://notebooklm.google.com/" target="_blank" rel="noopener">NotebookLM ↗</a>
    </div>
    <p class="muted" style="font-size:13px;margin-top:12px">Ringkasan AI bagus untuk orientasi, tapi bisa meleset. Selalu cek kutipan dan angka ke teks aslinya.</p>`, m => {
    let mode = 'explain';
    $$('[data-m]', m).forEach(b => b.onclick = () => { $$('[data-m]', m).forEach(x => x.classList.remove('on')); b.classList.add('on'); mode = b.dataset.m; });
    $('#cp', m).onclick = () => copyText(buildPrompt(p, absText, sections, mode));
  });
}

/* ---------------- perpustakaan ---------------- */
export function toMarkdown(ps) {
  return `# Perpustakaanku\n\nDiekspor ${today()} dari Fromodyssey\n\n` + ps.map(p => {
    return `## ${p.title}\n\n- Kutipan: ${apaCitation(p)}\n- Status: ${STATUS[p.status] || STATUS['to-read']}\n${p.oaUrl ? `- Teks lengkap: ${p.oaUrl}\n` : ''}${p.takeaway ? `\n**Intisari:** ${p.takeaway}\n` : ''}${p.notes ? `\n**Catatan:**\n\n${p.notes}\n` : ''}`;
  }).join('\n');
}
export function toRIS(ps) {
  const c = s => String(s || '').replace(/\r?\n/g, ' ');
  return ps.map(p => ['TY  - ' + (p.type === 'book' ? 'BOOK' : p.type === 'book-chapter' ? 'CHAP' : 'JOUR'),
    ...authorsArr(p.authors).map(a => 'AU  - ' + c(a)), 'TI  - ' + c(p.title), p.journal ? 'JO  - ' + c(p.journal) : '', p.year ? 'PY  - ' + p.year : '',
    p.abstract ? 'AB  - ' + c(p.abstract) : '', p.doi ? 'DO  - ' + p.doi : '', p.oaUrl ? 'UR  - ' + p.oaUrl : (p.doi ? 'UR  - https://doi.org/' + p.doi : ''),
    ...(p.keywords || []).map(k => 'KW  - ' + c(k)), (p.takeaway || p.notes) ? 'N1  - ' + c([p.takeaway, p.notes].filter(Boolean).join(' | ')) : '', 'ER  - '].filter(Boolean).join('\n')).join('\n\n') + '\n';
}
function library(el) {
  const ps = S().papers;
  const count = s => ps.filter(p => (p.status || 'to-read') === s).length;
  el.innerHTML = `<div class="row between"><div class="row"><button class="chip on" data-f="all">Semua (${ps.length})</button><button class="chip" data-f="to-read">Belum (${count('to-read')})</button><button class="chip" data-f="reading">Sedang (${count('reading')})</button><button class="chip" data-f="done">Sudah (${count('done')})</button></div>
    <div class="row"><button class="btn sm ghost" id="expMd">Ekspor Markdown</button><button class="btn sm ghost" id="expRis">Ekspor RIS (Mendeley/Zotero)</button></div></div>
    <div class="card" style="margin-top:12px" id="libList"></div>`;
  const draw = filter => {
    const list = ps.filter(p => filter === 'all' || (p.status || 'to-read') === filter);
    $('#libList', el).innerHTML = list.length ? list.map(p => `<div class="paper lib" data-key="${esc(p.key)}"><h3><a href="#/read/paper/${encodeURIComponent(p.key)}">${esc(p.title)}</a></h3>
      <div class="meta">${esc(shortAuthors(p.authors))} · ${esc(p.journal || '')} ${esc(p.year || '')} · disimpan ${esc(fmtDate(p.added))}</div>
      <div class="row" style="margin-top:8px"><select data-st style="width:auto">${Object.entries(STATUS).map(([k, l]) => `<option value="${k}" ${(p.status || 'to-read') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <button class="btn sm ghost" data-cite>Kutipan</button><button class="btn sm ghost" data-del>Hapus</button></div>
      <textarea class="lib-note" data-note rows="2" placeholder="Catatan, kutipan penting, kaitannya dengan risetmu…">${esc(p.notes || '')}</textarea></div>`).join('')
      : '<div class="empty">Belum ada apa-apa di sini. Simpan makalah dari tab Cari.</div>';
    $$('.paper.lib', el).forEach(row => {
      const p = ps.find(x => x.key === row.dataset.key);
      $('[data-st]', row).onchange = e => { p.status = e.target.value; if (p.status === 'done' && !p.doneAt) p.doneAt = today(); save(); window.dispatchEvent(new Event('fromodyssey:stats')); library(el); };
      $('[data-note]', row).onchange = e => { p.notes = e.target.value; save(); };
      $('[data-cite]', row).onclick = () => copyText(apaCitation(p));
      $('[data-del]', row).onclick = () => { if (!confirm('Hapus dari perpustakaan?')) return; S().papers = S().papers.filter(x => x.key !== p.key); save(); library(el); };
    });
  };
  $$('[data-f]', el).forEach(b => b.onclick = () => { $$('[data-f]', el).forEach(x => x.classList.remove('on')); b.classList.add('on'); draw(b.dataset.f); });
  $('#expMd', el).onclick = () => ps.length ? download('perpustakaanku.md', toMarkdown(ps), 'text/markdown') : toast('Perpustakaan masih kosong');
  $('#expRis', el).onclick = () => ps.length ? download('perpustakaanku.ris', toRIS(ps), 'application/x-research-info-systems') : toast('Perpustakaan masih kosong');
  draw('all');
}

/* ---------------- jurnal ---------------- */
const gs = n => `https://scholar.google.com/scholar?q=${encodeURIComponent('source:"' + n + '"')}`;
const JOURNALS = [
  ['Antropologi Indonesia', 'Departemen Antropologi UI. Jurnal antropologi Indonesia tertua, bahasa Indonesia dan Inggris.', 'https://scholarhub.ui.ac.id/', 'Cari di UI Scholars Hub', 'Akses terbuka'],
  ['Jurnal Masyarakat & Budaya', 'BRIN. Kajian masyarakat dan budaya Indonesia, bahasa Indonesia.', 'https://ejournal.brin.go.id/', 'Portal e-journal BRIN', 'Akses terbuka'],
  ['Wacana: Journal of the Humanities of Indonesia', 'Fakultas Ilmu Pengetahuan Budaya UI. Humaniora dan budaya Indonesia.', 'https://wacana.ui.ac.id/', '', 'Akses terbuka'],
  ['Indonesia (Cornell)', 'Cornell Southeast Asia Program. Politik, sejarah, dan masyarakat Indonesia.', 'https://www.jstor.org/journal/indonesia', 'JSTOR', ''],
  ['American Ethnologist', 'Jurnal American Ethnological Society; etnografi dan teori.', 'https://anthrosource.onlinelibrary.wiley.com/journal/15481425', 'AnthroSource (Wiley)', ''],
  ['Cultural Anthropology', 'Society for Cultural Anthropology. Etnografi kritis dan eksperimental.', 'https://journal.culanth.org/', '', 'Akses terbuka'],
  ['HAU: Journal of Ethnographic Theory', 'Teori etnografi dan ontologi; pertukaran, nilai, dunia lain.', 'https://www.journals.uchicago.edu/journals/hau', 'University of Chicago Press', ''],
  ['Journal of the Royal Anthropological Institute (JRAI)', 'Salah satu jurnal antropologi paling lama dan berpengaruh.', 'https://rai.onlinelibrary.wiley.com/journal/14679655', 'Wiley', ''],
  ['Current Anthropology', 'Wenner-Gren. Artikel dengan komentar lintas subbidang.', 'https://www.journals.uchicago.edu/journals/ca', 'University of Chicago Press', ''],
  ['The Asia Pacific Journal of Anthropology', 'Antropologi Asia dan Pasifik, cocok untuk kajian Indonesia dan Oseania.', 'https://www.tandfonline.com/journals/rtap20', 'Taylor & Francis', ''],
  ['Bijdragen tot de Taal-, Land- en Volkenkunde (BKI)', 'KITLV. Kajian Asia Tenggara dan Karibia, humaniora dan ilmu sosial.', 'https://brill.com/view/journals/bki/bki-overview.xml', 'Brill', 'Akses terbuka'],
  ['Inside Indonesia', 'Majalah daring populer, tulisan pendek dari para peneliti dan jurnalis. Mudah dibaca dan dikutip sebagai pengantar.', 'https://www.insideindonesia.org/', '', 'Akses terbuka'],
  ['Environmental Humanities', 'Humaniora lingkungan, multispesies, dan Antroposen.', 'https://read.dukeupress.edu/environmental-humanities', 'Duke University Press', 'Akses terbuka'],
  ['Sound Studies', 'Kajian bunyi, mendengar, dan budaya akustik.', '', 'Cari artikelnya', ''],
];
function jurnal(el) {
  el.innerHTML = `<div class="notice">Daftar pendek tempat mulai. Banyak jurnal lain di luar ini; cek tautan "Cari artikel" untuk menelusuri lewat Google Scholar. Kalau terkunci paywall, coba akun UI/ANU lewat perpustakaan, atau Unpaywall.</div>
  <div class="grid g2" style="margin-top:14px">${JOURNALS.map(([n, d, u, ul, oa]) => `<section class="card jr"><h3>${esc(n)} ${oa ? `<span class="chip good">${oa}</span>` : ''}</h3><p>${esc(d)}</p>
    <div class="row">${u ? `<a class="btn sm" href="${esc(u)}" target="_blank" rel="noopener">${esc(ul || 'Buka situs')} ↗</a>` : ''}<a class="btn sm ghost" href="${esc(gs(n))}" target="_blank" rel="noopener">Cari artikel ↗</a></div></section>`).join('')}</div>`;
}

/* ---------------- unggah PDF ---------------- */
let pdfjs = null;
async function loadPdfJs() {
  if (pdfjs) return pdfjs;
  pdfjs = await import(PDFJS + 'pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.mjs';
  return pdfjs;
}
async function pdfToText(file, onMsg) {
  const lib = await loadPdfJs();
  const doc = await lib.getDocument({ data: await file.arrayBuffer() }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) {
    onMsg(`Membaca halaman ${i} dari ${doc.numPages}…`);
    const page = await doc.getPage(i);
    const c = await page.getTextContent();
    for (const it of c.items) text += it.str + (it.hasEOL ? '\n' : ' ');
    text += '\n';
  }
  return { text, pages: doc.numPages };
}
function splitSections(text) {
  const H = /^\s*(?:\d+\.?\s*)?(abstract|abstrak|introduction|pendahuluan|background|latar belakang|materials and methods|methods?|metode( penelitian)?|methodology|results( and discussion)?|hasil( dan pembahasan)?|discussion|pembahasan|conclusions?|kesimpulan|simpulan|references|daftar pustaka|referensi|acknowledg(e)?ments?|ucapan terima kasih)\s*$/i;
  const lines = text.split('\n'); const out = []; let cur = { title: 'Awal', text: '' };
  for (const ln of lines) {
    if (H.test(ln) && ln.trim().length < 40) { if (cur.text.trim()) out.push(cur); cur = { title: ln.trim().replace(/^\d+\.?\s*/, ''), text: '' }; }
    else cur.text += ln + ' ';
  }
  if (cur.text.trim()) out.push(cur);
  return out.filter(s => !/^references|^daftar pustaka|^referensi|^acknowledg|^ucapan/i.test(s.title)).map(s => ({ title: cap(s.title), text: s.text.replace(/\s+/g, ' ').replace(/-\s(?=[a-z])/g, '').trim() }));
}
function pdfTab(el) {
  el.innerHTML = `<div class="card">
    <label class="dropzone" id="dz"><input type="file" accept="application/pdf" id="pf" hidden>
      <div style="font-size:34px">📄</div><b>Seret PDF jurnal ke sini, atau ketuk untuk memilih</b><br><small class="muted">Dibaca di dalam browsermu, tidak diunggah ke mana pun.</small></label>
    <p class="muted" style="margin:10px 0 0">Mau disimpan (dan bisa dibaca enak di HP sebagai halaman Markdown)? Taruh di <a href="#/files">Berkas</a>; otomatis dirapikan ke Drive-mu.</p>
    <p id="pmsg" class="muted" style="margin-top:10px"></p></div><div id="pout"></div>`;
  const dz = $('#dz', el), inp = $('#pf', el);
  const handle = async f => {
    if (!f || f.type !== 'application/pdf') return toast('Pilih berkas PDF ya');
    const msg = t => $('#pmsg', el).textContent = t;
    try {
      const { text, pages } = await pdfToText(f, msg);
      if (text.replace(/\s/g, '').length < 500) { msg('PDF ini tampaknya hasil pindai tanpa lapisan teks, jadi belum bisa dibaca di sini. Coba versi dari penerbit, atau jalankan OCR dulu.'); return; }
      const secs = splitSections(text);
      const all = secs.map(s => s.text).join(' ');
      const found = new Map();
      const p = { key: 'PDF:' + f.name, title: f.name.replace(/\.pdf$/i, ''), authors: [], journal: 'PDF unggahan', year: '', abstract: '' };
      msg(`${pages} halaman dibaca · ${secs.length} bagian ditemukan`);
      $('#pout', el).innerHTML = `<div class="spacer"></div><div class="digest"><div class="eyebrow">Ringkasan seluruh makalah</div><ul>${summarise(all, 5).map(s => `<li>${annotate(s, found)}</li>`).join('')}</ul></div>
        <div class="row" style="margin:14px 0"><button class="btn soft" id="pai">Diskusi dengan AI</button></div>
        <div class="card">${secs.map(s => `<details><summary>${esc(s.title)}</summary><div class="digest" style="margin:10px 0"><ul>${summarise(s.text, 2).map(x => `<li>${annotate(x)}</li>`).join('')}</ul></div><div class="section-text"><p>${annotate(s.text)}</p></div></details>`).join('')}</div>
        ${found.size ? `<div class="spacer"></div><section class="card"><h2>Istilah kunci</h2><dl class="kt">${[...found].map(([t, d]) => `<dt>${esc(t)}</dt><dd>${esc(d)}</dd>`).join('')}</dl></section>` : ''}`;
      $('#pai', el).onclick = () => aiModal(p, all.slice(0, 20000), secs);
    } catch (e) { msg('PDF ini tidak bisa dibaca: ' + e.message); }
  };
  inp.onchange = () => handle(inp.files[0]);
  dz.ondragover = e => { e.preventDefault(); dz.classList.add('hover'); };
  dz.ondragleave = () => dz.classList.remove('hover');
  dz.ondrop = e => { e.preventDefault(); dz.classList.remove('hover'); handle(e.dataTransfer.files[0]); };
}
