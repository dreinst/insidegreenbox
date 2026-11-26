# Tugas 004: Rapikan panduan PDF sesuai rilis 003

Ditulis Claude: 27 November 2026 | Pelaksana: Antigravity | Batas laporan: 300 kata di luar tabel bukti | Batas waktu: 150 menit

Catatan: tugas ini baru bisa diambil sesudah 003 LULUS. Claude akan menambah rincian (daftar halaman dan potret) sebelum statusnya diambil; kalau bagian "Daftar halaman" di bawah masih kosong, tulis laporan TERHENTI.

## Tujuan
Panduan `~/ndru/greenbox-aset/panduan/Panduan-Greenbox-Management-Page.pdf` sesuai rilis 003: halaman separuh kosong dirapikan dan fitur tahap 1 template masuk.

## Dasar kerja
| Hal | Nilai |
|---|---|
| Commit awal | hash yang tayang sesudah 003 |
| Cabang tugas | `ag/004-rapikan-panduan` |
| Worktree tugas | `~/orca/workspaces/insidegreenbox/ag-004` |
| Basis data | `greenbox_agy_004` dan `greenbox_agy_004_e2e` (replika dari seed dan data contoh, bukan data produksi) |
| Port | `3304` |
| Sumber panduan | `~/ndru/greenbox-aset/panduan/sumber/` (dibaca; keluaran baru ditulis di worktree tugas lalu disalin Claude) |

## Daftar halaman
(diisi Claude sesudah 003)

## Kriteria terima
| No | Kriteria | Cara cek | Batas lulus |
|---|---|---|---|
| K1 | Potret dari build produksi lokal | potret diambil dari `next start` di port 3304, bukan `next dev` | semua potret baru |
| K2 | Lembar kontak | lembar kontak semua halaman PDF dibuat dan dibuka | tidak ada halaman separuh kosong, keterangan gambar cocok dengan penanda |
| K3 | Isi sesuai aplikasi | setiap langkah di panduan dicocokkan dengan kode commit awal | tidak ada langkah yang tidak ada di aplikasi |
| K4 | Tulisan | `cek-tulisan.py` atas sumber HTML atau Markdown | `temuan: 0` |
| K5 | Tanpa data pribadi | tidak ada nama orang dari tangkapan ESB atau data `template-gb/asli` | dicek Claude |
