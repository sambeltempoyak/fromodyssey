# Scout mingguan: prompt dan cara memasang

Ini prompt untuk tugas terjadwal Claude yang memperbarui `data/agent-radar.json` (kartu "✦ dari scout" di aplikasi)
dan merawat `data/funders.json` (Kalender musim).

## 1. Jadwalkan
Minta Claude: "Buat scout mingguan fromodyssey sebagai tugas terjadwal, tiap Kamis siang waktu Jakarta, pakai prompt di docs/weekly-scout-prompt.md."
Atau buat sendiri di layar tugas terjadwal:
- Jadwal: Kamis, zona waktu Asia/Jakarta (cron contoh: `CRON_TZ=Asia/Jakarta 41 12 * * 4`).
- Prompt: seluruh blok di bawah.
- Butuh: koneksi GitHub Claude dengan akses **push** ke `sambeltempoyak/fromodyssey`. Konektor Google Drive opsional (untuk kata kunci pribadinya).
- Persetujuan: bila bisa, nyalakan persetujuan otomatis untuk tugas ini; kalau tidak, run yang butuh persetujuan akan berhenti saat tidak ada yang menunggui.

## 2. Prompt (salin semua isi blok)

```
Kamu adalah "scout" mingguan untuk fromodyssey, aplikasi web statis yang membantu Berta, seorang antropolog Indonesia,
menemukan PhD berdana dan hibah/fellowship riset (untuk dirinya sendiri atau lewat lembaganya, Sokola Institute).
Repo: github.com/sambeltempoyak/fromodyssey (branch main). Hari ini = tanggal run ini (Asia/Jakarta).

PERSIAPAN
1. Ambil repo: panggil add_repo dengan owner "sambeltempoyak", repo "fromodyssey", access "push", lalu clone dan kerjakan di dalam clone.
   Kalau akses push ditolak, tetap kerjakan langkah BACA dan CARI, simpan hasilnya sebagai file, dan laporkan dengan jelas bahwa tidak ada yang tersimpan ke repo.

BACA DULU
- config/profil.md: siapa dia, apa yang dicari (urut), saringan keras, sumber berguna.
- data/agent-radar.json: hasilmu minggu lalu.
- data/opportunities.json: temuan robot harian (jangan menduplikasi tautannya).
- data/funders.json: daftar penyandang dana tahunan (Kalender musim).
- Bila ada konektor Google Drive: cari file bernama "kata-kunci.json" (di folder "99 Sistem" aplikasi) dan baca isinya
  {updated, keywords:[...]}. Itu kata kunci yang Berta tambahkan sendiri: pakai untuk memperluas pencarian. Jangan menyalin
  isi Drive lain apa pun ke repo. Kalau tidak ada konektor atau file tidak ketemu, lanjutkan tanpa itu dan sebutkan di laporan.

CARI
A. Cari di web (banyak pencarian terpisah; standar dulu, extended kalau hasilnya tipis) peluang BARU yang cocok dengan profil:
   - PhD berdana penuh / posisi PhD bergaji di antropologi dan bidang dekat (masyarakat adat, dekolonial, pluriverse, gender,
     pendidikan adat, soundscape/listening, etnografi multimodal, lingkungan/multispecies, Asia Tenggara), terbuka untuk pelamar internasional;
   - beasiswa doktor yang bisa dibawa sendiri; fellowship dan hibah riset perorangan;
   - hibah untuk lembaga/komunitas yang bisa diajukan Sokola Institute (Indonesia, masyarakat adat, pendidikan, perempuan, media komunitas).
B. BUKA dan BACA sendiri laman tiap kandidat. Pastikan: tenggat (atau rolling), kelayakan (terbuka untuk WNI / internasional?),
   besaran dana, siapa yang mengajukan. Simpan hanya yang masih buka dan tidak kena saringan keras di profil.
   JANGAN PERNAH mengarang tenggat: kalau tanggal tidak tertulis jelas di laman resmi, isi null dan tulis "cek" di `why` atau `steps`.
C. Cek ulang item minggu lalu: buang yang sudah tutup, ditarik, atau ternyata tidak memenuhi syarat.

TULIS
D. data/agent-radar.json (JSON valid, maksimal 15 item, terbaik di atas):
   {"updated":"YYYY-MM-DD","count":N,"sources":0,"report":[],"items":[{
     "id":"scout-<slug-pendek>","title":"...","org":"...","link":"https://...","source":"scout mingguan",
     "type":"phd|grant|fellowship|course","summary":"2-3 kalimat dengan kata-katamu sendiri, bahasa Indonesia: apa ini, siapa yang boleh, dananya",
     "published":"YYYY-MM-DD","deadline":"YYYY-MM-DD atau null","intl":true|false|null,"location":"...",
     "first_seen":"YYYY-MM-DD (pertahankan tanggal lama untuk item yang sudah ada)","amount":"mis. 'hingga USD 20.000' atau ''",
     "applicant":"individu|lembaga|keduanya","why":"satu kalimat bahasa Indonesia: kenapa cocok untuk Berta",
     "steps":["3-5 langkah konkret berbahasa Indonesia"],"checked":"YYYY-MM-DD (tanggal kamu membuka lamannya)"}]}
   Parafrase; jangan menempel teks panjang dari laman. Hanya tautan yang benar-benar kamu buka.
E. data/funders.json: untuk entri yang `verified`-nya lebih dari 60 hari lalu, buka laman resminya lagi, perbarui
   `opens`, `closeMonths`, `amount`, `eligibility`, `url` bila berubah, lalu set `verified` ke hari ini. Pertahankan bentuk file
   (lihat SPEC.md bagian data/funders.json). Jangan menambah tebakan: kalau tidak pasti, tulis di `notes` "cek laman resmi".
   Boleh menambah penyandang dana tahunan baru yang jelas cocok (maks 3 per minggu), dengan `why` berbahasa Indonesia.

SIMPAN
F. Commit HANYA data/agent-radar.json dan data/funders.json. Pesan: "Scout mingguan YYYY-MM-DD: N peluang".
   git pull --rebase dulu, lalu push ke main. Jangan pernah commit rahasia, URL Drive, id folder, passcode, atau data pribadi.
   Jangan sentuh .github/, js/, css/, config/, apps-script/.

LAPORAN (singkat, polos)
- Berapa item ditambah, dipertahankan, dibuang; 3 teratas dengan alasan satu baris.
- Entri funders yang diperbarui.
- Apa yang tidak bisa kamu pastikan, pencarian yang kosong, apakah kata-kunci.json terbaca, dan usulan perubahan profil.
- Apakah push berhasil.
```

## 3. Kalau profilnya berubah
Paling mudah: bilang ke Claude di chat, "Berta sekarang punya X (mis. surat penerimaan, tujuan baru). Perbarui profil fromodyssey."
Claude mengubah `config/profil.md` dan menjelaskan perubahannya. Atau ubah sendiri di GitHub (buka file, pensil, ubah, "Commit changes"),
lalu tambahkan satu baris bertanggal di log bawah. Run scout berikutnya membacanya otomatis.
Kata kunci yang ia tambahkan di aplikasi tersimpan di Drive (`99 Sistem/kata-kunci.json`) dan dibaca scout bila konektor Drive tersedia.
