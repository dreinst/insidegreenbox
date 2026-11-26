# Greenbox

Website untuk Greenbox, kedai kopi di Jl. Nusakambangan 42, Klojen, Malang ([@inside.greenbox](https://www.instagram.com/inside.greenbox/)). Isinya beranda dan halaman menu, mengikuti desain di Figma.

Dibangun dengan Vite, React, dan TypeScript. Tidak ada library lain. Animasi memakai CSS dan satu IntersectionObserver, dan otomatis mati kalau pengunjung memilih `prefers-reduced-motion`.

## Menjalankan

Butuh Node 20 atau lebih baru.

```bash
npm install
npm run dev       # server lokal di http://localhost:5173
npm run build     # cek TypeScript lalu build ke dist/
npm run preview   # lihat hasil build
```

## Struktur

```
index.html        halaman induk, memuat font Google
src/main.tsx      entry React
src/App.tsx       beranda (#/) dan menu (#/menu), plus komponen kecil
src/data.ts       data menu, harga, label nutrisi, kalori
src/style.css     semua gaya dan animasi
public/img/       foto produk (WebP) dan tekstur
```

## Mengubah menu

Semua harga dan menu ada di `src/data.ts`. Minuman memakai label nutrition level `A` sampai `D` dan pilihan biji kopi (`c` Classic, `f` Fruity, `d` Decaf, `s` Single-origin). Makanan memakai angka kalori. Total menu di halaman dihitung otomatis.

Foto produk sebaiknya PNG tanpa latar yang dikonversi ke WebP, lalu ditaruh di `public/img/`.

## Sistem admin baru

`sistem/` berisi Greenbox Management Page, pengganti ESB Core (Next.js 16, Prisma 7, PostgreSQL 18), tayang di https://admin.insidegreenbox.com. Kontrak teknisnya di `sistem/KONTRAK.md`, status proyek di `SERAH-TERIMA.md`.

## Agen

Pekerjaan lanjutan dikerjakan Antigravity dengan aturan di `AGENTS.md` dan penjaga di `.agents/penjaga/`. Claude menulis tugas di `tugas/` dan mengaudit hasilnya di `audit/`. Antigravity menulis laporan di `laporan/`.

## Belum ada

- Banner cookie. Situs ini belum memasang cookie. Tambahkan kalau nanti ada analitik atau embed TikTok.
