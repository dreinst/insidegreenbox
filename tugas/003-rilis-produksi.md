# Tugas 003: Rilis gabungan 002 ke produksi

Ditulis Claude: 27 November 2026 | Pelaksana: Claude dengan izin pemilik (bukan Antigravity) | Status: menunggu keputusan

## Keputusan yang ditunggu
Pemilik menyetujui jam rilis dan isi rilis sesudah audit 002 LULUS. Antigravity tidak mengerjakan tugas ini. Penjaga menolak perintah ssh yang menulis ke VPS tanpa izin pemilik.

## Tujuan
`https://admin.insidegreenbox.com` menjalankan commit LULUS dari tugas 002.

## Langkah (Claude)
1. Merge `ag/002-gabung-rilis` ke `dreinst/greenbox-tahap2`, push, perbarui deskripsi PR #2.
2. Ikuti `/root/greenbox-admin/CATATAN.md` bagian "Update ke commit baru": folder `rilis/<hash>` baru (mkdir yang gagal bila sudah ada), `git archive` lalu ekstrak di perintah ssh terpisah, build kedua image, `./cadangan.sh` wajib sebelum migrasi, `db:setup`, `jurnal:bentuk-ulang` harus "cocok" semua, `./jalankan-app.sh`.
3. Jangan menyentuh container klien lain di VPS, container Caddy, dan `greenbox-site`. Image `greenbox-admin:ef6946a` tidak dihapus.

## Kriteria terima
| No | Kriteria | Cara cek | Batas lulus |
|---|---|---|---|
| K1 | Cadangan sebelum migrasi | `ls -l /root/greenbox-admin/cadangan` | ada dump dengan waktu sebelum `db:setup` |
| K2 | Commit aktif | `cat /root/greenbox-admin/AKTIF` | hash LULUS 002 |
| K3 | Jurnal | keluaran `jurnal:bentuk-ulang` | semua cocok |
| K4 | Situs | `curl -s -o /dev/null -w "%{http_code}\n" https://admin.insidegreenbox.com/masuk` | 200 |
| K5 | Memori | `systemctl show greenbox.slice -p MemoryCurrent` | di bawah 1400M |
| K6 | Uji asap | masuk sebagai owner di produksi, buka Rekap Penjualan, Posisi Kas, Waste, rincian shift | tampil tanpa galat |
| K7 | CATATAN diperbarui | baris riwayat rilis baru di `CATATAN.md` | ada |
