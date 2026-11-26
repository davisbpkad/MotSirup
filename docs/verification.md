# Bukti implementasi dan verifikasi

## Toast sinkronisasi dan filter grafik — 25 November 2026

- Akar masalah toast: polling memilih error dari seluruh job, termasuk error lama PPK lain. Polling sekarang mengikuti PPK yang memulai sinkronisasi; sukses hanya tampil setelah pembacaan data terbaru berhasil dan job berfase `Selesai` tanpa error. Hasil yang tidak terbaca atau job yang hilang tidak dianggap sukses.
- Grafik status dan tombol legenda memfilter anak subkegiatan. Parent terkait terbuka otomatis; filter PPK dan pencarian tetap beririsan. Dropdown status dan tombol hapus menyediakan alternatif keyboard. Klik ulang kategori melepas filter; klik batang memilih/melepas PPK.
- Grafik status tetap merangkum seluruh anak PPK terpilih, bukan hasil pencarian/status tabel. Nominal parent tetap total seluruh anak, dijelaskan pada UI. Tidak ada perubahan rumus pagu, snapshot, atau paket SIRUP.
- Ekspor PNG tabel mengirim dan memvalidasi filter status, mempertahankan parent/anak yang ditutup atau dibuka, serta menunggu transisi selesai sebelum mengambil gambar.
- RED awal: tes Vue gagal menemukan tombol legenda dan tes toast gagal menemukan konfirmasi berhasil. GREEN: 25 tes lulus; coverage server 92,40% baris, 92,33% cabang, 88,10% fungsi. JavaScript browser diuji lewat E2E, bukan coverage Node.
- Smoke read-only pada `http://127.0.0.1:8788/`: 375/768/1440 piksel, kategori `target-kosong` menampilkan tepat satu anak, tanpa overflow halaman atau page error. Screenshot lokal sementara `sirup-filter-375.png`, `sirup-filter-768.png`, `sirup-filter-1440.png`; tidak masuk Git. Sebelum/sesudah restart: TA 2026, 216 paket, input 7.025.856.044.900 sen, revisi 0.
- Tes tambahan menangkap penutupan parent saat filter aktif: DOM transisi masih berisi anak sebelum screenshot. Ekspor sekarang menunggu elemen transisi hilang. Tes UI dibatasi timeout 5 detik dan menutup koneksi fixture agar kegagalan tidak menggantung suite.
- Batas: sinkronisasi nyata tidak dijalankan ulang; sukses/gagal diuji dengan fixture tanpa menulis data privat. Chrome saja; audit axe, Core Web Vitals, dan regresi pixel berbasis baseline tidak dijalankan. Proyek tidak menyediakan build, TypeScript, atau lint script terpisah. Tidak ada commit/push.

Evaluasi mandiri: akurasi **4/5** (regresi dan smoke lulus, sinkron nyata belum diulang); kelengkapan **4/5** (toast, grafik, keyboard, dan ekspor tercakup; lintas browser belum diuji); kejelasan **4/5** (filter aktif dan total parent dijelaskan, kenyamanan perlu penilaian pengguna); dapat digunakan **4/5** (tersedia lokal, perlu refresh tab lama); ringkas **4/5** (tanpa dependensi baru, perubahan terbatas pada UI/ekspor/tes). Rata-rata **4,0/5**. Peningkatan berikutnya: amati toast pada sinkronisasi normal pengguna, lalu uji Safari/Firefox jika diperlukan.

## Lingkup

Sumber: `Plan.md`, dengan perubahan yang disetujui dalam percakapan: Playwright berprofil persisten per PPK, bukan dekripsi cookie atau ekstensi. Identitas akun menjadi dasar pemilik, MAK hanya dasar pengelompokan dengan peringatan.

Tidak ada workbook, file `PPK SITI/`, paket SIRUP, atau aplikasi ActTRK yang diubah. Target Excel diimpor read-only; SHA256 sumber: `9ecaa742d41072106845e7982ab283151523c429f36d5ccbea624debd5762072`.

## TDD

1. Tes ditulis sebelum modul hitung dibuat. `npm test` pertama gagal dengan `Cannot find module '../server/calc'` karena implementasi belum ada.
2. Tes regresi fixture Siti menemukan 48, bukan 62 paket. Penyebab: audit publik lama tidak berisi funding Swakelola karena tata letak lima kolom berbeda dari Penyedia enam kolom. Fixture dilengkapi dari audit detail historis; parser produksi menangani kedua tata letak dan menguji rekonsiliasi jumlah pendanaan.
3. Tes baru untuk nama kegiatan daftar yang bertentangan dengan MAK gagal (`10000 !== 0`). Pemeriksaan bersama ditambahkan pada agregator agar paket tetap pada total PPK tetapi dikarantina dari subtotal target.
4. Tes UI menemukan pemeriksaan overflow terlalu dini setelah resize. Tes menunggu layout responsif selesai dan menguji ulang 375, 768, dan 1440 piksel. Kontainer panel dibatasi agar tabel lebar hanya menggulir di wilayah tabel.

## Jaminan yang diuji

| Perilaku | Bukti | Jenis |
|---|---|---|
| PA/KPA, PPK salah, satker salah, dan nama kosong ditolak | `test/selfcheck.js` | Unit |
| Daftar terpotong, ID ganda, nominal tidak valid ditolak | `test/selfcheck.js` | Unit |
| Detail harus sesuai ID/tahun/pagu dan jumlah funding | `test/selfcheck.js` | Unit |
| Pagu nol, pagu kosong, dan toleransi sen ditangani terpisah | `test/selfcheck.js` | Unit |
| Kode sama lintas PPK tidak digabung; belum sinkron bukan nol | `test/selfcheck.js` | Unit |
| MAK salah/tidak berpasangan tetap pada total PPK, bukan subtotal target | `test/selfcheck.js` | Unit |
| Nama kegiatan/struktur subkegiatan yang bertentangan dikarantina | `test/selfcheck.js` | Unit |
| Pembatalan/draft dan gaji ASN tidak masuk total efektif | `test/selfcheck.js` | Unit |
| ID lintas akun tidak dihitung dua kali | `test/selfcheck.js` | Unit |
| Snapshot gagal tidak merusak cache sebelumnya atau PPK lain | `test/selfcheck.js` | Unit/integrasi |
| Dua format funding terparse tanpa menjalankan script target | `test/selfcheck.js` | Integrasi Playwright |
| Perubahan daftar di tengah sinkron menggagalkan commit | `test/selfcheck.js` | Integrasi |
| Fixture Siti menghasilkan 62 paket Rp7.211.169.026, target Rp7.211.169.026,23 | `test/siti-audit.json` | Regresi historis |
| Vue menampilkan 6 PPK, filter 7 kegiatan Siti, membuka 10 paket `.06.0002` | `test/selfcheck.js` | E2E lokal |
| Cari ID, hasil kosong, toast kesalahan, reduced-motion, dan 3 lebar layar | `test/selfcheck.js` | E2E lokal |

## Hasil dan batas

- Hasil final `node --test --experimental-test-coverage test/selfcheck.js`: **14 PASS, 0 FAIL**, 3,27 detik.
- Coverage final: **90,91% baris, 94,33% cabang, 93,85% fungsi** untuk modul server yang dimuat oleh tes. `server/index.js` dan JavaScript yang berjalan di browser tidak termasuk angka ini; UI diuji E2E dengan Chrome headless.
- Audit npm menemukan kerentanan Vue 3.5.30. Versi dinaikkan ke 3.5.46; instalasi ulang melaporkan 0 kerentanan.
- Browser produksi khusus Siti berhasil dibuka melalui API lokal. Belum ada login PPK pada profil baru yang diverifikasi. Tidak ada snapshot produksi yang diklaim dari fixture.
- API lokal mengikat loopback. Probe HTTP langsung lulus: Origin asing, token salah/hilang, dan Host asing ditolak 403; path data/profil/server/README tidak disajikan (404). Probe Host menggunakan `node:http` karena `fetch` Node tidak meneruskan Host palsu seperti yang diasumsikan probe pertama.
- Tampilan aktual tanpa snapshot diperiksa pada 1440 dan 375 piksel: tidak ada page error atau overflow halaman. Screenshot lokal: `data/dashboard-desktop.png`, `data/dashboard-mobile.png`.
- Uji sinkron nyata SIRUP, cakupan endpoint per PPK, pemetaan struktur subkegiatan independen, dan perbandingan data live semua bidang terhadap Excel **belum selesai**. Tidak ada klaim kelengkapan produksi.

## Popup detail paket — 24 November 2026

Permintaan: nama paket membuka popup bergaya ActTRK, termasuk transisi dan penutupan melalui klik di luar dialog. Perubahan hanya pada agregasi data tampilan, Vue, CSS, pengujian, dan dokumentasi; tidak ada endpoint baru atau pengambilan SIRUP tambahan.

- RED: `node --test --test-name-pattern='popup data|Vue drill' test/selfcheck.js` menghasilkan 2 FAIL: `packageAmount` belum tersedia dan tombol pemicu popup belum ada.
- GREEN: `node --test --experimental-test-coverage test/selfcheck.js` menghasilkan **17 PASS, 0 FAIL**. Coverage modul server yang dimuat: **90,98% baris, 94,92% cabang, 93,94% fungsi**. Angka ini tidak mencakup `server/index.js` atau JavaScript browser.
- `test/selfcheck.js` menguji pagu total versus alokasi pendanaan tanpa perubahan total rekap; popup Penyedia dan Swakelola; panel paket bermasalah; Escape; tombol Tutup; klik luar dengan fallback tanpa `closedby`; klik dalam; drag dari dalam ke luar; fokus terkurung dan kembali ke pemicu; reduced motion; transisi normal; serta lebar 375/768/1440 piksel. Payload `<img ... onerror=...>` tampil sebagai teks dan tidak dieksekusi.
- Smoke test dashboard aktual lulus pada 1440 dan 375 piksel tanpa page error. Screenshot: `data/package-popup-desktop.png` dan `data/package-popup-mobile.png`. Screenshot desktop mencakup seleksi teks dari pengujian drag, bukan styling popup.
- Server dimulai ulang saat tidak ada sinkron aktif. Enam snapshot tetap tersedia; jumlah dan nominal tiap PPK sebelum/sesudah restart sama. Tidak ada sinkron ulang, perubahan workbook, perubahan ActTRK, atau perubahan paket SIRUP.
- Batas: popup menampilkan snapshot lokal, bukan detail live. Uraian, spesifikasi, metode, dan jadwal belum disimpan; tautan sumber tetap tersedia. Uji browser memakai Chrome, belum Safari/Firefox. Styling menyalin ukuran, backdrop, easing, durasi, dan pola kartu ActTRK; bukan perbandingan pixel otomatis.

Evaluasi popup: akurasi **4/5** (tes nominal dan escaping lulus; lokasi masih teks tabel hasil parser); kelengkapan **4/5** (interaksi diminta lulus; lintas-browser belum diuji); kejelasan **4/5** (label total/alokasi dan batas snapshot jelas; lokasi dapat dirapikan); dapat digunakan **5/5** (server aktual siap tanpa sinkron ulang); ringkas **4/5** (tanpa dependency/endpoint baru; CSS tetap mengikuti format padat proyek). Rata-rata **4,2/5**. Prioritas berikutnya hanya jika dibutuhkan: validasi Safari/Firefox, lalu perapian parser lokasi. Penilaian user tetap diperlukan untuk kesamaan rasa animasi dengan ActTRK.

## Konfigurasi TA, ekspor PNG, dan detail asli — 24 November 2026

Kriteria dari permintaan user: pagu kegiatan dijumlahkan dari subkegiatan; nonaktif keluar dari cakupan aktif tetapi paket tidak dihapus; tiap TA terisolasi; kedua bagian laporan dapat diekspor; popup menampilkan isi asli halaman SIRUP.

| Jaminan | Bukti |
|---|---|
| Pagu subkegiatan tersimpan dalam sen; kosong berbeda dari nol; kegiatan dihitung otomatis | Unit konfigurasi dan E2E simpan `250.25` rupiah menjadi `25025` sen |
| Nonaktif kegiatan/anak mengeluarkan target serta input dari progres, mempertahankan paket pemeriksaan | Regresi `inactive targets leave active totals...` |
| TA baru memiliki struktur salinan dengan pagu kosong, tanpa snapshot lama | Unit `annual settings...`, E2E TA 2027, dan pemisahan direktori snapshot |
| Konfigurasi atomik dengan satu cadangan; arsip TA tidak dihapus; revisi lama ditolak | Unit konfigurasi dan HTTP pada server sementara |
| PNG kartu dan rekap mengikuti PPK/pencarian, membuka seluruh rincian | Unduhan E2E kedua PNG; signature dan dimensi diperiksa; smoke aktual filter Siti |
| Detail asli berisi teks dan tabel dari SIRUP, bukan HTML mentah | Parser dua format funding, jadwal tabel, escaping payload, gagal/coba lagi, validasi ID/TA |
| Endpoint hanya lokal dengan token/Origin; ekspor tidak dapat membuka URL/profil lain | E2E HTTP 403 tanpa token, 400 TA/revisi salah, aset privat 404; export route allowlist |

RED sebelum implementasi: pengujian nonaktif masih menghitung `10000` bukannya `0`; modul konfigurasi belum ada; parser belum mengembalikan nama/field asli. Pengujian UI pengaturan belum menemukan tombol. GREEN final: `node --test --experimental-test-coverage test/selfcheck.js`: **21 PASS, 0 FAIL**; coverage **92,06% baris, 92,92% cabang, 86,79% fungsi** untuk modul server, termasuk server HTTP anak proses. Kode callback browser tidak masuk coverage V8 Node; perilakunya diuji E2E.

Smoke aktual tanpa simpan pengaturan produksi:

- Popup contoh Penyedia `69137601`: nama paket makanan/minuman, pagu Rp6.435.000, uraian Konsumsi Diklat, spesifikasi perhitungan, PDN/UMK, Pengadaan Langsung, dan tiga tabel jadwal November/Desember 2026 cocok dengan halaman publik.
- Swakelola `43902515`: tipe/penyelenggara Swakelola, volume, uraian, pendanaan, total Rp27.300.000, dan jadwal terbaca.
- Request anonim Playwright ditolak Cloudflare 403; HTTP GET native Node berhasil 200. Pembaca detail publik memakai GET Node ke URL tetap, redirect ditolak, timeout 30 detik, ukuran maksimum 2 MB; HTML diparse di halaman kosong tanpa script/resource target. Pengumpul sinkron login tetap memakai context request sebelumnya.
- Screenshot `data/settings-desktop.png`, `data/settings-mobile.png`, `data/package-original-detail.png`; PNG unduhan aktual `data/export-progres-siti.png` dan `data/export-rekap-siti.png`. Sampel PNG awal masing-masing 1376×459 dan 1376×1033 piksel; caption waktu sinkron kemudian diperluas.
- Enam snapshot legacy tidak ditulis atau dipindah. Sebelum restart final: TA 2026, 233 paket, input 7.280.104.097.000 sen, revisi konfigurasi 0. Konfigurasi produksi tidak disimpan selama tes. Workbook, profil, ActTRK, dan paket SIRUP tidak diubah.

Batas: satu PNG maksimal tinggi 30.000 piksel; gunakan filter PPK untuk laporan besar. Tidak ada UI pergantian orang PPK, versi Murni/Perubahan, impor Excel tahunan, atau riwayat konfigurasi penuh. Pengaturan menyimpan satu cadangan sebelumnya; arsip permanen perlu salinan manual. Menonaktifkan target mengubah cakupan, bukan memperbaiki MAK. Detail live dapat berubah sesudah sinkron dan tidak memperbarui rekap otomatis. Safari/Firefox belum diuji.

Evaluasi: akurasi **4/5** (contoh live dan nominal cocok; audit MAK bukan cakupan); kelengkapan **4/5** (semua fitur diminta tersedia, pengelolaan pergantian orang masih saran); kejelasan **4/5** (live versus snapshot dan target aktif berlabel; form konfigurasi panjang); dapat digunakan **5/5** (server aktif, unduhan aktual lulus); ringkas **4/5** (tanpa dependency baru, memakai Chrome/Node yang ada). Rata-rata **4,2/5**. Prioritas lanjutan: penugasan PPK per TA, versi anggaran, lalu arsip perubahan; tidak ditambahkan tanpa keputusan user. User tetap perlu menilai kenyamanan form dengan data tahun berikutnya.

## Parent kegiatan, CRUD anak, dan popup tanpa ringkasan — 24 November 2026

Permintaan: kegiatan menjadi entitas parent; anak memilih parent yang sudah ada pada create/update, berpindah grup otomatis, dan mendukung delete. Permintaan susulan: hapus seluruh bagian **Ringkasan dashboard · snapshot sinkron** dari popup. Struktur tetap per PPK/TA seperti UI sebelumnya; tidak ada DB baru.

RED: `node --test --test-name-pattern='parent activities|settings UI' test/selfcheck.js` menghasilkan dua kegagalan: `activities` belum tersedia dan tombol **Tambah kegiatan** belum ada. RED susulan: tes Vue menolak teks `Ringkasan dashboard · snapshot sinkron`, tetapi popup lama masih menampilkannya.

GREEN: `node --test --experimental-test-coverage test/selfcheck.js`: **22 PASS, 0 FAIL**. Coverage server **92,63% baris, 92,91% cabang, 88,14% fungsi**. Callback browser diuji lewat E2E, bukan coverage V8 Node.

| Jaminan | Bukti |
|---|---|
| Migrasi legacy pagu/settings tanpa menulis sumber saat baca | Unit `parent activities migrate...`, byte file sumber dibandingkan sebelum/sesudah baca |
| Parent tersimpan terpisah, anak memakai `activityId` tanpa duplikasi nama | Unit memeriksa JSON tersimpan serta label agregasi |
| Create/update/delete parent-anak, pindah grup lewat dropdown, awalan kode mengikuti parent | E2E settings pada server fixture, termasuk ubah kode parent dan batal konfirmasi hapus |
| Parent beranak tidak dapat dihapus; referensi lintas PPK, kode salah/ganda ditolak | Unit validasi server dan E2E pesan larangan |
| Kegiatan kosong dapat tersimpan; nonaktif dan arsip TA tetap konsisten | Unit agregasi, simpan 2026/2027, dan tes TA lama |
| MAK lama tidak dipaksakan ke kode baru; paket/snapshot tidak dihapus | Unit paket tetap berada di pemeriksaan sesudah kode target dipindah |
| Popup hanya detail asli, error/coba lagi dan tautan sumber tetap bekerja | E2E Vue: tidak ada judul/nilai ringkasan, field live di-escape, detail lama hilang saat error |
| Tampilan desktop/mobile dan akses keyboard tetap bekerja | E2E lebar 375/768/1440, Escape/klik luar/fokus/reduced motion |
| PNG tetap tersedia setelah refactor struktur | Dua unduhan PNG diuji signature dan ukuran pada server fixture |

Sebelum restart, data kerja: TA 2026, revisi 0, 233 paket, input 7.280.104.097.000 sen, target 7.025.856.044.898 sen; 18 parent hasil normalisasi, `data/settings.json` belum ada. Uji simpan/hapus dijalankan hanya pada fixture.

Smoke setelah restart: dashboard aktual menampilkan tujuh kegiatan Siti beserta dropdown parent anak; desktop 1440 dan mobile 375 tanpa overflow form. Detail live `69137601` menampilkan Konsumsi Diklat dan Pengadaan Langsung, tanpa ringkasan snapshot. Screenshot pengaturan dan popup diperbarui. SHA256 `data/pagu.json`, enam snapshot legacy, serta status keberadaan `settings.json` sama dengan sebelum restart; jumlah/input/target tidak berubah. Pengaturan produksi tidak disimpan dan tidak ada page error.

Evaluasi mandiri: akurasi **4/5** (22 tes lulus; audit kepemilikan/MAK tetap di luar scope); kelengkapan **4/5** (CRUD dan popup sesuai; pengujian browser terbatas Chrome); kejelasan **4/5** (kode parent mengikuti struktur resmi, risiko target lama dijelaskan dalam form); dapat digunakan **4/5** (tes simpan terisolasi, data kerja sengaja tidak disimpan); ringkas **4/5** (tanpa dependency/DB baru, satu helper struktur untuk migrasi dan agregasi). Rata-rata **4,0/5**. Peningkatan berikutnya: validasi langsung kode ganda di UI, bukan menunggu simpan; uji Firefox/Safari. Penilaian kenyamanan form tetap memerlukan pengguna.

## PNG tabel mengikuti dropdown — 24 November 2026

Permintaan: ganti ekspor panel rincian menjadi gambar tabel saja, mengikuti kegiatan/subkegiatan/paket yang dibuka pengguna. Filter dan pencarian tetap dipakai. Tidak ada perubahan data atau ekspor kartu PPK.

RED: `node --test --test-name-pattern='table PNG' test/selfcheck.js` gagal karena target masih `.details-section`, bukan `.details-section .table-scroll`.

GREEN: `node --test --experimental-test-coverage test/selfcheck.js`: **23 PASS, 0 FAIL**, coverage server **92,70% baris, 93,55% cabang, 89,08% fungsi**.

- Regresi memeriksa elemen yang benar-benar di-screenshot: header tabel ada, grafik/caption/judul panel tidak ada.
- Status semua tertutup, hanya kegiatan terbuka, kegiatan dan paket terbuka, serta anak terbuka di bawah parent tertutup menghasilkan jumlah baris sesuai.
- Filter PPK dan pencarian membatasi isi; pencarian kosong hasil tetap menghasilkan tabel dengan pesan tanpa hasil.
- Status dropdown yang dikirim UI diperiksa pada request unduhan aktual. Ekspor tidak mengubah status dropdown layar.
- Payload dropdown bertipe salah, anggota bukan string, string lebih dari 200 karakter, atau lebih dari 4000 kunci ditolak sebelum Chrome diluncurkan.
- Kedua jenis PNG tetap diuji signature/dimensi. Batas tinggi 30.000 piksel tetap berlaku; PNG tabel tidak mencantumkan TA/timestamp di luar tabel sesuai permintaan.

Smoke aktual setelah restart: unduhan filter Siti semua tertutup **1330×476**, kegiatan Administrasi Umum dibuka **1330×1033**, lalu paket subkegiatan `5.02.01.1.06.0002` dibuka **1330×1974**. File `data/export-tabel-tertutup.png`, `data/export-tabel-subkegiatan.png`, dan `data/export-tabel-paket.png`. Gambar tertutup diperiksa visual dan sesuai tabel contoh, tanpa panel/grafik/caption. Status dropdown UI tetap satu kegiatan dan satu subkegiatan terbuka. Data tetap 233 paket, input 7.280.104.097.000 sen, revisi 0; tidak ada page error.

Evaluasi: akurasi **4/5** (snapshot DOM dan PNG nyata lulus; browser selain Chrome belum diuji); kelengkapan **4/5** (tabel/filter/dropdown lengkap, batas tinggi tetap); kejelasan **4/5** (tombol menjadi **Ekspor PNG tabel**, metadata sengaja tidak ada); dapat digunakan **4/5** (unduhan diuji, konfigurasi produksi tidak disentuh); ringkas **4/5** (menggunakan renderer yang ada, tanpa dependency baru). Rata-rata **4,0/5**. Peningkatan opsional: uji lintas browser dan penomoran halaman jika kelak diminta laporan di atas batas tinggi. Pengguna tetap perlu menilai kesesuaian visual gambar.

## Ikon, donut progres, dan pengisian credential SPSE — 24 November 2026

Permintaan UI: tombol tambah/hapus menjadi ikon dengan tooltip; pengaturan gear di kanan atas; hapus label Lokal/hanya baca dan grafik batang kegiatan; donut proporsional di kolom progres. Permintaan berikutnya mengizinkan pembacaan `credential.md` untuk pengisian username/password, menggantikan batas login manual sebelumnya. Pengiriman login dan navigasi sesudahnya tetap dilakukan pengguna.

RED UI: tes Vue menemukan tiga canvas (diharapkan dua); tes ekspor menemukan nol donut; tombol gear belum tersedia. RED login: modul `server/login` belum tersedia. GREEN final: `node --test --experimental-test-coverage test/selfcheck.js`: **24 PASS, 0 FAIL**, server **92,31% baris, 92,29% cabang, 88,80% fungsi**. Callback `page.evaluate` diuji browser dan tidak terhitung coverage Node.

Jaminan dari tes:

- Ikon SVG memiliki nama aksesibel, title, tooltip fokus; tombol CRUD tetap menjalankan aturan/konfirmasi sebelumnya. Form cocok pada 375/768/1440.
- Grafik kegiatan terpisah tidak ada; donut kegiatan/anak ikut PNG. Nilai 0/50/139,31/null menghasilkan isi 0/50/100/0; label menyimpan persentase asli dan membedakan belum tersedia dari nol.
- Connect menuju tepat `https://spse.inaproc.id/jabarprov`, profil tetap terpisah PPK. Listener dokumen login mengisi tahap berikut yang dibuka pengguna tanpa klik submit.
- Fixture credential per PPK mengisi hanya akun terpilih. Origin/path salah dan action form eksternal tidak menerima nilai. Form tahap username saja tetap bekerja. Tidak ada POST login otomatis dalam uji autofill.
- File hilang/kosong memakai manual; JSON rusak ditolak tanpa menggemakan isinya; izin 0644 ditolak. `/credential.md` menghasilkan HTTP 404. Template kosong proyek dibuat dengan izin 0600 dan pola ignore Git.

Inspeksi anonim SPSE: halaman utama menyediakan LOGIN, NON PENYEDIA melakukan pemilihan tipe lalu diarahkan `/jabarprov/login`; tahap awal berisi `input[name=txtUserId]`, form action `/jabarprov/login`. Tidak ada username/password nyata dipakai atau login nyata dikirim. Browser headless anonim gagal memuat alur penuh; GET native dan pemilihan jenis pengguna anonim berhasil mengidentifikasi tahap awal. Tahap password aktual belum diverifikasi dengan akun nyata; aplikasi hanya mengisi bila dokumen/action tetap pada path login resmi. CAPTCHA/OTP, tombol lanjut/login, serta membuka SIRUP tetap manual. Jika SPSE mengubah path/markup, isi manual; tidak ada upaya melewati challenge.

Smoke aktual setelah restart: gear, tooltip, ikon CRUD, mobile, tujuh donut kegiatan Siti, dan PNG tabel donut lulus. Screenshot `data/dashboard-icon-donut.png`, `data/settings-icons-desktop.png`, `data/settings-icons-mobile.png`, `data/progress-donuts.png`, `data/export-tabel-donut.png`. Credential HTTP 404, mode 0600. Data tetap 233 paket, input 7.280.104.097.000 sen, revisi 0; konfigurasi produksi tidak disimpan. Tidak ada page error.

Review keamanan: credential tidak masuk response/log/snapshot/PNG; file symlink/ukuran lebih dari 64 KB ditolak; form dibatasi HTTPS origin/path dan diperiksa ulang tepat sebelum pengisian. Risiko tersisa: file teks biasa serta profil sesi harus dilindungi pengguna. Form tahap selanjutnya yang berbeda path tidak diisi; kegagalan listener tidak mencetak exception yang mungkin memuat informasi sensitif.

Evaluasi: akurasi **4/5** (24 tes lulus, tahap password nyata belum diuji); kelengkapan **4/5** (UI dan template tersedia, login nyata perlu pengguna); kejelasan **4/5** (tooltip dan README menjelaskan tahap manual); dapat digunakan **4/5** (server aktif, template kosong siap diisi); ringkas **4/5** (dua komponen UI kecil, satu modul login, tanpa dependency). Rata-rata **4,0/5**. Prioritas verifikasi berikutnya: pengguna mengisi satu akun dan membuka tahap password resmi; tidak merekam screenshot/trace saat credential terisi.

## Header, insight status, transisi, dan favicon — 25 November 2026

Permintaan diterjemahkan menjadi jaminan: kontrol sinkron berada di header dan proporsional; pembuka dihapus; footer tunggal di tengah; hapus anak berada di header anak; grafik tetap ada dengan kategori yang jelas; tombol/dialog/toast memakai transisi ActTRK; favicon proyek menjadi ikon tab dan logo header.

Referensi ActTRK diperiksa read-only melalui stylesheet browser pada `http://127.0.0.1:8787/`: warna tombol 0,2 detik, skala tekan 0,97, `cubic-bezier(.22,1,.36,1)`, dialog 0,28 detik dengan `cubic-bezier(.34,1.56,.64,1)`. Tidak ada file atau data ActTRK diubah.

RED: `node --test --test-name-pattern='Vue|settings UI' test/selfcheck.js` menghasilkan dua kegagalan yang diharapkan: pembuka masih ada (`1 !== 0`) dan header hapus anak belum tersedia (`0 !== 1`). RED favicon: tes settings menghasilkan HTTP `404 !== 200`. GREEN final: `node --test --experimental-test-coverage test/selfcheck.js`, **24 PASS, 0 FAIL**, cakupan server **92,33% baris, 92,29% cabang, 88,80% fungsi**. Tes frontend menjalankan kode di Chrome; angka coverage Node tidak mengukur callback browser.

| Jaminan | Bukti | Hasil |
| --- | --- | --- |
| Kontrol desktop satu baris; footer tunggal rata tengah; pembuka tidak ada | Tes Vue, pengukuran bounding box dan computed style | PASS |
| Tujuh kategori status terpisah; jumlah tengah benar; kondisi kosong dan pencarian tabel tidak menyesatkan | Fixture tujuh status, masing-masing satu; total 7; kondisi tanpa subkegiatan | PASS |
| Hapus anak berada di header; Batal/Escape tidak menghapus; konfirmasi menjalankan CRUD draft | Tes settings memakai dialog aplikasi, penyimpanan fixture terisolasi | PASS |
| Dialog detail/pengaturan/konfirmasi serta toast/tombol memiliki transisi; reduced motion mematikannya | Computed style, animasi saat tutup detail dan dismiss toast, tes fokus detail | PASS |
| Favicon asli dilayani PNG, dipakai header/tab, tanpa salinan atau modifikasi sumber | Tes membandingkan byte HTTP dengan `favicon.png`, memeriksa link dan gambar berhasil dimuat | PASS |
| Ekspor PNG tetap mengikuti filter dan dropdown | Tes ekspor hierarki dan ekspor API fixture | PASS |

Smoke produksi: ukuran 375/768/1024/1100/1200/1440 tidak menghasilkan overflow halaman setelah layout stabil. Konfirmasi hapus dibuka lalu dibatalkan; konfigurasi produksi tidak disimpan. Tidak ada page error. Data tetap TA 2026, 233 paket, input 7.280.104.097.000 sen, revisi 0. Grafik produksi: 66 subkegiatan, 23 sesuai, 9 kurang, 27 lebih, 1 pagu kosong, 0 belum sinkron, 1 input tanpa alokasi, 5 nihil. Total selisih nominal 36. Bukti visual: `data/dashboard-header-status.png`, `data/dashboard-header-mobile.png`, `data/status-insight-mobile.png`, `data/settings-subactivity-header.png`, `data/delete-confirmation-motion.png`, `data/dashboard-favicon-header.png`.

Review lokal: aset baru hanya `/favicon.png` pada allowlist server/ekspor; root lain dan credential tetap privat. Konfirmasi hanya mengubah draft. Server direstart setelah memastikan tidak ada sinkron berjalan. Tidak ada dependency baru, commit, atau perubahan workbook/snapshot/credential.

Evaluasi mandiri: akurasi **4/5** (tes dan byte favicon benar; animasi diuji Chrome saja); kelengkapan **4/5** (semua permintaan tercakup, penerimaan visual akhir oleh pengguna belum dilakukan); kejelasan **4/5** (kategori memiliki arti, tujuh kategori tetap padat di mobile); dapat digunakan **4/5** (server aktif, cache tab lama mungkin perlu muat ulang); ringkas **4/5** (tanpa dependency, CSS lama masih memiliki aturan layout yang ditimpa). Rata-rata **4,0/5**. Prioritas: konfirmasi visual pengguna; uji Safari/Firefox bila browser tersebut dipakai. Penilaian ini belum menggantikan penerimaan pengguna.

## Evaluasi mandiri

### Perbaikan verifikasi gelar — 24 November 2026

- Sinkron Andri sebelumnya gagal sebelum pembacaan paket karena Excel memuat `ANDRI PRAMANA, S.STP.` sementara user mengonfirmasi nama akun SIRUP `Andri Pramana`.
- Perbandingan identitas kini memakai nama lengkap sebelum koma untuk seluruh PPK. Gelar sesudah koma diabaikan; nama pendek, nama orang berbeda, role PA/KPA, dan satker/provinsi salah tetap ditolak. Tidak ada fuzzy matching atau pencocokan hanya nama depan.
- Tes reproduksi gagal sebelum perbaikan. Sesudah perbaikan, `npm test`: **16 PASS, 0 FAIL**, termasuk keenam nama PPK tanpa gelar atau dengan gelar berbeda.
- Sinkron nyata Andri selesai: **57 dari 57 paket**, total **Rp2.041.933.740**, tidak ada nominal tak terpetakan. Snapshot: `2026-11-24T15:39:26.289Z`. MAK tetap belum terverifikasi independen.
- Workbook sumber tidak ditulis. Impor read-only pada sesi ini mencatat SHA256 `6dbe10f2ac915ec084ff702c1701eee4659ea2f7e1d295d2efe68d22b6cead0c`; berbeda dari versi awal, sehingga target mengikuti workbook terkini saat impor, bukan diklaim tidak pernah berubah sejak pembuatan dashboard.

| Aspek | Nilai | Bukti / perbaikan |
|---|---:|---|
| Akurasi | 4/5 | Regresi nominal lulus; kepemilikan endpoint live belum dibuktikan. |
| Kelengkapan | 3/5 | UI dan pengumpul tersedia; penerimaan produksi menunggu login manual PPK. |
| Kejelasan | 4/5 | UI membedakan belum sinkron, nominal sesuai, dan pemetaan belum terverifikasi; perlu umpan balik user. |
| Dapat digunakan | 4/5 | Server dan browser khusus tersedia; diperlukan satu login manual untuk uji nyata. |
| Ringkas | 4/5 | Vue tanpa bundler dan Node native; dependency Playwright diperlukan untuk sesi browser. |

Rata-rata: 3,8/5. Perbaikan prioritas: verifikasi satu akun PPK, audit cakupan paketnya, lalu ulangi pada seluruh akun. User kemungkinan menilai kelengkapan berdasarkan keberhasilan sinkron live, bukan fixture, sehingga batas tersebut harus tetap jelas.
