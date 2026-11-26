# Tugas 001: Selesaikan tahap 1 template dari WIP 8e7004c

Ditulis Claude: 27 November 2026 | Pelaksana: Antigravity | Batas laporan: 400 kata di luar tabel bukti | Batas waktu: 180 menit

## Tujuan
Lima fitur tahap 1 template (rekap per metode bayar, posisi kas dan bank, ambil uang laci, serah terima shift dengan PIN penerima, waste menu) lulus uji penuh dan tampil benar di desktop dan HP, dengan riwayat commit yang rapi tanpa commit WIP. Belum digabung dengan `9b62353` (itu tugas 002).

## Dasar kerja
| Hal | Nilai |
|---|---|
| Commit awal | `8e7004c` (cabang lokal `dreinst/template-tahap1`, belum di-push, dasar `ef6946a`) |
| Cabang tugas | `ag/001-template-tahap1` |
| Worktree tugas | `~/orca/workspaces/insidegreenbox/ag-001` |
| Basis data | `greenbox_agy_001` (dev) dan `greenbox_agy_001_e2e` (uji klik) |
| Port | `3301` |
| Acuan wajib dibaca | `sistem/KONTRAK.md` butir 163 sampai 167 di commit awal, `~/ndru/greenbox-aset/template-gb/ANALISIS-template.md` |

Lima commit fitur yang sudah ada: `c9cfa25` rekap per metode bayar (butir 163), `fe595e1` posisi kas dan bank (164), `dc596c3` ambil uang laci (165), `cef70c7` serah terima shift (166), `e1087cd` waste menu (167), lalu `8e7004c` WIP (uji klik `template.mjs`, harapan sidebar di `produksi.mjs` dan `lipat.mjs`, dua perbaikan tampilan dari potret). Catatan terakhir: lint bersih, 335 tes unit lulus, uji klik penuh 2604 lulus dan 3 gagal (harapan sidebar lama, sudah dibetulkan di commit WIP tetapi belum diuji ulang).

## Batas lingkup
Boleh disentuh:
- Berkas di `sistem/` pada worktree `ag-001`, sejauh untuk menyelesaikan lima fitur di atas dan uji kliknya.
- `sistem/KONTRAK.md` bagian 11 butir 163 sampai 167 (isi dirapikan bila kode berubah; nomornya tetap).

Tidak boleh disentuh:
- Worktree lama `~/ndru/insidegreenbox/.claude/worktrees/agent-a0135d93328318469` dan cabang `dreinst/template-tahap1` (cabang tugas dibuat dari hash, worktree lama tidak dibuka).
- Fitur di luar lima fitur di atas, situs publik di `src/`, dan `prisma/migrations` yang sudah ada (migrasi baru hanya bila perbaikan memang butuh, dan wajib disebut di laporan).
- Basis data `greenbox` dan `greenbox_e2e`, port 3241.

## Langkah
1. Dari worktree kendali: `git worktree add ~/orca/workspaces/insidegreenbox/ag-001 -b ag/001-template-tahap1 8e7004c`.
2. Siapkan worktree: salin `sistem/.env` dari worktree kendali ke `ag-001/sistem/.env`, ganti nama basis data di `DATABASE_URL` menjadi `greenbox_agy_001` dengan `sed -i ''`, buat basis datanya lewat `docker exec greenbox-pg-dev psql ... -c 'CREATE DATABASE greenbox_agy_001'`, lalu `npm ci` di `ag-001/sistem` dan `npx prisma migrate deploy`.
3. Cek memori (`memory_pressure`, `sysctl -n vm.swapusage`), lalu lint, tipe, dan tes unit.
4. Build lalu uji klik sebagian: `E2E_BERKAS="kasir.mjs laporan.mjs stok.mjs produksi.mjs lipat.mjs template.mjs"`. Perbaiki yang gagal.
5. Buka sendiri potret 1440 dan 390 px dari `template.mjs` untuk kartu Serah terima (halaman rincian shift) dan kartu ringkas per metode (Rekap Penjualan). Perbaiki bila ada tumpang tindih, teks terpotong, atau isi keluar kartu.
6. Uji klik penuh sekali sesudah semua perbaikan.
7. Rapikan riwayat: commit WIP diganti commit biasa dengan pesan bahasa Indonesia yang menjelaskan isinya (cabang belum di-push, jadi `git reset --soft HEAD~1` lalu commit ulang boleh). Lima commit fitur tidak diubah.
8. Tulis laporan, ubah status ke `menunggu audit`, berhenti. Jangan push.

## Kriteria terima
| No | Kriteria | Cara cek (dijalankan di `ag-001/sistem`) | Batas lulus |
|---|---|---|---|
| K1 | Lint bersih | `npm run lint` | 0 galat, 0 peringatan baru |
| K2 | Tipe bersih | `npx tsc --noEmit` | 0 galat di luar `.next/` |
| K3 | Tes unit | `lockf -k /tmp/greenbox-berat.lock npm test` | 0 gagal, lulus paling sedikit 335 |
| K4 | Build | `lockf -k /tmp/greenbox-berat.lock npm run build` | keluar 0 |
| K5 | Uji klik sebagian | `E2E_DB=greenbox_agy_001_e2e E2E_PORT=3301 E2E_BERKAS="kasir.mjs laporan.mjs stok.mjs produksi.mjs lipat.mjs template.mjs" lockf -k /tmp/greenbox-berat.lock npm run e2e` | 0 gagal |
| K6 | Uji klik penuh | perintah K5 tanpa `E2E_BERKAS` | 0 gagal, lulus paling sedikit 2607 |
| K7 | Dua perbaikan potret | potret 1440 dan 390 px kedua kartu, dibuka dengan alat baca berkas, path ditulis di laporan | tidak ada tumpang tindih, terpotong, atau luapan |
| K8 | Riwayat rapi | `git log --format='%an <%ae> %s' ef6946a..HEAD` | tidak ada `WIP`, semua `dreinst <asteinec@gmail.com>`, lima commit fitur tetap ada dengan hash yang sama |
| K9 | Tanpa atribusi AI | `git log --format=%B ef6946a..HEAD \| grep -ci co-authored` | 0 |
| K10 | Tulisan bersih | `git diff --name-only ef6946a..HEAD \| xargs python3 ~/orca/workspaces/insidegreenbox/greenbox-tahap2/alat/cek-tulisan.py` | `temuan: 0` |
| K11 | KONTRAK sejalan | butir 163 sampai 167 menyebut perilaku yang sama dengan kode sesudah perbaikan | Claude mencocokkan saat audit |
| K12 | Pohon kerja bersih | `git status --short` | kosong (kecuali `sistem/AGENTS.md` yang ditulis ulang `next dev`, yang wajib di-commit bila berubah) |

## Larangan khusus
- DILARANG mengubah harapan uji supaya lulus tanpa memperbaiki penyebabnya. Setiap harapan uji yang diubah wajib disebut di laporan beserta alasannya.
- DILARANG menyentuh butir KONTRAK selain 163 sampai 167.
- DILARANG push, merge, atau deploy.

## Cara melapor
- `laporan/001-template-tahap1.md` dari `laporan/TEMPLAT.md`, putaran 1.
- Status `tugas/STATUS.md` baris 001: `dikerjakan` saat mulai, `menunggu audit` saat selesai.
