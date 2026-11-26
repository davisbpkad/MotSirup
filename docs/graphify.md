# Peta kode Graphify

Graphify memetakan kode dan dokumentasi proyek. Graphify tidak mengganti grafik monitoring, tidak mengambil data SIRUP, dan tidak menjadi dependensi runtime aplikasi.

Pemasangan lokal memakai `graphifyy 0.9.86` yang sudah tersedia. Tidak ada paket npm baru atau perubahan konfigurasi global.

## Hasil lokal

- `graphify-out/graph.html`: peta interaktif, buka sebagai berkas lokal.
- `graphify-out/graph.json`: simpul dan relasi untuk kueri.
- `graphify-out/GRAPH_REPORT.md`: ringkasan komunitas dan batas ekstraksi.
- `graphify-out/graph-health.json`: pemeriksaan integritas ekstraksi.

Hasil awal: 188 simpul, 324 relasi, 8 komunitas. Kueri CLI berhasil. Browser Chrome menampilkan peta tanpa error atau request eksternal. Library visualisasi `vis-network 9.1.6` disimpan lokal setelah SHA384 cocok dengan integrity bawaan; ekspor HTML ulang akan mengembalikan referensi CDN bawaan Graphify.

Regresi aplikasi: `npm test`, 25 lulus. Benchmark bawaan memperkirakan 4,7× penghematan token per kueri (12.533 token korpus dibanding 2.692 token kueri rata-rata); ini perkiraan dari 9.400 kata yang dihitung benchmark, bukan pengukuran tagihan atau seluruh 19.507 kata hasil deteksi.

Jalankan dari direktori proyek:

```sh
graphify query "startSync commitSnapshot"
graphify explain "exportPng()"
graphify path "startSync()" "commitSnapshot()" --undirected
```

Untuk memperbarui kode, gunakan `graphify update .`. Perubahan dokumentasi memerlukan ekstraksi semantik ulang melalui skill `/graphify --update`; jangan menganggap pembaruan AST telah memperbarui semua dokumen.

## Privasi dan batas

`.graphifyignore` mengecualikan seluruh `data/`, credential, profil login, snapshot, gambar, dependensi, dan fixture JSON. Jangan hapus pengecualian tersebut atau unggah hasil graph tanpa pemeriksaan. Hasil dan cache diabaikan Git.

Ekstraksi awal menggunakan parser AST lokal dan agen sesi untuk dokumentasi. Tidak menggunakan layanan Graphify cloud atau API LLM tambahan. Hitungan token agen yang tidak tersedia dicatat sebagai tidak diketahui, bukan biaya nol.

Peta adalah alat navigasi, bukan bukti audit anggaran. Parser dapat meninggalkan endpoint yang tidak terpetakan, relasi eksternal, atau menggabungkan relasi dengan pasangan simpul sama. Periksa sumber sebelum menyimpulkan perilaku aplikasi. Berkas CSS belum tercakup parser.

Tidak ada hook Git, watcher, server MCP, atau endpoint publik baru yang dipasang.
