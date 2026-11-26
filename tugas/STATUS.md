# Papan status tugas

Diisi Claude. Antigravity hanya boleh mengubah kolom Status sesuai AGENTS.md bagian 2 (penjaga menolak perubahan lain).

Nilai Status: `menunggu`, `menunggu keputusan`, `dikerjakan`, `menunggu audit`, `ULANG putaran N`, `LULUS`.
Antigravity mengambil tugas `menunggu` atau `ULANG putaran N` dengan nomor terkecil yang semua Syarat-nya sudah `LULUS` dan Pelaksana-nya Antigravity.

| No | Judul | Status | Syarat | Pelaksana | Tugas | Laporan | Audit terakhir |
|---|---|---|---|---|---|---|---|
| 001 | Selesaikan tahap 1 template dari WIP 8e7004c | menunggu | tidak ada | Antigravity | tugas/001-template-tahap1.md | laporan/001-template-tahap1.md | belum |
| 002 | Gabung tahap 1 template dengan 9b62353 dan siapkan rilis | menunggu | 001 | Antigravity | tugas/002-gabung-rilis.md | laporan/002-gabung-rilis.md | belum |
| 003 | Rilis gabungan 002 ke produksi | menunggu keputusan | 002 | Claude dengan izin pemilik | tugas/003-rilis-produksi.md | laporan/003-rilis-produksi.md | belum |
| 004 | Rapikan panduan PDF sesuai rilis 003 | menunggu | 003 | Antigravity | tugas/004-rapikan-panduan.md | laporan/004-rapikan-panduan.md | belum |
| 005 | Tahap 2 template (dompet kas, jatah belanja, Bar dan Kitchen, kategori pengeluaran) | menunggu keputusan | 14 jawaban pemilik | Antigravity | tugas/005-template-tahap2.md | laporan/005-template-tahap2.md | belum |
| 006 | Impor mutasi Mandiri | menunggu keputusan | contoh ekspor Kopra | Antigravity | tugas/006-impor-mandiri.md | laporan/006-impor-mandiri.md | belum |
| 007 | Migrasi data asli dari ekspor resmi ESB | menunggu keputusan | ekspor ESB dan izin bersihkan data contoh | Antigravity | tugas/007-migrasi-esb.md | laporan/007-migrasi-esb.md | belum |
| 008 | Ganti lima sandi awal produksi | menunggu keputusan | pemilik | Pemilik | tugas/008-ganti-sandi.md | tidak ada | belum |
| 009 | Merge PR #2 ke admin-member-kasir | menunggu keputusan | 003 dan pemilik | Pemilik atau Claude | tugas/009-merge-pr2.md | tidak ada | belum |
