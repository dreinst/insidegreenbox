# Serah terima admin Greenbox

Diperbarui 27 November 2026. Ringkasan dari `~/ndru/greenbox-aset/esb/SERAH-TERIMA-tahap2-6.md` bagian "Rekap 26 November 2026". Pekerjaan berikutnya dijalankan Antigravity lewat `tugas/`, diaudit Claude.

## Cara kerja mulai sekarang

1. Claude menulis tugas bernomor di `tugas/<nnn>-<judul>.md` (dari `tugas/TEMPLAT.md`) dan barisnya di `tugas/STATUS.md`.
2. Pemilik membuka Antigravity di worktree kendali ini dan memintanya mengerjakan tugas berikutnya. Antigravity mengambil tugas sesuai `AGENTS.md` 2.2, bekerja di worktree `~/orca/workspaces/insidegreenbox/ag-<nnn>` pada cabang `ag/<nnn>-<judul>`, menulis `laporan/<nnn>-<judul>.md`, mengubah status ke `menunggu audit`, lalu berhenti.
3. Claude mengaudit sendiri (menjalankan ulang uji, membuka potret, membaca log penjaga `.agents/penjaga/log.jsonl`) dan menulis `audit/<nnn>-<judul>-putaran-<N>.md` dengan putusan LULUS atau ULANG beserta temuan bernomor. Claude mengubah status menjadi `LULUS` atau `ULANG putaran <N+1>`.
4. ULANG dikerjakan Antigravity di cabang yang sama sampai LULUS. Tugas berikutnya baru boleh diambil sesudah itu.
5. Merge ke `dreinst/greenbox-tahap2` dan deploy dikerjakan Claude sesudah LULUS dan izin pemilik. Berkas `tugas/`, `laporan/`, dan `audit/` di-commit Claude di cabang kendali.
6. Kalau suatu langkah butuh menulis di VPS atau memakai WAHA, pemilik membuat izin di terminalnya sendiri: `alat/izin-greenbox.sh vps gugai 30 12 "alasan"`. Cabut dengan `alat/izin-greenbox.sh cabut`.

Repo ini publik. Alamat VPS, pola port WAHA, nomor WhatsApp keluarga pemilik, dan nama container klien lain disimpan di `.agents/penjaga/lokal.json` yang di-gitignore. Berkas itu hanya ada di Mac ini; kalau repo di-clone ulang, buat lagi dengan susunan yang sama, karena tanpa berkas itu penjaga menolak semua ssh dan ujinya berhenti.

Aturan, penjaga, dan skill diubah hanya oleh Claude. Sesudah mengubah: `python3 .agents/penjaga/uji_penjaga.py` (semua sesuai harapan), `python3 alat/cek-tulisan.py AGENTS.md SERAH-TERIMA.md tugas laporan audit`, `wc -c AGENTS.md` (di bawah 24.000 byte), lalu commit.

## Sudah selesai

- Rancangan pengganti ESB (`~/ndru/greenbox-aset/esb/RANCANGAN-greenbox.md`) dan sistem "Greenbox Management Page" di `sistem/` dengan semua modul: kasir dan shift, menu, promo otomatis, member, persediaan, resep, produksi, pembelian, penjualan B2B, setoran POS, kas dan bank, rekonsiliasi, akuntansi, aset, anggaran, laporan, Perlu Disetujui, lima peran (Owner, Superadmin, Admin, Kasir, Finance).
- Audit menyeluruh 24 November (29 temuan, `~/ndru/greenbox-aset/esb/audit/`) sudah diperbaiki, plus keputusan pemilik sesudahnya (pembulatan tunai Rp 500, Aturan Persetujuan, semua PO lewat Owner, selisih kas beralasan tanpa persetujuan, MDR per transaksi).
- Produksi `https://admin.insidegreenbox.com` menjalankan `ef6946a` (dicek 27 November di `/root/greenbox-admin/AKTIF`). Data contoh terpasang. Lima akun awal dengan sandi pendek dari pemilik. Cadangan harian 02.30 WIB, 14 hari.
- Panduan PDF 62 halaman `~/ndru/greenbox-aset/panduan/Panduan-Greenbox-Management-Page.pdf` (sesuai `ef6946a`).
- `9b62353` (keterangan baris jurnal memorial dan jumlah QRIS di kasir, KONTRAK butir 163 dan 164) sudah di-push di cabang ini, belum dirilis.
- Analisis 10 template kerja staf: `~/ndru/greenbox-aset/template-gb/ANALISIS-template.md`. Berkas asli di `template-gb/asli/` berisi data keuangan asli, hanya dibaca.

## Sedang dijeda

- Tahap 1 template di cabang lokal `dreinst/template-tahap1` (dari `ef6946a`, belum di-push), worktree `~/ndru/insidegreenbox/.claude/worktrees/agent-a0135d93328318469`. Lima fitur sudah di-commit (`c9cfa25`, `fe595e1`, `dc596c3`, `cef70c7`, `e1087cd`), commit terakhir `8e7004c` (WIP). Worktree lama itu tidak diubah; tugas 001 membuat cabang baru dari `8e7004c`.
- Penomoran: cabang template memakai KONTRAK butir 163 sampai 167, padahal `9b62353` sudah memakai 163 dan 164. Tugas 002 menomori ulang butir template menjadi 165 sampai 169.

## Langkah lanjutan (urutan tugas)

| No | Tugas | Status awal |
|---|---|---|
| 001 | Selesaikan uji dan rapikan tahap 1 template dari `8e7004c` | menunggu |
| 002 | Gabung dengan `9b62353`, nomori ulang butir, siapkan catatan rilis | menunggu (syarat 001) |
| 003 | Rilis ke produksi (Claude dengan izin pemilik) | menunggu keputusan |
| 004 | Rapikan panduan PDF sesudah rilis | menunggu (syarat 003, rincian ditambah Claude) |
| 005 | Tahap 2 template | menunggu keputusan |
| 006 | Impor mutasi Mandiri | menunggu keputusan |
| 007 | Migrasi data asli dari ekspor resmi ESB | menunggu keputusan |
| 008 | Ganti lima sandi awal produksi (pemilik sendiri) | menunggu keputusan |
| 009 | Merge PR #2 ke `admin-member-kasir` | menunggu keputusan |

## Keputusan yang menunggu pemilik

1. Jam rilis gabungan 002 ke produksi (tugas 003).
2. Jawaban 14 pertanyaan di ANALISIS bagian 4, dan apakah pertanyaan itu dikirim lewat WhatsApp dan ke siapa (tugas 005).
3. Contoh ekspor mutasi Kopra Mandiri. Keputusan 24 November: jangan minta lagi ke admin Greenbox dulu (tugas 006).
4. Ekspor resmi ESB, izin membersihkan data contoh di produksi, dan jadwal uji paralel (tugas 007).
5. Waktu mengganti lima sandi awal (tugas 008).
6. Persetujuan merge PR #2 (tugas 009).
7. Konfirmasi asumsi MDR QRIS 0,3 persen dari seluruh nominal di atas Rp 500.000 (RANCANGAN 11.1 butir 7).
8. Figma rancangan belum diperbarui karena sambungan Figma perlu login ulang (`~/ndru/greenbox-aset/esb/diagram/render-rancangan.figma.js` siap). Belum dijadikan tugas.

## Berkas penting

- Aturan agen: `AGENTS.md`, `.agents/` (penjaga, skill, MCP context7).
- Kendali tugas: `tugas/`, `laporan/`, `audit/`.
- Kontrak teknis: `sistem/KONTRAK.md`. Rancangan bisnis: `~/ndru/greenbox-aset/esb/RANCANGAN-greenbox.md`.
- Produksi: `/root/greenbox-admin/CATATAN.md` di VPS gugai (alamat di `.agents/penjaga/lokal.json`, tidak di-commit).
- Lokal: container `greenbox-pg-dev` (`127.0.0.1:55441`), basis data pemilik `greenbox`, server dev pemilik port 3241.
