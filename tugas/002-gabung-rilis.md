# Tugas 002: Gabung tahap 1 template dengan 9b62353 dan siapkan rilis

Ditulis Claude: 27 November 2026 | Pelaksana: Antigravity | Batas laporan: 400 kata di luar tabel bukti | Batas waktu: 150 menit

## Tujuan
Satu cabang yang berisi tahap 1 template (hasil tugas 001 yang LULUS) dan perbaikan `9b62353` (keterangan baris jurnal memorial dan jumlah QRIS di kasir), dengan nomor butir KONTRAK yang tidak bentrok, lulus uji penuh, dan catatan rilis yang siap dipakai Claude di tugas 003. Tidak ada deploy.

## Dasar kerja
| Hal | Nilai |
|---|---|
| Commit awal | commit terakhir `ag/001-template-tahap1` yang disebut LULUS di `audit/001-template-tahap1-putaran-N.md` |
| Yang digabung | `9b62353` (sudah di-push di `dreinst/greenbox-tahap2`, tayang belum) |
| Cabang tugas | `ag/002-gabung-rilis` |
| Worktree tugas | `~/orca/workspaces/insidegreenbox/ag-002` |
| Basis data | `greenbox_agy_002` dan `greenbox_agy_002_e2e` |
| Port | `3302` |
| Acuan wajib dibaca | `~/ndru/greenbox-aset/esb/SERAH-TERIMA-tahap2-6.md` bagian "Cara menggabungkan", `/root/greenbox-admin/CATATAN.md` di VPS gugai (baca saja lewat ssh) |

Bentrok yang sudah diketahui: `9b62353` memakai KONTRAK butir 163 (keterangan baris memorial) dan 164 (jumlah QRIS). Cabang template juga memakai 163 sampai 167. Butir `9b62353` sudah di-push dan tetap 163 dan 164. Butir template dinomori ulang menjadi 165 sampai 169 dengan urutan yang sama.

## Batas lingkup
Boleh disentuh: berkas yang bentrok saat merge, `sistem/KONTRAK.md` (penomoran ulang dan rujukan), rujukan `butir N` di kode, tes, dan nama migrasi bila perlu.

Tidak boleh disentuh: isi fitur di luar yang dibutuhkan untuk menyelesaikan konflik, cabang `dreinst/greenbox-tahap2`, VPS (hanya membaca `CATATAN.md`).

## Langkah
1. `git worktree add ~/orca/workspaces/insidegreenbox/ag-002 -b ag/002-gabung-rilis <commit LULUS 001>`, siapkan `.env`, basis data, dan `npm ci` seperti tugas 001.
2. `git merge --no-ff 9b62353`. Selesaikan konflik mengikuti pola di SERAH-TERIMA (katalog, ikon, audit, `jalankan.sh`, `klik.mjs`, `produksi.mjs`, `package.json`, KONTRAK).
3. Nomori ulang butir template 163 sampai 167 menjadi 165 sampai 169. Cari semua rujukan `butir 16[3-7]` di berkas yang berasal dari cabang template (`git diff ef6946a <commit LULUS 001> --name-only`, lalu grep) dan perbarui.
4. `npx prisma validate`, `npx prisma generate`, `npx tsc --noEmit`, lint, tes unit, build, uji klik penuh.
5. Potret 390 px layar kasir dengan QRIS lalu tambah pesanan (jumlah QRIS ikut total) dan rincian jurnal memorial dua baris, dibuka sendiri.
6. Tulis bagian "Catatan rilis" di laporan: hash yang akan dirilis, daftar migrasi baru sejak `ef6946a` (`git diff --name-only ef6946a HEAD -- sistem/prisma/migrations`), apakah ada skrip yang wajib dijalankan sesudah migrasi (`jurnal:bentuk-ulang` dan alasannya), image mundur `greenbox-admin:ef6946a`, dan langkah CATATAN yang berlaku. Jangan menjalankan apa pun di VPS selain membaca.
7. Laporan, status `menunggu audit`, berhenti. Jangan push.

## Kriteria terima
| No | Kriteria | Cara cek (di `ag-002/sistem`) | Batas lulus |
|---|---|---|---|
| K1 | Isi gabungan lengkap | `git merge-base --is-ancestor 9b62353 HEAD && git merge-base --is-ancestor <commit LULUS 001> HEAD && echo ya` | `ya` |
| K2 | Nomor butir unik dan berurutan | `python3 ~/orca/workspaces/insidegreenbox/greenbox-tahap2/alat/cek-butir-kontrak.py KONTRAK.md` | `butir 1 sampai 169 berurutan, tanpa ganda` |
| K3 | Rujukan butir benar | `git grep -n -E 'butir 16[3-9]' -- src tests scripts prisma` | tiap baris merujuk isi butir yang benar (dicek Claude) |
| K4 | Prisma dan tipe | `npx prisma validate && npx tsc --noEmit` | keluar 0, 0 galat di luar `.next/` |
| K5 | Lint | `npm run lint` | 0 galat |
| K6 | Tes unit | `lockf -k /tmp/greenbox-berat.lock npm test` | 0 gagal, lulus paling sedikit 335 ditambah tes dari `9b62353` |
| K7 | Build | `lockf -k /tmp/greenbox-berat.lock npm run build` | keluar 0 |
| K8 | Uji klik penuh | `E2E_DB=greenbox_agy_002_e2e E2E_PORT=3302 lockf -k /tmp/greenbox-berat.lock npm run e2e` | 0 gagal |
| K9 | Potret | dua potret di langkah 5, path di laporan, dibuka | jumlah QRIS sama dengan total baru; keterangan baris memorial ada di barisnya |
| K10 | Riwayat dan tulisan | `git log --format='%an <%ae>' <commit LULUS 001>..HEAD \| sort -u` dan `cek-tulisan.py` atas berkas yang berubah | hanya `dreinst <asteinec@gmail.com>`, `temuan: 0`, tanpa `Co-Authored-By` |
| K11 | Catatan rilis | bagian "Catatan rilis" di laporan | memuat semua isi langkah 6, angka dan nama dari perintah yang dijalankan |

## Larangan khusus
- DILARANG mengubah nomor butir 1 sampai 164.
- DILARANG perintah ssh selain membaca. DILARANG merge ke `dreinst/greenbox-tahap2`, push, atau deploy.

## Cara melapor
`laporan/002-gabung-rilis.md`, status baris 002 `dikerjakan` lalu `menunggu audit`.
