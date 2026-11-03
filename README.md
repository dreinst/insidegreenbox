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

## Belum ada

- Halaman admin. Perlu backend dulu, jadi ditunda sampai harga memang perlu diubah lewat web.
- Banner cookie. Situs ini belum memasang cookie. Tambahkan kalau nanti ada analitik atau embed TikTok.
