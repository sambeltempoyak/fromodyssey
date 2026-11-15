# fromodyssey: catatan pengembangan (untuk Ejak dan sesi Claude berikutnya)

Situs: https://alberta.sokola.org · Repo: github.com/sambeltempoyak/fromodyssey (publik, `main`).
Aplikasi untuk Berta: radar PhD berdana & hibah riset, jalur belajar antropologi, ruang baca, lemari berkas di Drive.
Saudara dari Cornelieur (arsitektur sama: situs statis + robot harian + Apps Script + scout mingguan). Panduan rawat: README.md. Kontrak desain: docs/SPEC.md.

## v1.0 (15 Nov 2026)
- **Beranda "Rimba"** (`js/scene.js`, `css/scene.css`, `assets/rimba.webp`): lukisan Multispesies jadi dasbor. Teknik "tambalan bernapas": 16 potongan lukisan yang sama, tepinya dibaurkan, digerakkan 1–4% dengan CSS; satu kanvas untuk air terjun, riak, semprotan gajah, serbuk cahaya/kunang-kunang; burung SVG kecil terbang; suara rimba disintesis (WebAudio, tanpa berkas). 10 titik sentuh: gajah = peluang baru, orangutan = sapa + lelucon, cenderawasih = belajar, harimau = tenggat, tarsius = bacaan, kakatua = petuah, komodo = berkas, kura-kura = mode tenaga, katak = suara, air terjun = runtutan hari. Koordinat titik ada di awal `scene.js` (persen terhadap lukisan). Lukisan di-grade ke arah toska foto Mata Jitu (skrip sekali pakai, tidak di repo).
- **Peluang** (`js/analyze.js`, `js/radar.js`): pembaca aturan tanpa AI; 11 keluarga tema; prioritas 1–99 (tema maks 36, kelayakan +12, pendanaan +10, jenjang +6, jalur Sokola +5, waktu +8, tempat +3, scout +8; penghalang berat −40, sedang −10); vonis Mulai dari sini / Layak dilirik / Coba-coba berhadiah / Nanti saja / Kayaknya bukan buatmu; chip "Sebagai Sokola / Pribadi / Dua-duanya bisa". Tab: Arus, Ringkas 5 menit, Kalender musim (`data/funders.json`), Rute, Cari cepat, Pelacak.
- **Belajar** (`js/lessons.js`, `js/learn.js`): 10 unit, 44 pelajaran, 308 langkah, dari Akar sampai Bunyi & multimodal + "Menuju proposal PhD". Jenis langkah baru: `reflect` (catatan refleksi, tersimpan, bisa diunduh .md) dan `read` (penunjuk bacaan).
- **Baca** (`js/read.js`): OpenAlex, glosarium 74 istilah antropologi, perpustakaan dengan ekspor Markdown/RIS, daftar jurnal.
- **Berkas** (`js/files.js`, `js/classify.js`, `js/folders.js`): lembar konfirmasi sebelum menyimpan, tampilan Pintar dan Pohon folder, pindah/ganti nama/hapus/folder baru, "Rapikan otomatis", unggah besar bertahap untuk rekaman. Indeks berkunci id berkas Drive, jadi Berta bebas menata ulang di Drive.
- **Akun** (`js/akun.js`, `apps-script/Code.gs` API v3): masuk dengan Google (ID token diverifikasi server, email harus terdaftar, sesi HMAC 30 hari); passcode hanya cadangan.
- **Kata kunci-ku** (Aku): kata yang Berta tambahkan memengaruhi skor peluang, bacaan, pencarian cepat, dan ditulis ke `99 Sistem/kata-kunci.json` untuk scout.

## Sudah diuji
Node: analyser (11 kasus), classifier (21 kasus), logika sesi Code.gs (dengan Utilities tiruan), kontras warna. Browser tanpa kepala (390 px dan 1280 px, terang + malam) dengan server Drive tiruan: semua halaman tanpa galat dan tanpa gulir menyamping; unggah catatan lapangan → lembar konfirmasi → tersimpan di `03 Data Lapangan/Orang Rimba/Catatan Lapangan` → muncul di pohon folder; pemutar pelajaran; adegan lukisan dan gelembung. Bentuk respons OpenAlex dicek dengan satu permintaan nyata.

## BELUM diuji (buktikan, jangan diasumsikan)
- Apps Script asli, login Google asli, unggah bertahap asli (`Content-Range` lewat UrlFetchApp).
- Semua feed robot: tidak bisa diambil dari ruang kerja. Hanya feed HASTAC yang terlihat ada; sisanya tebakan dan beberapa hampir pasti gagal. Baca `data/opportunities.json` → `report` setelah run pertama, matikan yang gagal dengan `"off": true` di `config/sources.json`.
- Font Google dan pustaka CDN (pdf.js, mammoth) di perangkat nyata; pemutar audio; PDF hasil pindai.
- `tests/drive.test.mjs` butuh `DRIVE_URL` tiruan di config dan gagal di pohon repo apa adanya.

## Data awal (riset 15 Nov 2026, rincian di docs/catatan-riset-awal.md)
`data/agent-radar.json`: 11 peluang. `data/funders.json`: 38 skema, 20 terverifikasi dari laman resmi, 18 `verified: null` ("cek laman resmi"). Catatan penting: Australia Awards Indonesia tercatat untuk S2, bukan PhD; kuota LPDP kecil untuk sosial-humaniora; hari itu tidak ada lowongan PhD antropologi terbuka di UvA/AISSR.

## Keputusan
- "UVA" dibaca sebagai Universiteit van Amsterdam (Berta pernah jadi asisten riset proyek doktoral UvA).
- Foto Mata Jitu tidak masuk repo publik; dimuat dari Drive setelah login. Paletnya diturunkan dari foto itu.
- Berkas ada di Drive Ejak dan Ejak bisa membukanya; aplikasi mengatakannya terus terang kepada Berta.
- Lelucon politik menyasar kebijakan dan kekuasaan, tanpa kutipan karangan.

## Jebakan
Sama dengan Cornelieur: jangan unggah zip-nya; jangan tambah workflow kedua; jangan "Re-run jobs" pada run lama; skrip Apps Script perlu "New version" setiap berubah; jangan ganti nama kunci penyimpanan, id pelajaran, id peluang.
