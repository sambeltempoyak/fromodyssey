# fromodyssey

Rimba kecil untuk Berta: radar beasiswa PhD dan hibah riset, jalur belajar antropologi, ruang baca, dan lemari berkas di Google Drive.
Situs statis (HTML/CSS/ES modules, tanpa build) di GitHub Pages. Pemelihara: Ejak. Panduan ini untuk Ejak dan untuk sesi Claude berikutnya.

- Situs: https://alberta.sokola.org (cadangan: https://sambeltempoyak.github.io/fromodyssey/)
- Repo: github.com/sambeltempoyak/fromodyssey (publik, cabang `main`)
- Versi tampil di **Aku → Tentang** (diatur di `js/config.js`).

## Peta singkat

| Bagian | Tugas | Berkas | Jalan di |
|---|---|---|---|
| Situs | Seluruh aplikasi di browser Berta | akar repo, `js/`, `css/`, `assets/` | GitHub Pages |
| Robot | Tiap hari membaca feed, menulis `data/opportunities.json` | `scripts/update_radar.py`, `config/sources.json`, `.github/workflows/` | GitHub Actions |
| Scout | Tiap minggu Claude mencari dan memeriksa peluang, menulis `data/agent-radar.json` dan menyegarkan `data/funders.json` | `docs/weekly-scout-prompt.md`, `config/profil.md` | tugas terjadwal di Claude milik Ejak |
| Server Drive | Menyimpan/membaca berkas di SATU folder Drive, memeriksa login Google, mengambil laman iklan | `apps-script/Code.gs` (ditempel ke akun Google Ejak) | Google Apps Script |

Data Berta ada di browser-nya (localStorage `fromodyssey.v1`) dan dicerminkan ke Drive (`99 Sistem/progress.json`).

## Bagian 1 — GitHub Pages (sekali saja)
1. Repo → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Tab **Actions** → alur "Perbarui radar dan terbitkan" → **Run workflow**. Tunggu centang hijau.
3. Buka https://sambeltempoyak.github.io/fromodyssey/ untuk memastikan situs tampil.
4. Domain sendiri: di Squarespace (DNS sokola.org) tambah catatan **CNAME**: host `alberta` → `sambeltempoyak.github.io`. Lalu repo → Settings → Pages → **Custom domain**: `alberta.sokola.org` → Save → setelah DNS terbaca, centang **Enforce HTTPS**. (Berkas `CNAME` di akar repo sudah berisi nama domain ini.)

## Bagian 2 — Server Drive (Apps Script)
1. Buka https://script.google.com dengan akun Google pemilik folder Drive → **New project** → beri nama "fromodyssey".
2. Ganti seluruh isi `Code.gs` dengan isi `apps-script/Code.gs` dari repo ini (satu berkas saja).
3. Isi konstanta di bagian atas (JANGAN pernah menaruh nilai asli ini di repo):
   - `ROOT_ID` = kode di ujung tautan folder Drive.
   - `CLIENT_ID` = client id OAuth (sama dengan `GOOGLE_CLIENT_ID` di `js/config.js`).
   - `ALLOWED_EMAILS` = alamat Google yang boleh masuk (dua alamat Berta, dan alamat Ejak untuk mengecek).
   - `PASSCODE` = biarkan `''` kecuali butuh sambungan manual darurat.
4. Pilih fungsi `authorizeOnce` → **Run** → izinkan (Drive + permintaan keluar).
5. **Deploy → New deployment → Web app** → Execute as: **Me** → Who has access: **Anyone** → Deploy → salin URL yang berakhiran `/exec`.
6. Tempel URL itu ke `DRIVE_URL` di `js/config.js`, commit. (URL ini boleh publik: tanpa login Google yang terdaftar, server menolak semua permintaan.)
7. Kalau `Code.gs` berubah di kemudian hari: tempel kode baru (pertahankan baris konstanta) → **Deploy → Manage deployments → ikon pensil → Version: New version → Deploy**. Menyimpan saja tidak mengubah apa-apa; "New deployment" mengubah URL.

## Bagian 3 — Login Google (OAuth client yang sudah ada)
Aplikasi memakai client id milik proyek "lumbung sokola" hanya untuk **mengenali siapa yang masuk** (ID token), bukan untuk meminta akses Drive, jadi tidak perlu verifikasi Google tambahan.
1. https://console.cloud.google.com → proyek pemilik client id itu → **APIs & Services → Credentials** → buka OAuth client-nya.
2. **Authorized JavaScript origins** → tambah `https://alberta.sokola.org` dan `https://sambeltempoyak.github.io` → Save. (Perubahan bisa butuh beberapa menit.)
3. **OAuth consent screen**: bila statusnya *Testing*, tambahkan alamat Berta dan Ejak sebagai *Test users*. Layar izin akan menampilkan nama aplikasi proyek itu.

## Bagian 4 — Foto Mata Jitu
Foto Berta tidak disimpan di repo publik. Unggah berkas bernama `mata-jitu.jpg` ke folder `99 Sistem/aset/` (atau ke akar folder Drive). Aplikasi memuatnya setelah login dan menyimpannya untuk dipakai luring.

## Bagian 5 — Scout mingguan
Minta Claude: "Jadwalkan scout mingguan fromodyssey memakai prompt di docs/weekly-scout-prompt.md". Aplikasi GitHub Claude harus punya akses ke repo ini.

## Rutinitas tambal (patch)
- Paling mudah: di Claude, panggil skill **update-fromodyssey** dan sebutkan perubahannya. Claude mengedit repo langsung.
- Jangan pernah menimpa `data/` dari luar robot/scout, dan jangan menambah berkas workflow kedua.
- Setelah push: tunggu centang hijau di Actions → muat ulang paksa → cek versi di Aku → Tentang.
- Pages menayangkan commit dari run sukses terakhir. Jangan "Re-run jobs" pada run lama; pakai "Run workflow".
- Jangan mengganti nama kunci penyimpanan (`fromodyssey.*`), id pelajaran, atau id peluang: kemajuan Berta akan hilang.

## Yang boleh Berta lakukan tanpa merusak apa pun
Memindah, mengganti nama, atau menghapus berkas dan folder langsung di Google Drive. Indeks aplikasi memakai id berkas Drive, bukan lokasi; tombol "Sinkronkan dengan Drive" di halaman Berkas menyesuaikan sisanya. Satu-satunya yang jangan dihapus: folder `99 Sistem`.

## Privasi
- Repo publik: hanya fakta profesional di `config/profil.md`. Tidak ada email, foto, id folder, atau passcode.
- Berkas Berta tersimpan di folder Drive milik Ejak, dan Ejak bisa membukanya. Aplikasi mengatakan ini kepada Berta sebelum unggahan pertama. Untuk catatan lapangan dan rekaman yang memuat data partisipan, pastikan ini sesuai dengan persetujuan dan etika risetnya; alternatifnya, pindahkan kepemilikan folder ke akun Berta dan deploy skrip dari akunnya.
- Semua penilaian otomatis menampilkan kalimat buktinya dan meminta untuk mengecek laman asli.

## Uji
`node tests/analyze.test.mjs` · `node tests/classify.test.mjs` · server Drive tiruan: `node tests/fake-drive.mjs 8787`.
