# fromodyssey — build spec (shared contract for all builders)

App for **Berta** (Alberta), an anthropologist: Research, Knowledge Management & Campaign Manager at Sokola Institute;
BA Anthropology (Universitas Indonesia); Master of Anthropology and Planetary Futures (ANU, 2026); former research
assistant for a University of Amsterdam (UvA) doctoral project on Orang Rimba education. Work with Orang Rimba (Bukit
Duabelas, Jambi), women's waste-management groups (Semarang), women's groups in Kampung Sodan (Sumba). Interests:
indigenous peoples / masyarakat adat, decolonisation, pluriverse & ontology, gender & sexuality, indigenous education,
soundscape / regenerative listening, multimodal & visual ethnography (film, stop-motion, photography), rural–urban.
Indonesian citizen. Goal: funded PhD and research grants (as individual or through Sokola).

The project directory `/home/claude/fromodyssey` is a copy of a working template (an earlier app for someone else,
English UI, job-hunting focus). **Read the template files you own before rewriting them.** Keep what works.

## Global rules
- Static site, no build step, plain ES modules, hash router. Phone-first (390 px), desktop sidebar.
- **UI language: Indonesian** (santai, hangat, "kamu"; sesekali Inggris untuk istilah akademik; sesekali Jawa ringan
  seperti "monggo", "alon-alon", "ora popo" bila pas). No English UI strings left over. Dates: `id-ID`.
- Storage slug `fromodyssey` (already replaced from `studio`): keys `fromodyssey.v1`, `.theme`, `.drive`, `.analysis`,
  `.reader`, `.pos`, `.mdcache`; events `fromodyssey:saved`, `fromodyssey:stats`.
- **Keep every existing export name and signature** unless this spec says otherwise; other modules import them.
- Only edit the files assigned to you. If you need something from another module, use the contract below and note it
  in your final report. Do not create git commits.
- Nothing personal in the repo: no email addresses, no birth date, no photo of Berta, no Drive folder id, no passcode.
- Pin CDN libraries to exact versions. No new dependencies beyond pdf.js, mammoth (already used) and Google Identity
  Services (`https://accounts.google.com/gsi/client`).
- CSS: use the tokens in `css/theme.css` (owner: shell builder). Each builder may add ONE own stylesheet already
  linked in index.html: `css/radar.css`, `css/learn.css`, `css/read.css`, `css/files.css`, `css/scene.css`.
  Body text contrast ≥ 4.5:1 in both light and night themes. Touch targets ≥ 44 px.
- Verify before finishing: `node --check` on every JS file you touched, JSON parses, your own Node tests pass.
  Report plainly what you could not verify.

## Palette and type (from her favourite photo at Mata Jitu waterfall; jungle, limestone, turquoise pool)
Tokens (light): `--rimba:#1E2A22` (ink) · `--lumut:#46502A` · `--zaitun:#6B6E45` · `--toska:#22756E` (primary, white
text OK) · `--toska-tua:#17524E` · `--kolam:#7FC4B8` · `--buih:#DDF0EA` · `--kapur:#F2EEE2` (page) · `--kartu:#FBF9F2`
· `--batu:#B6B4A1` · `--garis:#DDD8C6` · `--tanah:#8A6B43` · `--oker:#A97C24` · `--rafflesia:#C9563A` (accent/bad)
· `--muted:#5B6452`. Keep the template's generic token names too (`--ink`, `--muted`, `--line`, `--card`, `--paper`,
`--good`, `--warn`, `--bad`, `--indigo`→ toska, `--g-deep`, `--g-warm`, `--g-main`, `--r`, `--shadow`, fonts) mapped
onto these so older CSS keeps working. Night theme: deep forest (`#101812` page, `#18231C` card, text `#E6EBDD`,
primary `#6FC7BA`).
Fonts (Google Fonts): headings + reader serif **Newsreader**; interface **Plus Jakarta Sans**; hand-written accents
(animal speech bubbles, margin notes) **Caveat**; mono JetBrains Mono.
Shape: cards 16 px radius, organic feel (soft "leaf" corner `border-radius:18px 18px 18px 6px` allowed on highlights),
thin limestone-terrace divider motif (stacked 1px lines) instead of heavy borders.

## Navigation (index.html is already written; ids/data-nav are fixed)
`#/home` Rimba (beranda) · `#/radar[/tab]` Peluang · `#/radar/item/<id>` · `#/learn` Belajar · `#/lesson/<id>` ·
`#/read[/tab]` Baca · `#/files[/sub]` Berkas · `#/settings` Aku & pengaturan.

## State (js/util.js DEFAULT_STATE — owner: shell builder)
Template fields stay. Changes/additions:
```js
profile: { name:'Berta', background:'antropolog; S2 Anthropology and Planetary Futures (ANU); peneliti di Sokola Institute',
  keywords:[...default list below], avoid:[], places:['Australia','Belanda','Indonesia'],
  readingInterests:'indigenous OR "masyarakat adat" OR pluriverse OR decolonial OR soundscape' },
customKeywords: [],      // words SHE adds in the app: {w:'kata', at:'YYYY-MM-DD'}; used by scoring, reading, scout
projects: ['Orang Rimba','Sumba','Semarang'],   // field projects, editable; used to file field data
notes: {},               // reflection answers: 'lessonId:stepIdx' -> {text, at}
readDone: {},            // reading pointers ticked: 'lessonId:stepIdx' -> date
sound: false,            // forest soundscape on the home scene
```
Helper to export from util.js: `allKeywords()` → profile.keywords + customKeywords words (lower-cased, unique).
Default keywords: masyarakat adat, indigenous, adat, dekolonisasi, decolonial, pluriverse, ontologi, gender,
pendidikan adat, indigenous education, soundscape, bunyi, listening, multimodal, etnografi, ethnography,
planetary futures, multispecies, Orang Rimba, Sumba, Indonesia, Southeast Asia, anthropology, antropologi.
When customKeywords change and Drive is connected, drive sync writes them inside `progress.json` (normal sync) AND
to `99 Sistem/kata-kunci.json` `{updated, keywords:[...]}` so the weekly scout can read them (owner: drive builder
exposes `pushKeywords()`; shell calls it after edits).

## Data contracts
### data/opportunities.json (robot) and data/agent-radar.json (scout)
```json
{"updated":"ISO","count":0,"sources":0,"report":[{"name":"","count":0,"ok":true,"error":""}],
 "items":[{"id":"","title":"","link":"","org":"","source":"","type":"phd|grant|fellowship|course",
   "summary":"","published":"YYYY-MM-DD","deadline":"YYYY-MM-DD|null","intl":true,"location":"",
   "first_seen":"YYYY-MM-DD","amount":"", "applicant":"individu|lembaga|keduanya|null",
   "why":"(scout only, satu kalimat)","steps":["(scout only)"],"checked":"YYYY-MM-DD (scout only)"}]}
```
Scout ids are prefixed `scout-`; robot ids `r<hash>`. `intl`: true/false/null. Text fields from the scout are in
Indonesian. `applicant`: who should submit — Berta personally, Sokola as an organisation, or either.
### data/funders.json (evergreen registry, "Kalender musim hibah")
```json
{"updated":"YYYY-MM-DD","funders":[{"id":"","name":"","org":"","type":"phd|grant|fellowship","applicant":"individu|lembaga|keduanya",
  "region":"Indonesia|Australia|Belanda|Global|...","url":"","opens":"teks bebas, mis. 'biasanya Jan–Feb'",
  "closeMonths":[2,7],"amount":"","eligibility":"","why":"kenapa cocok buat Berta","notes":"","verified":"YYYY-MM-DD"}]}
```
### Drive server API v3 (apps-script/Code.gs ↔ js/drive.js) — owner: drive builder
One endpoint, `POST` with a JSON string body and **no custom headers**; always HTTP 200 JSON `{ok:false,error}` on
failure. Auth: every request carries `session` (preferred) or `key` (passcode fallback, only if PASSCODE is set).
- `login {idToken}` → server verifies the Google ID token at `https://oauth2.googleapis.com/tokeninfo?id_token=`,
  checks `aud === CLIENT_ID`, `email_verified`, email ∈ ALLOWED_EMAILS → `{ok, session, email, name, exp}`.
  Session = `base64url(email|exp) + '.' + base64url(HMAC-SHA256(secret))`, valid 30 days; secret auto-generated into
  Script Properties. Constants at top of Code.gs: `ROOT_ID`, `CLIENT_ID`, `ALLOWED_EMAILS` (array), `PASSCODE` ('' =
  passcode login disabled). Repo copy holds placeholders only.
- `ping` → `{ok, version:3, root, email}`
- `tree {}` → `{ok, folders:[{id,name,parent,path}], files:[{id,name,parent,path,mime,size,updated,url}]}` whole
  root, recursive (cap 5000), `path` relative to root. This is the source of truth for the Berkas page.
- `list {path}` (kept) · `put {path, text|b64, mime}` → `{ok,file}` · `get {id|path, as?:'b64'}` ·
  `del {id|path}` (to bin; never the root or the system folder) · `move {id|from, to}` (`to` = new full path;
  renames too; creates folders) · `mkdir {path}` · `fetch {url}` (advert proxy, 700k chars).
- Big files (recordings): `upStart {path, mime, size}` → `{ok, uploadId}` (server opens a Drive resumable session with
  its own OAuth token and keeps the session URL in CacheService; the token never reaches the browser);
  `upChunk {uploadId, offset, b64, last}` → `{ok, received}` and on the last chunk `{ok, done:true, file}`. Chunks are
  multiples of 256 KB (client uses 4 MB). Client falls back to `put` under 6 MB.
- System folder: `99 Sistem` is created on first call and its **folder id is stored in Script Properties**, so it is
  found by id even if renamed/moved. System files: `progress.json`, `files-index.json`, `kata-kunci.json`,
  `cache-peluang/<id>.md`, `aset/` (optional images, e.g. `mata-jitu.jpg`). `asset {name}` → `{ok,b64,mime}` from `aset/`
  or the root.
- `js/config.js` (already written) exports `CFG = { GOOGLE_CLIENT_ID, DRIVE_URL }`. If `CFG.DRIVE_URL` is set the app
  needs no manual URL entry: "Masuk dengan Google" is enough. A manual URL/passcode field stays as fallback, and the
  old connect link `#/connect/<code>` keeps working.

### Folder map (js/folders.js — owner: drive builder). Indonesian names, two-digit prefixes.
```
00 Kotak Masuk/
01 Peluang/Lamaran/
02 Dokumen Pribadi/{CV & Surat, Ijazah & Transkrip, Proposal & Draf, Rekomendasi, Lainnya}/
03 Data Lapangan/<Proyek>/{Catatan Lapangan, Rekaman, Transkrip, Foto & Video, Dokumen}/
04 Bacaan/<Topik>/
05 Tulisan Sendiri/
99 Sistem/
```
The file index is keyed by **Drive file id**, not path. She may move/rename anything in Drive itself; the app's
"Sinkronkan dengan Drive" (and an automatic check on opening Berkas) calls `tree`, reconciles by id (updates paths,
drops deleted, adopts unknown files by classifying them from name/mime), and never breaks. Paths in the index are
display-only.

### Home scene (js/scene.js + css/scene.css — owner: lead; shell builder only calls it)
```js
import { mountScene } from './scene.js';
const scene = mountScene(containerEl, {
  name, energy,                       // 'low'|'normal'
  opps: [{title, href, pr, verdict, deadlineText}],   // top few, may be []
  newCount,                           // number of unseen opportunities
  joke: () => string,                 // returns a fresh joke
  lesson: {title, href} | null, reviewCount, streak,
  deadlines: [{title, href, days}],   // tracker items due soon
  paper: {title, href} | null,
  onEnergy: (v) => {}, onSound: (on) => {}, sound: boolean,
});   // returns { destroy() }
```
The scene is the hero of `#/home`; below it the shell renders ordinary cards (same information, accessible, for when
the painting is skipped): "Langkah berikutnya", peluang teratas, pelajaran berikutnya, bacaan hari ini.

## Jokes (js/jokes.js — owner: shell builder). ~45 one-liners, Indonesian, anthropology humour first.
Tone: teman antropolog yang jahil; never mean to communities; political jabs aim at power, policy and absurd
situations, not at ordinary people; no invented quotes from real people. Mix in some of these seeds (rewrite freely):
- "Observasi partisipan hari ini: antre gas tiga jam di Sumba. Temuan sementara: yang langka bukan cuma gasnya, tapi juga kesabaran."
- "Sumur kering lagi. Undangan resmi: nyuci bareng di Waikacura. Dress code: sarung. Bawa sabun dan catatan lapangan."
- "Geertz bilang kebudayaan itu jaring makna. Di republik ini jaringnya dipegang yang itu-itu saja."
- "Makan siang gratis itu contoh sempurna teori pemberian Mauss: tidak ada pemberian yang benar-benar gratis."
- "Kabinetnya gemuk sekali, sampai-sampai Malinowski pun bingung mau mulai observasi dari kementerian yang mana."
- "Kata Presiden semua baik-baik saja. Kata informan di lapangan: 'Baik-baik saja itu di sebelah mana, Kak?'"
- "Thick description: deskripsi tebal. Thin budget: anggaran riset kita."
- "Reviewer 2 adalah bukti bahwa ritual inisiasi masih hidup di masyarakat modern."
- "Emik: 'ini sakral'. Etik: 'ini menarik'. Pemda: 'ini bisa jadi destinasi wisata'."
- "Dekolonisasi dimulai dari daftar pustaka. Lalu dari grup WhatsApp keluarga."
Keep `JOKES`, `jokeOfDay(offset)`, `randomJoke()`.
