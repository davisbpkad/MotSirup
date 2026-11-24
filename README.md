# Monitor SIRUP — BPKAD Jawa Barat

Dashboard lokal Vue untuk membandingkan target pagu Excel dengan paket SIRUP terumumkan. Tidak ada login dashboard, ekstensi, atau pembacaan database cookie Chrome.

## Menjalankan

Persyaratan: Node.js 22 atau lebih baru, Google Chrome, Python 3 dengan `openpyxl` untuk impor Excel.

```sh
npm install --ignore-scripts
npm run import:pagu
npm start
```

Buka **http://127.0.0.1:8788/**. ActTRK pada port 8787 tidak diubah.

1. Pilih PPK dan tekan **Hubungkan SIRUP**.
2. Pada SPSE Jawa Barat, pilih LOGIN → NON PENYEDIA. Credential diisi otomatis jika tersedia pada template lokal; lanjutkan login sendiri sampai membuka SIRUP.
3. Pilih TA aktif melalui ikon gear **Pengaturan pagu dan TA**, lalu tekan **Sinkronisasi**. Permintaan daftar memakai TA aktif; detail setiap paket wajib memiliki tahun yang sama.
4. Ulangi untuk PPK lain. Setiap PPK memiliki profil dan hasil sinkron terpisah.

Tutup browser lewat tombol tutup jika tidak diperlukan. Sesi tetap berada dalam profil lokal; saat kedaluwarsa, login ulang di situs SIRUP. Tidak perlu memasukkan kata sandi pada dashboard atau file konfigurasi.

## Data dan perhitungan

Klik nama paket pada rincian atau **Lihat detail paket** pada panel pemeriksaan untuk membuka popup. Popup hanya menampilkan detail asli SIRUP dan tautan sumber. Ringkasan dashboard/snapshot tidak ditampilkan ulang; data snapshot tetap dipakai untuk rekap dan pemeriksaan di luar popup.

Styling dan transisi mengikuti dialog ActTRK: backdrop hijau dan animasi fade/scale/geser. Tutup melalui tombol **Tutup**, **Escape**, atau klik di luar kotak. Klik di dalam tidak menutup dialog; fokus keyboard tetap di dialog dan kembali ke pemicu setelah ditutup. Reduced motion menonaktifkan animasi.

Popup mengambil **detail publik asli SIRUP** melalui GET ketika dibuka: uraian, spesifikasi, metode, lokasi, PDN/UMK, seluruh tabel pendanaan dan jadwal yang tersedia. Nilai dirender sebagai teks/tabel, bukan HTML target. ID dan TA wajib cocok; gagal mengambil detail menghasilkan pesan error dan tombol coba lagi, tanpa fallback ringkasan duplikat. Detail live tidak mengubah total rekap sebelum sinkron ulang. Tautan **Buka di SIRUP** tetap tersedia.

## Konfigurasi tahunan

### Login SPSE dan credential lokal

Setelah clone, buat file privat dari template kosong yang aman masuk Git:

```bash
cp -n credential.example.md credential.md
chmod 600 credential.md
```

Jangan timpa `credential.md` yang sudah berisi akun. Credential, profil login, snapshot, konfigurasi tersimpan, dan screenshot lokal tidak ikut repository; baseline pagu dan fixture regresi disertakan.

**Hubungkan SIRUP** membuka `https://spse.inaproc.id/jabarprov` pada profil PPK terpilih, bukan langsung halaman SIRUP. Pilih **LOGIN → NON PENYEDIA** dan lanjutkan tiap tahap sendiri. Saat dokumen form login resmi SPSE dibuka, aplikasi mengisi User ID/password PPK dari `credential.md` di root proyek. Klik lanjut/login, CAPTCHA/OTP, dan membuka SIRUP dari SPSE tetap dilakukan pengguna. Pengumpul sinkron tetap GET-only; pengisian form tidak mengirim login otomatis.

Template `credential.md` menyediakan satu blok JSON dengan ID `siti`, `taufiq`, `dindin`, `andri`, `novi`, `agus`. Isi sendiri `username` dan `password` pada PPK yang diperlukan, lalu simpan dengan izin `0600` (`chmod 600 credential.md`). Isian kosong atau file tidak ada berarti login manual. Template tidak berisi credential nyata. File dibaca ulang saat menghubungkan/membuka tahap login; tidak perlu restart setelah mengisi.

**Peringatan:** kata sandi dalam file berupa teks biasa. File diabaikan Git, tidak disajikan melalui HTTP, dan nilainya tidak dimasukkan ke response/log. Jangan bagikan file atau sertakan dalam backup laporan. Aplikasi menolak symlink, izin baca grup/publik, file di atas 64 KB, dan JSON salah. Pengisian hanya di dokumen `https://spse.inaproc.id/jabarprov/login...` dengan form tujuan login pada origin/path yang sama. Redirect ke domain lain tidak menerima credential. Format/tahap login SPSE dapat berubah; bila form tidak dikenali, isi manual. Tidak ada screenshot/trace login yang dibuat aplikasi.

Tekan ikon gear **Pengaturan pagu dan TA** di kanan atas:

- Pilih TA aktif atau buat TA baru (2000–2100). TA baru menyalin struktur dan daftar PPK, tetapi **mengosongkan seluruh pagu** dan tidak menyalin snapshot.
- Pilih PPK, ubah pagu subkegiatan dalam rupiah dengan maksimal dua desimal. Kosong berarti belum tersedia, berbeda dari nol.
- Pagu kegiatan otomatis menjumlahkan subkegiatan aktif; tidak ada target kegiatan terpisah.
- Aktif/nonaktif tersedia pada kegiatan dan subkegiatan. Kegiatan nonaktif menonaktifkan cakupan seluruh anak tanpa menghapus pilihan aktif masing-masing anak. Target dan input terkait keluar dari progres aktif; paket tetap terlihat pada **Perlu pemeriksaan**.
- **Tambah kegiatan** membuat parent tersendiri pada PPK dan TA terpilih, termasuk kegiatan tanpa anak. Kode/nama kegiatan dapat diedit sekali; label seluruh anak mengikuti parent.
- **Tambah subkegiatan** pada kegiatan membuat anak baru. Dropdown **Kegiatan induk** memilih parent yang sudah ada pada PPK/TA yang sama, untuk anak baru maupun lama; grup berpindah otomatis.
- Pindah parent atau ubah kode kegiatan menyesuaikan awalan kode anak, mempertahankan empat digit terakhir. Server menolak kode ganda, parent lintas PPK, serta kode anak yang tidak cocok. Paket/MAK asli tidak diubah atau dipindahkan; kode lama yang kehilangan target tetap muncul di pemeriksaan.
- **Hapus subkegiatan** menghapus target dari draft, bukan paket/snapshot. **Hapus kegiatan** hanya diizinkan jika tidak memiliki anak. Keduanya memerlukan konfirmasi, lalu **Simpan konfigurasi** agar berlaku. Batal/Escape membuang draft, bukan konfigurasi tersimpan. Tidak ada penghapusan arsip TA.
- Tekan **Simpan konfigurasi**. Konfigurasi disimpan atomik pada `data/settings.json`, dengan cadangan versi sebelumnya `data/settings.json.bak`. Perubahan tab lain ditolak menggunakan nomor revisi. Simpan ditolak saat sinkron berjalan.

Workbook dan `data/pagu.json` sumber tidak ditulis oleh pengaturan. Setelah pengaturan pertama disimpan, impor ulang Excel tidak menimpa `settings.json`; perubahan sumber perlu ditinjau dan diterapkan pada pengaturan secara eksplisit. Profil login tetap per PPK, sementara snapshot sinkron baru berada di `data/snapshots/<TA>/<ppk>.json`. Snapshot lama langsung di `data/snapshots/` tetap dibaca hanya untuk tahun yang cocok; tidak dipindah atau dihapus.

**Belum ada DB.** Penyimpanan memakai JSON lokal. Setiap TA memiliki `activities` (`id`, `ppk`, `code`, `name`, `active`) serta `targets` dengan relasi `activityId`. Nama parent tidak diduplikasi pada anak. Konfigurasi format lama dinormalisasi saat dibaca, tanpa menulis file; format baru ditulis ketika pengguna menyimpan. `settings.json` baru dibuat pada simpan pertama; sebelumnya sumbernya `data/pagu.json`.

Tombol tambah memakai ikon plus; hapus memakai ikon tempat sampah. Nama tindakan tampil saat hover/fokus keyboard dan tersedia bagi pembaca layar. Konfirmasi hapus dan larangan menghapus parent beranak tetap berlaku.

Kontrol akun PPK, Hubungkan SIRUP, Sinkronisasi, TA, dan gear berada di header. Pada layar kecil, kontrol akun pindah ke baris berikut agar tidak berdesakan. Logo header dan ikon tab memakai file asli `favicon.png` di root proyek, tanpa mengubah gambar sumber. Footer hanya menampilkan nama aplikasi dan instansi di tengah.

Grafik Status subkegiatan menghitung subkegiatan aktif menurut filter PPK, bukan pencarian tabel. Angka tengah menunjukkan jumlah seluruh subkegiatan aktif. Legenda memisahkan sesuai, kurang, lebih, pagu belum diisi, belum sinkron, input tanpa alokasi, serta pagu/input nol; masing-masing memiliki arti dan jumlah. Ringkasan di bawah grafik menjelaskan selisih dan data yang perlu dilengkapi, bukan menyatakan hasil audit.

Tombol memakai transisi warna 0,2 detik dan skala tekan 0,97. Semua dialog, termasuk konfirmasi hapus, memakai transisi opacity/translate/scale 0,28 detik dengan kurva yang sama seperti ActTRK. Toast memiliki transisi masuk dan keluar. Preferensi reduced motion mematikan animasi; dukungan transisi display/overlay dialog mengikuti browser. Konfirmasi hapus memilih Batal sebagai fokus awal; Escape membatalkan tanpa menghapus.

Kolom Progres kegiatan/subkegiatan memakai donut SVG kecil di samping nilai/status, menggantikan grafik batang kegiatan terpisah. Warna mengikuti status nominal. Lingkaran maksimal penuh pada 100%, tetapi angka asli di atas 100% tetap ditampilkan. Nilai belum tersedia memakai lingkaran kosong, bukan dianggap 0%. Donut ikut ekspor PNG tabel.

**Batas versi ini:** daftar orang PPK masih mengikuti daftar awal. Pengelolaan pergantian orang PPK, versi Murni/Perubahan dalam satu TA, impor workbook tahunan melalui UI, dan riwayat lengkap belum ditambahkan. Cadangan hanya menyimpan satu konfigurasi sebelumnya; salin `settings.json` dan snapshot secara berkala untuk arsip permanen. Sesi dalam `data/profiles/` sensitif; jangan dibagikan bersama arsip laporan.

## Ekspor PNG

- **Ekspor PNG** pada Progres masing-masing PPK mengambil semua kartu, atau satu PPK sesuai filter terpilih.
- **Ekspor PNG tabel** pada TELUSURI REKAP hanya mengambil tabel **Kegiatan / subkegiatan / paket**, **Pagu**, **Input terumumkan**, **Selisih**, dan **Progres**. Grafik, judul panel, filter, dan caption tambahan tidak ikut dalam gambar.
- Ekspor tabel mengikuti filter PPK, pencarian, dan status dropdown saat tombol ditekan. Kegiatan terbuka menampilkan anaknya; subkegiatan terbuka menampilkan paketnya. Dropdown tertutup tetap tertutup, termasuk anak terbuka yang parent-nya ditutup. Semua baris yang sesuai ikut diekspor, termasuk di luar layar, tanpa mengubah tampilan pengguna.
- PNG progres PPK tetap mencantumkan TA, PPK/filter, waktu ekspor, serta waktu sinkron. PNG tabel sengaja tidak menambahkan metadata di luar tabel, sesuai contoh tampilan. Rendering memakai Chrome headless lokal yang sudah tersedia melalui Playwright; tanpa dependency tambahan, profil login, atau koneksi SIRUP.
- Batas satu PNG: tinggi 30.000 piksel. Rekap lebih besar ditolak dengan pesan untuk memilih satu PPK atau mempersempit pencarian; tidak dipotong diam-diam.

- Target: `../Rekap SIRUP_Perubahan 2026.xlsx`, sheet `PAGU SIRUP 2026_Perubahan`. Workbook hanya dibaca. Impor mencatat SHA256 sumber serta menguji bahwa workbook tidak berubah.
- Enam PPK, 66 subkegiatan. Nama PPK dan bidang diambil dari pemetaan yang ditinjau terhadap workbook. Satu target Anggaran kosong tetap `null`, bukan nol.
- Semua nominal disimpan sebagai **integer sen**, bukan floating-point rupiah. Selisih adalah **input dikurangi pagu**. Toleransi sesuai nominal: maksimal Rp1 secara absolut.
- Input: hanya status `3` (Terumumkan). Draft, Final Draft, Inisiasi, dan Dibatalkan tidak masuk total. Jumlah per status tetap ditampilkan pada model data.
- Rekening gaji/tunjangan ASN pada subkegiatan `5.02.01.1.02.0001` dikecualikan.
- Pagu nol dan tanpa input diberi label **Tanpa alokasi**, bukan 0%. Input pada pagu nol ditandai sebagai masalah.
- PPK belum sinkron ditandai **Belum sinkron**, bukan dianggap input nol. Total BPKAD belum lengkap sampai seluruh PPK tersinkron dan tidak ada konflik ID.
- Paket dengan beberapa pendanaan dialokasikan berdasarkan nominal masing-masing baris. Nilai pendanaan harus sama dengan pagu paket.
- Jenis dan ID paket menjadi kunci. ID yang muncul pada beberapa akun dikarantina dari total sampai konflik diperiksa; konflik tidak disembunyikan.
- Daftar diperiksa kembali setelah semua detail diambil. Jika ID/pagu/status berubah di tengah pengambilan, sinkron gagal dan cache sebelumnya tetap tersedia.

## Batas pemetaan yang penting

Identitas login harus tepat: nama lengkap sesuai daftar PPK, role **PPK**, satker BPKAD, Provinsi Jawa Barat. Perbandingan nama mengabaikan gelar setelah koma, kapitalisasi, spasi, dan tanda baca. Nama depan saja atau nama orang berbeda tetap ditolak. Gelar tanpa pemisah koma belum dinormalisasi otomatis. PA/KPA ditolak. Pemetaan pemilik **tidak** memakai lokasi atau MAK.

Namun, identitas akun saja belum membuktikan bahwa endpoint mengembalikan hanya paket milik akun tersebut. `scopeVerified` tetap `false` sampai cakupan akun diperiksa dengan sumber kepemilikan independen. Peringatan ini selalu terlihat pada hasil sinkron.

Kode subkegiatan detail publik tidak tersedia sebagai field independen pada sampel yang telah diperiksa. Karena itu, pengelompokan dari MAK diberi label **belum terverifikasi independen**. Nama kegiatan pada daftar dibandingkan dengan kegiatan target sebagai pemeriksaan tambahan. Itu belum dapat menemukan semua kesalahan MAK dalam satu kegiatan.

MAK tidak valid, target tidak ditemukan, perbedaan nama kegiatan, dan perbedaan kode struktur dimasukkan ke panel **Perlu pemeriksaan**. Nominal paket tersebut tetap masuk total PPK, tetapi tidak dipaksakan masuk subtotal target. Angka 100% tidak membuktikan semua rekening benar atau kontrak/realisasi sesuai.

## Keamanan

- Server hanya bind `127.0.0.1:8788`, bukan jaringan LAN.
- Operasi pengumpul hanya memakai **GET** ke endpoint SIRUP yang tetap. Tombol lokal memakai POST hanya ke server dashboard. Login manual di situs resmi dapat menjalankan permintaan login normal.
- Browser Playwright menggunakan sesi melalui profil persisten. Cookie tidak diekspor ke JSON atau dicetak. `data/profiles/` berisi sesi sensitif dan dikecualikan dari Git; jangan dibagikan.
- Hasil paket berada di `data/snapshots/<TA>/`, ditulis atomik dengan izin file `0600`. Direktori profil/snapshot dibuat dengan `0700`; konfigurasi dan cadangannya memakai `0600`.
- API tindakan memeriksa Host, Origin, dan token acak per proses. Situs lain tidak diizinkan memicu penghubungan/sinkron lewat browser.
- HTML detail diambil lewat request GET dan diparse dengan `DOMParser` pada halaman kosong. Script target tidak dijalankan oleh pengumpul.
- Tidak ada hosting/cloud atau telemetri dashboard. Pengguna dapat menyimpan kata sandi teks biasa dalam `credential.md` untuk pengisian form SPSE; file ini dibaca hanya di server lokal dan tidak diekspos melalui API. Profil Chrome menyimpan sesi login. Keduanya sensitif dan tidak boleh dibagikan.

## Verifikasi

```sh
npm test
node --test --experimental-test-coverage test/selfcheck.js
npm audit --omit=dev
```

Tes menggunakan Chrome headless dan data fixture, tanpa kredensial atau perubahan ke SIRUP. Fixture historis Siti menguji **62 paket / Rp7.211.169.026**, tetapi tidak dimuat sebagai hasil sinkron nyata.

Enam akun memiliki snapshot lokal pada pemeriksaan terakhir. Itu bukan bukti audit kepemilikan endpoint atau kebenaran MAK. Lihat `docs/verification.md` untuk bukti dan batas verifikasi.
