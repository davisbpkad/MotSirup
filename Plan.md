# Dashboard Monitoring Rekap SIRUP — Plan & Prompt

Lokasi kerja: `~/Documents/SIRUP/DashboardSIRUP`. Lokal saja: `http://127.0.0.1:8788`. Tanpa login aplikasi, tanpa hosting.
Referensi gaya, struktur server, dan pola sinkron: `~/Documents/ActTRK` (`server/chrome.js`, `server/sync.js`, `public/style.css`).
Referensi isi: `~/Documents/SIRUP/Rekap SIRUP_Perubahan 2026.xlsx` (hanya dibaca, jangan diubah).

## Status pelaksanaan — 24 November 2026

- **Fase 0 terblokir.** Profil Chrome yang ditemukan: `Default`. Pemeriksaan database cookie secara read-only tidak menemukan cookie untuk `sirup.inaproc.id` atau `.sirup.inaproc.id`.
- Uji pembaca cookie ActTRK yang diarahkan ke host SIRUP menghasilkan `Cookie SIRUP tidak ada. Login dulu di Chrome.` Tidak ada nilai cookie yang dicetak dan tidak ada permintaan ke SIRUP yang dijalankan karena pemeriksaan awal gagal.
- Cookie domain induk `.inaproc.id` tersedia, tetapi keberadaannya tidak membuktikan sesi SIRUP aktif. Sesi yang hanya berada di memori browser belum diuji.
- Langkah berikutnya: buka SIRUP melalui Chrome biasa, gunakan akun PAKPA BPKAD, pastikan daftar paket TA 2026 terlihat, lalu ulangi spike. Dashboard tetap tanpa login sendiri; login hanya pada situs SIRUP jika sesi belum tersedia.
- Fase 1–3 belum dijalankan sesuai batas berhenti Fase 0. Excel, ActTRK, dan berkas `PPK SITI/` tidak diubah.
- Catatan uji lokal: probe pertama gagal sebelum membaca cookie karena `Module._compile` menerima filename `undefined`. Probe kedua memakai filename string eksplisit dan berhasil mencapai pemeriksaan cookie. Tidak ada kode aplikasi yang dibuat atau diubah.

### Pemeriksaan ulang setelah login

- Sesi PA/KPA aktif terverifikasi melalui browser otomatisasi. Cookie bernama `PLAY_SESSION`; profilnya `~/Library/Caches/ms-playwright-mcp/mcp-chrome-6272f30`, bukan profil Chrome biasa `Default`.
- GET melalui sesi browser berhasil: 178 paket Penyedia (157 terumumkan), 89 paket Swakelola (76 terumumkan), total 233 terumumkan. Jumlah baris sama dengan jumlah yang dilaporkan server.
- Lima detail paket diperiksa. MAK `.1.06.0002` muncul pada paket Sekretariat `69124273`, `69124303`, dan paket UPTD `64221323`, `64220577`, `64217873`. Lokasi membedakan sampel tersebut; konsistensi seluruh 233 paket belum diperiksa ulang.
- Pembaca cookie ActTRK tidak dapat mendekripsi cookie profil otomatisasi (`bad decrypt`), baik dengan pola mock keychain maupun Keychain Chrome biasa. Nilai cookie tidak dicetak atau disimpan. Keberhasilan melalui alat browser tidak membuktikan tombol sinkron pada dashboard mandiri dapat memakai sesi tersebut.
- **Gerbang Fase 0 tetap belum lolos untuk server mandiri.** Jangan lanjut Fase 1–3 sebelum jalur koneksi dipilih. Alternatif yang disarankan untuk persetujuan user: ekstensi Chrome terbatas pada SIRUP dan server lokal, membaca data lewat sesi tab aktif lalu mengirim hanya data paket, bukan cookie. Alternatif lain: gunakan sesi Chrome biasa yang pembaca cookienya terbukti kompatibel.

## 1. Batas

> **Keputusan terbaru (menggantikan rencana cookie di bawah):** gunakan Playwright dengan profil Chrome persisten terpisah per PPK. Dashboard tidak membaca database cookie, tidak memakai ekstensi, dan menolak akun PA/KPA sebagai sumber utama. Identitas login diperiksa; cakupan kepemilikan endpoint dan pemetaan struktur independen masih memerlukan bukti live. Implementasi dan cara menjalankan tersedia di `README.md`; bukti uji tersedia di `docs/verification.md`.

| Hal | Nilai |
|---|---|
| Mode | Hanya GET ke SIRUP. Tidak ada POST, tidak ada ubah paket |
| Auth | Tanpa login dashboard. Sinkron memakai cookie sesi Chrome milik user (pola `ActTRK/server/chrome.js`, `HOST = sirup.inaproc.id`) |
| Rahasia | Cookie dan kata sandi tidak disimpan, tidak dicatat, tidak masuk repo. `credential.md` tidak dibaca |
| Server | Bind `127.0.0.1` saja |
| Stack | Vue 3 file lokal `public/vendor/vue.global.prod.js` + Chart.js lokal. Tanpa build, tanpa CDN, tanpa dependency npm |
| Excel | Tidak diubah. Dibaca lewat skrip impor sekali jalan |

## 2. Sumber data

| Angka | Sumber | Catatan |
|---|---|---|
| **Pagu** (DPPA per subkegiatan) | Excel, sheet `PAGU SIRUP 2026_Perubahan` | Diimpor ke `data/pagu.json` oleh `tools/import_pagu.py` (openpyxl). Kolom: nama, kode, pagu, PPK. Hirarki Program → Kegiatan → Subkegiatan dari panjang kode (`5.02.01` / `.1.06` / `.0002`) |
| **Input** (paket SIRUP aktif) | SIRUP, hasil sinkron | Jumlah pagu paket berstatus `3` (Terumumkan) per subkegiatan |
| Persen | Input ÷ Pagu | Boleh > 100% (kelebihan) dan < 100% (kurang). Pagu 0 tanpa paket = "tidak ada alokasi", bukan 0% |

Endpoint SIRUP (terbukti dipakai sebelumnya):
- Daftar: `/sirup/datatablectr/dataruppenyedia2018?tahun=2026&iDisplayLength=500` dan `/sirup/datatablectr/datarupswakelola2018?...`. Cek `iTotalDisplayRecords === aaData.length`. `aaData`: ID `[0]`, nama `[2]`, pagu `[3]`, status `[9]`.
- Detail: `/sirup/penyedia/ID` dan `/sirup/swakelola/ID`. Baris pendanaan 6 kolom: MAK `[4]`, pagu `[5]`. Lokasi pekerjaan di baris `Lokasi Pekerjaan`.
- Subkegiatan dari MAK: 6 segmen pertama, contoh `5.02.01.1.06.0002`.

Aturan hitung:
- Hanya status `3`. Paket `51` (dibatalkan) dan paket asal revisi tidak dihitung.
- Paket dengan beberapa baris pendanaan: tiap baris dihitung ke subkegiatannya sendiri.
- Kecualikan `5.02.01.1.02.0001` (gaji dan tunjangan ASN).
- Selisih ≤ Rp1 dianggap 100% (pembulatan DPPA, contoh −Rp0,81 sudah terjadi).

## 3. Risiko dan hal belum terbukti

1. **Nama cookie dan masa berlaku sesi SIRUP belum diketahui.** Spike dulu: baca cookie `sirup.inaproc.id` dari Chrome, GET daftar, cek hasil bukan halaman login. Sesi PPK dan PAKPA berbeda; sesi **PAKPA** terbukti melihat seluruh satker, PPK mungkin hanya miliknya.
2. **Kode subkegiatan sama untuk bidang berbeda.** `5.02.01.1.06.0002` ada di Sekretariat (Siti, Rp660.558.037) **dan** UPTD (Agus). Pemisah yang terbukti: lokasi paket (`Sekretariat BPKAD…` vs `Jalan Cilaki 51`). Spike harus memastikan pemisah ini konsisten di 233 paket; paket tanpa pemisah jelas masuk daftar "tidak terpetakan", jangan ditebak.
3. **Pemetaan PPK per paket.** Membaca `paket.id_ppk` dari form edit gagal untuk akun PA. Pemetaan dipakai: subkegiatan (+ bidang) → PPK dari Excel. Bila ternyata ada paket satu subkegiatan dengan PPK berbeda, tampilkan sebagai peringatan.
4. **Waktu sinkron.** 233 paket × detail ≈ 233 GET. Beri jeda 200–300 ms, 4 paralel maksimum, tampilkan progres.
5. Cache lama tetap dipakai bila sinkron gagal (pola `ActTRK/server/sync.js`: tulis atomik hanya jika lengkap).
6. Total Excel dan total SIRUP wajib cocok untuk Sekretariat (Rp7.211.169.026, 62 paket) sebagai uji penerimaan.

## 4. Fase

**Fase 0 — Spike (blok, jangan lanjut sebelum hijau)**
- Skrip baca cookie SIRUP, ambil daftar penyedia + swakelola, cetak jumlah aktif (harapan: 157 + 76 sebelum kini; angka bisa bergeser).
- Ambil detail 5 paket acak, cetak MAK dan lokasi.
- Jika sesi tidak terbaca: hentikan, lapor. Alternatif (tanya user dulu): bookmarklet/ekspor manual.

**Fase 1 — Data**
- `tools/import_pagu.py` → `data/pagu.json`.
- `server/sirup.js` (klien GET + cookie), `server/sync.js` (ambil daftar + detail, bentuk `data/paket.json`), `server/calc.js` (agregasi per PPK → kegiatan → subkegiatan → paket).
- Uji: `test/selfcheck.js` — Sekretariat = Rp7.211.169.026 / 62 paket; pagu 0 ≠ 0%; status `51` tidak dihitung; subkegiatan ganda terpisah.

**Fase 2 — UI Vue**
- Header: judul, waktu sinkron terakhir, tombol **Sinkronisasi** (spinner, toast sukses/gagal, gaya ActTRK).
- Kartu ringkasan: total pagu, total input, selisih, persen BPKAD.
- Filter bidang: Sekretariat, Perben, Aklap, Anggaran, BMD, UPTD.
- Kartu per PPK: nama, pagu, input, persen, bar progres animasi, badge status (merah < 100%, hijau 100%, kuning > 100%, abu tanpa alokasi).
- Drill-down: PPK → Kegiatan (klik → daftar Subkegiatan) → Subkegiatan (klik → daftar Paket: ID RUP, nama, pagu, jenis, tautan ke SIRUP). Transisi `<transition-group>` buka/tutup.
- Grafik: bar persen per kegiatan (dengan garis 100%), donat total BPKAD, bar pagu vs input per PPK.
- Panel "Perlu perhatian": subkegiatan < 100% atau > 100%, paket tak terpetakan.
- Warna `prefers-reduced-motion` dihormati; bisa dipakai keyboard; kontras cukup.

**Fase 3 — Verifikasi**
- `npm test`, buka UI, bandingkan sheet `Rekap SIRUP 2026` Excel dengan UI untuk tiap bidang; catat selisih apa adanya.

## 5. Prompt untuk agen pengerja

> Kerjakan dashboard monitoring rekap paket SIRUP di `~/Documents/SIRUP/DashboardSIRUP`, mengikuti `Plan.md` di folder itu. Pakai `~/Documents/ActTRK` sebagai acuan struktur server, cara baca cookie Chrome, pola sinkron atomik, dan gaya CSS (variabel warna, kartu, toast, tombol sinkron).
>
> Aturan keras: hanya GET ke `https://sirup.inaproc.id`; cookie tidak disimpan atau dicatat; server bind `127.0.0.1:8788`; jangan ubah `Rekap SIRUP_Perubahan 2026.xlsx` maupun file di `PPK SITI/`; jangan baca `credential.md`; Vue 3 dan Chart.js sebagai file lokal, tanpa build dan tanpa CDN.
>
> Mulai dari **Fase 0 (spike)**: buktikan cookie sesi SIRUP terbaca dan daftar paket 2026 terambil, lalu laporkan nama cookie (bukan nilainya), jumlah paket aktif, dan apakah lokasi paket membedakan Sekretariat dan UPTD untuk `5.02.01.1.06.0002`. **Berhenti dan lapor** sebelum Fase 1 bila ada yang gagal.
>
> Lalu Fase 1–3. Aturan hitung: hanya status `3`; subkegiatan dari 6 segmen MAK; kecualikan `5.02.01.1.02.0001`; pagu dari Excel; persen = input ÷ pagu; pagu 0 tanpa paket = "tidak ada alokasi"; selisih ≤ Rp1 = 100%. UI: PPK → Kegiatan → Subkegiatan → Paket dengan dropdown beranimasi, bar progres, tiga grafik (persen per kegiatan, donat total, pagu vs input per PPK), dan tombol Sinkronisasi dengan spinner dan toast.
>
> Selesai bila: `npm test` lulus; total Sekretariat = Rp7.211.169.026 dengan 62 paket; angka tiap bidang dibandingkan dengan sheet `Rekap SIRUP 2026` dan selisihnya dilaporkan apa adanya. Satu file uji saja, tanpa framework. Laporkan apa yang tidak sempat diperiksa.
