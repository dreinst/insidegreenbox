---
name: uji-klik-greenbox
description: Uji klik dan potret admin Greenbox dengan Playwright Chromium tanpa kepala terhadap server di worktree tugas ag-<nnn>. Pakai setiap kali tugas meminta uji klik, potret 1440 dan 390 px, cek tampilan HP, atau bukti bahwa formulir benar-benar tersimpan. Pengganti browser-use untuk proyek ini.
---

# Uji klik Greenbox

Semua perintah dijalankan di `~/orca/workspaces/insidegreenbox/ag-<nnn>/sistem`. Nomor tugas `<nnn>` menentukan basis data `greenbox_agy_<nnn>` dan port `33<nn>`.

## 1. Server uji

1. Cek memori dulu: `memory_pressure | tail -1` dan `sysctl -n vm.swapusage`. Kalau tekanan memori merah atau swap di atas 80 persen, berhenti dan tulis di laporan.
2. Uji klik penuh memakai skrip proyek, yang membuat ulang basis data e2e, mengisi seed, lalu menjalankan build produksi:

   ```
   E2E_DB=greenbox_agy_<nnn>_e2e E2E_PORT=33<nn> lockf -k /tmp/greenbox-berat.lock npm run e2e
   ```

   `E2E_BERKAS="kasir.mjs laporan.mjs"` membatasi berkas uji. Build (`lockf -k /tmp/greenbox-berat.lock npm run build`) wajib selesai sebelumnya.
3. Untuk melihat satu halaman sendiri, jalankan server dari worktree tugas (bukan worktree kendali, bukan port 3241):

   ```
   nohup npx next start -p 33<nn> > /tmp/greenbox-<nnn>-server.log 2>&1 & echo $! > /tmp/greenbox-<nnn>-server.pid
   ```

   Matikan dengan `kill $(cat /tmp/greenbox-<nnn>-server.pid)`. DILARANG pkill, killall, pgrep, atau `xargs kill`.

## 2. Potret

- Tiap halaman yang disentuh tugas dipotret di lebar 1440 dan 390 px, setelah datanya tampil (tunggu elemen yang berisi data, bukan `waitForTimeout`).
- Simpan di `tests/potret/<nnn>/<halaman>-<lebar>.png` (folder ini diabaikan git). Potret halaman penuh boleh memperlihatkan bilah lengket di tengah; itu efek cara potret, bukan cacat.
- WAJIB membuka setiap potret dengan alat baca berkas dan menulis apa yang terlihat di laporan. Potret yang tidak dibuka tidak boleh disebut lolos.
- Yang dicari: teks terpotong, tumpang tindih, isi keluar kartu atau tabel, tombol terpotong di 390 px atau 768 px, laci menu yang menutupi isi, halaman separuh kosong.

## 3. Formulir

- Kirim formulir sungguhan lewat klik (isi kolom, tekan tombol), lalu cek hasilnya di dua tempat: layar sesudah pengalihan dan basis data (`docker exec greenbox-pg-dev psql -U greenbox -d greenbox_agy_<nnn>_e2e -Atc "select ..."`).
- Uji juga jalur galat: isian salah harus tetap terjaga (KONTRAK bagian 6) dan pesan galat tampil di bawah kolomnya.
- Pengalihan yang hanya berbeda jangkar (`#`) tidak memuat ulang layar; itu cacat.
- Dua admin menyimpan bersamaan diuji dengan dua context Playwright bila tugas menyebutnya.

## 4. Sesudah selesai

- Matikan server dan Chrome tanpa kepala yang tertinggal lewat PID. Cari PID dengan `ps -o pid,command -p <pid>` atau `lsof -ti tcp:33<nn>`, lalu `kill <angka>`.
- Gagal dua kali dengan sebab yang sama: berhenti, tulis sebabnya di laporan. DILARANG mengulang tanpa batas.
- Kalau dua kegagalan ternyata sisa data di basis data uji, ulang sekali di basis data baru, lalu catat.
