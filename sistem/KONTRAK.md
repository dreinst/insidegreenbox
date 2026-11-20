# Kontrak sistem admin Greenbox

Dokumen ini mengikat semua tahap pembangunan admin Greenbox pengganti ESB Core. Rancangan bisnisnya ada di `~/ndru/greenbox-aset/esb/RANCANGAN-greenbox.md` (disebut RANCANGAN di bawah) dan ERD-nya di `~/ndru/greenbox-aset/esb/diagram/erd-data.mjs` (entitas `g: true`). Kalau kode dan dokumen ini berbeda, salah satunya diperbaiki di commit yang sama. Perubahan kontrak ditulis di bagian 11.

Ditulis 20 November 2026 untuk tahap 2.

## 1. Teknologi

- App ada di folder `sistem/` dengan `package.json` sendiri. Situs publik Vite di akar repo dan admin lama (`src/Admin.tsx`, `src/admin/`, `src/store.ts`) tidak disentuh sampai tahap 3.
- Next.js 16 (App Router, Server Components, Server Actions), React 19, TypeScript ketat.
- PostgreSQL 18 lewat Prisma 7 dengan `@prisma/adapter-pg`. Klien Prisma dibuat ke `src/generated/prisma` (tidak di-commit).
- Validasi masukan dengan zod. Sesi ditandatangani jose (HS256). Sandi di-hash bcryptjs (cost 12).
- CSS biasa di `src/app/globals.css` dengan warna dan huruf situs Greenbox (`--ink`, `--paper`, `--green`, huruf Bricolage Grotesque dan Unbounded lewat `next/font`, jadi tidak ada permintaan ke Google Fonts saat dipakai).
- Tes unit `node --import tsx --test`, uji klik Playwright (Chromium tanpa kepala).

## 2. Struktur folder

```
sistem/
  KONTRAK.md            dokumen ini
  .env.example          daftar variabel lingkungan tanpa nilai rahasia
  prisma/
    schema.prisma       83 tabel rancangan + tabel fondasi (bagian 3)
    migrations/         migrasi SQL berurutan, tidak pernah diubah sesudah di-commit
    seed.ts             peran, matriks izin, saklar, Owner pertama (dari env)
  scripts/
    seed-contoh.ts      Admin dan Kasir contoh untuk lokal dan uji (sandi dari env)
  src/
    proxy.ts            cek cepat cookie sesi, nonce CSP, header keamanan
    app/
      masuk/            halaman login
      (admin)/          semua halaman yang butuh login, berbagi layout sidebar
        page.tsx        Beranda
        pengguna/       daftar, baru, [id]
        peran/          daftar, baru, [id] (matriks izin)
        saklar/         saklar fitur per peran
        audit/          jejak audit, [id] rincian
        menu/           tahap 3A: menu, kategori/, paket/, harga/ (massal), riwayat/
        promo/, metode-bayar/, member/ (dengan tingkat/)   tahap 3A
        produk/ (kategori/, satuan/), stok/ (kartu/), penyesuaian/, opname/, pindah-stok/,
        alasan-stok/, lokasi/   tahap 4A
    lib/
      db.ts             klien Prisma dengan pool kecil
      sesi.ts           baca sesi dari cookie dan database (server-only)
      sesi-token.ts     tanda tangan dan verifikasi token (dipakai proxy)
      izin.ts           wajibMasuk, wajibIzin, wajibSaklar, aksiBerizin
      izin-inti.ts      logika izin murni (tanpa Next), dipakai halaman dan tes
      katalog.ts        katalog menu izin, matriks bawaan, saklar bawaan, sidebar
      audit.ts          catatAudit, bersihkanUntukAudit
      masuk.ts          logika login, rate limit, sesi di database
      aksi.ts           bentuk hasil aksi server, bantu zod
      status.ts         status dokumen dan transisi yang sah
      nomor.ts          nomor dokumen dari doc_sequence
      pengguna.ts, peran.ts, saklar.ts   logika tiap modul (tanpa Next, bisa dites)
      hitung-kasir.ts   hitungan kasir murni (total, bayar, kas seharusnya), dipakai klien dan server
      wa.ts             normalisasi dan tampilan nomor WA member, dipakai modul member dan kasir
      shift.ts, penjualan.ts, pin.ts     modul kasir tahap 3B
      stok/             tahap 4A: mesin.ts (mesin stok, bagian 12), angka.ts, dokumen.ts (alur status),
                        produk.ts, lokasi.ts, alasan.ts, penyesuaian.ts, opname.ts, pindah.ts, posisi.ts,
                        bawaan.ts (isi bawaan), impor.ts (saldo awal admin lama)
    components/         komponen tampilan bersama
  tests/
    *.test.ts           tes unit dengan basis data uji
    e2e/                uji klik Playwright
    potret/             hasil potret (di-gitignore)
```

Aturan lapisan: berkas di `src/lib/*.ts` selain `sesi.ts` dan `izin.ts` tidak mengimpor `next/*`, supaya bisa dites langsung dengan basis data uji. Halaman dan aksi server tipis: membaca sesi, memanggil `wajibIzin`, memvalidasi dengan zod, lalu memanggil fungsi modul.

## 3. Skema database

Sumber kebenaran: `prisma/schema.prisma`. Model PascalCase dipetakan ke tabel snake_case (`@@map`), kolom camelCase dipetakan ke snake_case (`@map`). Semua 83 tabel rancangan sudah dibuat di migrasi awal walau modulnya belum punya halaman, supaya kontrak data tidak berubah di tengah jalan.

### 3.1 Aturan umum

- Kunci utama `id` integer autoincrement, kecuali tabel yang di ERD memakai kunci gabungan (`role_permission`, `role_feature_switch`, `product_unit`, `stock_balance`, `doc_sequence`) atau kunci teks (`approval_rule.doc_type`, `account_mapping.key`).
- Uang: `BigInt` rupiah bulat (kolom `bigint`). Berlaku untuk harga, subtotal, pajak, total, nilai, saldo, dan batas rupiah.
- Harga satuan per satuan dasar (`avg_cost`, `last_cost`, `unit_cost`): `Decimal(18,4)`. Harga per gram atau per ml sering tidak bulat, dan pembulatan di harga satuan akan menggeser nilai persediaan. Nilai baris (`value`) tetap rupiah bulat. Ini tafsiran atas RANCANGAN bagian 1 butir 6.
- Qty: `Decimal(18,3)` dalam satuan dasar produk. Faktor satuan `Decimal(18,6)`. Persen `Decimal(6,3)`.
- Waktu: `timestamptz`. Tanggal dokumen: `date`.
- Kolom audit di tabel master dan dokumen: `created_by`, `created_at`, `updated_by`, `updated_at`. Tabel dokumen menambah jejak status `submitted_by/at`, `approved_by/at`, `posted_by/at`, `cancelled_by/at`, `cancel_reason`, dan `reversal_journal_id` bila dokumen menggerakkan jurnal.
- Kolom `*_by` berisi `app_user.id` tanpa foreign key, kecuali relasi yang digambar di ERD (`app_user.role_id`, `audit_log.user_id`, `shift.user_id`, `shift.approved_by`, `fiscal_period.closed_by`). Pengguna tidak pernah dihapus (hanya dinonaktifkan), jadi id di kolom itu tetap bisa dibaca. Pilihan ini menghindari ratusan relasi balik di model `AppUser`.
- Master tidak memakai status dokumen; cukup kolom `active`. Baris master yang sudah dipakai transaksi tidak dihapus, hanya dinonaktifkan.

### 3.2 Status dokumen

Enum PostgreSQL `doc_status`: `Draft`, `Diajukan`, `Disetujui`, `Diposting`, `Selesai`, `Batal` (RANCANGAN 2.1). Transisi yang sah ada di `src/lib/status.ts` dan wajib dicek oleh setiap aksi yang mengubah status:

Dokumen rencana (`purchase_request`, `purchase_order`, `production_order`, `sales_order`):

```
Draft -> Diajukan -> Disetujui -> Selesai
Draft -> Disetujui            (jenis dokumen tanpa aturan persetujuan)
Diajukan -> Draft             (dikembalikan)
Draft | Diajukan | Disetujui -> Batal
```

Dokumen pelaksana (semua dokumen lain yang punya kolom `status`):

```
Draft -> Diposting            (tanpa aturan persetujuan)
Draft -> Diajukan -> Diposting
Draft -> Diajukan -> Disetujui -> Diposting   (purchase_payment dan cash_transaction)
Diajukan -> Draft
Draft | Diajukan | Disetujui -> Batal
Diposting -> Batal            (gerak balik, butuh saklar dok.batal_posting dan alasan)
```

Enum lain: `pay_status` (`BelumBayar`, `Sebagian`, `Lunas`), `progress` (`Belum`, `Sebagian`, `Penuh`), `shift_status` (`Buka`, `Tutup`, `PerluPersetujuan`), `sale_status` (`Selesai`, `Void`), `account_kind` (`Aset`, `Kewajiban`, `Ekuitas`, `Pendapatan`, `HPP`, `Beban`), `period_status` (`Terbuka`, `Ditutup`), `match_status` (`BelumCocok`, `Cocok`). Kolom `kind` lain berupa teks dengan nilai yang divalidasi zod di modulnya.

Dokumen Diposting tidak diubah dan tidak dihapus. Pembatalannya membuat jurnal dan mutasi stok balik (RANCANGAN 2.3). Hapus hanya untuk Draft.

### 3.3 Nomor dokumen

`doc_sequence` berkunci (`doc_type`, `period`), dengan `period` berbentuk `YYMM`. Fungsi `ambilNomor(tx, docType, prefix, tanggal)` di `src/lib/nomor.ts` menjalankan `INSERT ... ON CONFLICT DO UPDATE SET last_no = last_no + 1 RETURNING last_no` di dalam transaksi pembuat dokumen, lalu membentuk `PREFIX-YYMM-NNNN` (misalnya `PO-2611-0007`). Nomor diambil saat Draft dibuat. Nomor yang sudah keluar tidak dipakai ulang walau draf dihapus atau dokumen dibatalkan, jadi lubang nomor itu wajar.

### 3.4 Ringkasan per domain

| Domain | Tabel | Catatan |
|---|---|---|
| Pengguna, izin, audit | `app_user`, `role`, `role_permission`, `feature_switch`, `role_feature_switch`, `approval_rule`, `audit_log`, `doc_sequence`, ditambah `user_session` dan `login_attempt` | dipakai sejak tahap 2 |
| Produk, resep, menu | `product`, `product_category`, `unit`, `product_unit`, `bom`, `bom_line`, `menu_item`, `stock_reason` | `bom.kind` menu atau assembly |
| Pembelian | `supplier`, `purchase_request(_line)`, `purchase_order(_line)`, `goods_receipt(_line)`, `purchase_invoice(_line)`, `purchase_return(_line)`, `direct_purchase(_line)`, `purchase_payment`, `purchase_payment_alloc` | RANCANGAN 3 |
| Lokasi dan persediaan | `branch`, `location`, `stock_balance`, `stock_ledger`, `stock_adjustment(_line)`, `stock_opname(_line)`, `stock_transfer(_line)` | semua gerak qty lewat `stock_ledger`; `stock_balance` bisa dihitung ulang dari ledger |
| Produksi | `production_order(_line)`, `material_issue(_line)`, `production_result`, `quick_production(_line)` | RANCANGAN 5 |
| Kasir, shift, setoran | `member_tier`, `member`, `shift`, `shift_cash_move`, `sale`, `sale_line`, `sale_payment`, `pos_settlement(_line)` | `pos_settlement_line` unik per shift dan metode lewat `pos_settlement` |
| Akun, jurnal, kas, bank | `account`, `account_mapping`, `fiscal_period`, `payment_method`, `bank_account`, `journal`, `journal_line`, `cash_transaction(_line)`, `bank_statement_line`, `bank_reconcile`, `bank_reconcile_match` | satu jurnal seimbang per dokumen diposting |
| Penjualan B2B | `customer`, `sales_order(_line)`, `sales_invoice(_line)`, `customer_payment`, `customer_payment_alloc`, `sales_return(_line)` | dibangun sesudah alur harian |
| Aset dan anggaran | `fixed_asset`, `asset_depreciation`, `asset_disposal`, `budget`, `budget_line` | dibangun sesudah alur harian |

### 3.5 Tabel fondasi tahap 2

- `app_user`: `username` unik huruf kecil, `password_hash`, `pin_hash` (dipakai tahap 3), `active`, `last_login_at`, `role_id`, `location_id` (lokasi bawaan kasir, kosong di tahap 2).
- `role`: `code` unik (`owner`, `admin`, `kasir`, atau buatan Owner), `name`, `is_system`, `active`. Peran sistem tidak bisa dinonaktifkan.
- `role_permission`: satu baris per peran per kode menu dengan 6 kolom boolean `can_view`, `can_create`, `can_update`, `can_delete`, `can_approve`, `can_post`.
- `feature_switch` dan `role_feature_switch`: 24 saklar (bagian 4.4) dengan nilai `enabled` dan `limit_value` per peran.
- `user_session`: sesi login di database (bagian 7).
- `login_attempt`: catatan percobaan login untuk rate limit (bagian 7).
- `audit_log`: bagian 5.

## 4. Peran, aksi, dan cara cek izin

### 4.1 Peran

Owner (setara SUPERADMIN ESB), Admin (operasional dan back office), Kasir (layar kasir dan shift sendiri), sesuai RANCANGAN 8.1. Pengguna lama superadmin dan owner menjadi Owner, admin lama menjadi Kasir; pengguna Admin ditambahkan Owner belakangan. Owner bisa membuat peran tambahan (misalnya SPV) dan mengatur izinnya dari menu Peran dan Izin.

### 4.2 Aksi

Enam aksi per menu: `L` Lihat, `T` Tambah, `U` Ubah, `H` Hapus (hanya draf), `S` Setujui, `P` Posting. Aksi yang berlaku untuk sebuah menu sama dengan aksi milik Owner di matriks RANCANGAN 8.2. Aksi di luar itu tidak ditampilkan dan tidak bisa dinyalakan.

### 4.3 Kode menu

Katalog lengkap ada di `src/lib/katalog.ts` beserta matriks bawaan Owner, Admin, dan Kasir dari RANCANGAN 8.2. Kode berbentuk `grup.menu`, misalnya `beli.faktur`, `stok.opname`, `kasir.shift`. Baris RANCANGAN "Pengaturan: Pengguna, peran, izin, saklar" (Owner L T U H) dipecah menjadi tiga kode supaya Owner bisa memberi akses satu per satu: `atur.pengguna` (L T U), `atur.peran` (L T U), dan `atur.saklar` (L U). Pengguna dan peran tidak pernah dihapus, cukup dinonaktifkan, dan saklar tidak ditambah dari layar, jadi aksi Hapus dan Tambah di sana tidak punya arti dan tidak dibuat. Baris "Log aktivitas" menjadi `atur.audit`. Tahap 3B menambah `kasir.pin` (PIN kasir, Owner L U, Admin L U, Kasir tanpa akses) karena Admin harus bisa mengatur PIN kasir tanpa memegang `atur.pengguna`.

### 4.4 Saklar fitur

23 saklar dari RANCANGAN 8.3 ditambah satu saklar `log.lihat_semua` (Owner Ya, Admin Tidak, Kasir Tidak). Saklar itu menggantikan catatan "Admin: L (aktivitas sendiri)" di matriks: pemegang izin Lihat `atur.audit` tanpa `log.lihat_semua` hanya melihat aktivitasnya sendiri. Saklar yang punya angka (`pos.batas_selisih_kas`, `dok.tanggal_mundur`) memakai `limit_value`; `limit_value` kosong berarti tanpa batas.

### 4.5 Cara cek izin

Semua cek lewat `src/lib/izin.ts`:

- `wajibMasuk()` membaca sesi (cookie lalu database). Tanpa sesi sah, pengguna dialihkan ke `/masuk`.
- `wajibIzin(menu, aksi)` dipanggil di baris pertama setiap halaman server dan setiap aksi server, termasuk aksi yang tombolnya disembunyikan. Tanpa izin, halaman menampilkan layar "Akses ditolak" (status 403) dan aksi mengembalikan galat. Penolakan dicatat di audit sebagai `izin.ditolak`.
- `wajibSaklar(kode)` dan `nilaiSaklar(kode)` untuk saklar fitur, dipanggil sesudah `wajibIzin`.
- Izin dan saklar dibaca ulang dari database di setiap permintaan (sekali per permintaan lewat `cache` React), jadi perubahan matriks langsung berlaku tanpa login ulang.
- Menyembunyikan tombol di tampilan hanya untuk kenyamanan. Yang menentukan selalu cek di server.

### 4.6 Pengaman

- Peran `owner` selalu memegang semua aksi yang berlaku di `atur.pengguna`, `atur.peran`, `atur.saklar`, dan `atur.audit`, serta saklar `log.lihat_semua`. Penyimpanan matriks yang mencabutnya ditolak.
- Peran sistem (`owner`, `admin`, `kasir`) tidak bisa dinonaktifkan. Kode peran apa pun tidak bisa diubah sesudah disimpan, karena kode dipakai di audit dan di kode program. Peran nonaktif membuat penggunanya tidak bisa masuk sampai diaktifkan lagi.
- Owner aktif terakhir tidak bisa dinonaktifkan dan perannya tidak bisa diganti.
- Pengguna tidak bisa menonaktifkan dirinya sendiri dan tidak bisa mengganti perannya sendiri.
- Hanya pengguna berperan Owner yang bisa membuat atau mengubah pengguna berperan Owner, memberi peran Owner, atau mengatur ulang sandi Owner.
- Pengguna bukan Owner tidak bisa mengubah matriks izin atau saklar perannya sendiri, dan tidak bisa memberi izin atau menyalakan saklar yang tidak ia miliki (termasuk lewat salin izin saat membuat peran).

## 5. Audit trail

- Tabel `audit_log` hanya bertambah. Trigger PostgreSQL menolak `UPDATE`, `DELETE`, dan `TRUNCATE` di tabel itu. Tidak ada halaman, aksi, atau fungsi untuk mengubah atau menghapus audit.
- Setiap perubahan data ditulis lewat `catatAudit(tx, konteks, entri)` di dalam transaksi Prisma yang sama dengan perubahannya. Kalau perubahan gagal, audit ikut batal; kalau audit gagal, perubahan ikut batal.
- Isi baris: waktu, `user_id` (boleh kosong untuk login gagal dengan nama tak dikenal), `actor_name` (nama pengguna saat itu atau yang diketik), `action` (misalnya `pengguna.ubah`), `doc_type` (nama tabel), `doc_id` (teks, karena ada kunci gabungan), `summary` (kalimat pendek bahasa Indonesia), `before_json`, `after_json`, `ip`, `user_agent`.
- `before_json` dan `after_json` dibersihkan oleh `bersihkanUntukAudit`: hash sandi dan PIN tidak pernah disimpan, diganti tanda `"[disembunyikan]"`. BigInt, Decimal, dan tanggal disimpan sebagai teks.
- Peristiwa yang wajib tercatat sejak tahap 2: `masuk.berhasil`, `masuk.gagal`, `masuk.terkunci`, `keluar`, `izin.ditolak`, `pengguna.tambah`, `pengguna.ubah`, `pengguna.sandi`, `pengguna.aktifkan`, `pengguna.nonaktifkan`, `peran.tambah`, `peran.ubah`, `peran.izin`, `peran.aktifkan`, `peran.nonaktifkan`, `saklar.ubah`. Tahap 3A menambah (semua dengan `before_json` dan `after_json` untuk kolom yang berubah): `kategori.tambah/ubah/aktifkan/nonaktifkan` (`menu_category`), `menu.tambah/ubah/aktifkan/nonaktifkan` (`menu_item`), `harga.massal` (`menu_price_batch`, berisi aturan, jumlah, dan contoh lima menu; riwayat lengkapnya di `menu_price_history`), `paket.tambah/ubah/aktifkan/nonaktifkan` (`menu_set`), `promo.tambah/ubah/aktifkan/nonaktifkan` (`promo`), `metode_bayar.tambah/ubah/aktifkan/nonaktifkan` (`payment_method`), `tingkat.tambah/ubah/aktifkan/nonaktifkan` (`member_tier`), `member.tambah/ubah/aktifkan/nonaktifkan` (`member`), dan `impor.menu` (satu baris per jalan impor yang menambah data). Mengubah satu harga lewat formulir menu menulis `menu.ubah` dan satu baris riwayat harga. Tahap 4A menambah `produk.tambah/ubah/aktifkan/nonaktifkan` (`product`), `produk.satuan_tambah/satuan_ubah/satuan_hapus` (`product_unit`), `kategori_produk.*` (`product_category`), `satuan.*` (`unit`), `lokasi.*` (`location`), `alasan.*` (`stock_reason`), dan untuk tiap dokumen persediaan dengan awalan `penyesuaian` (`stock_adjustment`), `opname` (`stock_opname`), `pindah` (`stock_transfer`): `.tambah` (draf dibuat), `.ubah` (kepala), `.baris_tambah` dan `.baris_hapus` (penyesuaian dan pindah), `.hitung` (opname), `.hapus` (draf), `.ajukan`, `.kembalikan`, `.posting` (berisi jumlah baris dan nilai bersih), `.batal` (berisi gerak balik bila dari Diposting), serta `impor.stok`. Persetujuan dan posting dokumen stok terjadi dalam satu langkah ("Setujui dan posting"), jadi tidak ada peristiwa `.setujui` terpisah; penyetujunya tercatat di `approved_by`. Tahap berikutnya menambah peristiwa per dokumen dengan pola yang sama.
- Peristiwa tahap 3B (kasir): `kasir.masuk_pin` (masuk dengan PIN), `pengguna.pin` (pasang, ganti, atau hapus PIN), `shift.buka`, `shift.kas` (kas masuk atau keluar laci), `shift.tutup`, `shift.setujui`, `penjualan.simpan`, `penjualan.void`. PIN salah dan PIN terkunci dicatat sebagai `masuk.gagal` dan `masuk.terkunci` dengan ringkasan yang menyebut tujuannya (masuk kasir atau penyetuju void). Entitas baru di audit: `shift` dan `sale`.
- Halaman Jejak Audit hanya membaca, dengan saring tanggal, aktor, aksi, dan entitas, serta rincian sebelum dan sesudah.

## 6. Konvensi aksi server

- Setiap aksi: `wajibIzin` dulu, lalu validasi `FormData` dengan skema zod, lalu fungsi modul di dalam `db.$transaction` bersama `catatAudit`.
- Bentuk hasil (`src/lib/aksi.ts`):

```ts
type HasilAksi =
  | { ok: true; pesan?: string }
  | { ok: false; pesan: string; galat?: Record<string, string>; isian?: Record<string, string>; n: number }
```

- Pesan galat berbahasa Indonesia dan menyebut kolomnya ("Nama pengguna sudah dipakai."). Galat per kolom tampil di bawah kolomnya dan ringkasannya di atas formulir dengan `role="alert"`.
- Isian terjaga saat galat: aksi mengembalikan `isian` (semua nilai yang dikirim kecuali sandi), dan formulir memakai `defaultValue` dari `isian` dengan `key` yang berganti tiap kiriman (`n`), sehingga React memasang ulang kolom dengan nilai terakhir walau formulir direset sesudah aksi.
- Sesudah simpan berhasil, aksi memanggil `revalidatePath` lalu `redirect` ke halaman tujuan dengan `?pesan=<kode>` (misalnya `/pengguna/12?pesan=tersimpan`). Teks pesannya diambil dari daftar tetap, bukan dari query. Pengalihan tidak boleh hanya berbeda jangkar (`#`), karena layar tidak dimuat ulang.
- Galat tak terduga dicatat di log server dan pengguna melihat "Terjadi galat di server. Coba lagi." tanpa rincian teknis.

## 7. Keamanan

- Cookie sesi `gb_sesi`: `httpOnly`, `SameSite=Lax`, `Secure` di produksi, `path=/`, umur 12 jam. Isinya JWT HS256 berisi id sesi, ditandatangani dengan `SESSION_SECRET` (minimal 32 karakter, dari env; app menolak jalan tanpa itu).
- Setiap permintaan ke halaman atau aksi memeriksa baris `user_session` di database: belum dicabut, belum kedaluwarsa, pengguna aktif, peran aktif. Menonaktifkan pengguna, mengatur ulang sandinya, atau keluar mencabut sesi di database, jadi aksesnya hilang di permintaan berikutnya. Proxy hanya memeriksa tanda tangan token untuk mengalihkan cepat ke `/masuk`; otorisasi tetap di server.
- Rate limit login tersimpan di `login_attempt`: 5 kali gagal untuk satu nama pengguna dalam 15 menit mengunci nama itu, dan 20 kali gagal dari satu IP dalam 15 menit mengunci IP itu, sampai jendela 15 menit lewat. Login berhasil mengosongkan hitungan untuk nama pengguna itu. Nama pengguna yang tidak dikenal tetap diproses dengan bcrypt pada hash tiruan supaya waktu jawabnya sama, dan pesan galat selalu "Nama pengguna atau sandi salah."
- IP diambil dari header `x-forwarded-for` atau `x-real-ip` hanya bila `TRUST_PROXY=1` (di produksi di belakang proxy balik). Tanpa itu IP dicatat sebagai `tidak-diketahui`.
- Aksi server Next.js memeriksa kecocokan header Origin dan Host; ditambah `SameSite=Lax`, itu perlindungan CSRF-nya.
- Header keamanan di setiap jawaban: `Content-Security-Policy` dengan nonce per permintaan (dari proxy), `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` yang mematikan kamera, mikrofon, lokasi, dan pembayaran, serta `Strict-Transport-Security` di produksi.
- Sandi minimal 8 karakter. Nama pengguna 3 sampai 32 karakter `a-z 0-9 . _ -`.
- Rahasia hanya di `.env` (di-gitignore). `.env.example` berisi nama variabel tanpa nilai.
- Login tahap 2 memakai nama pengguna dan sandi untuk ketiga peran. Sandi tetap berlaku untuk semua peran di tahap 3.
- Masuk dengan PIN (tahap 3B): layar masuk punya pilihan "PIN kasir" (`/masuk?cara=pin`) berisi nama pengguna aktif yang punya PIN dan boleh masuk dengan PIN, lalu PIN 4 sampai 6 angka. PIN di-hash bcryptjs (cost 12) di `app_user.pin_hash` dan tidak pernah masuk audit. Yang boleh masuk dengan PIN hanya peran yang memegang Tambah di `kasir.layar` dan tidak memegang menu `atur.*` apa pun, jadi Owner dan Admin tetap masuk dengan sandi (RANCANGAN 8.1). PIN Owner dan Admin hanya dipakai untuk menyetujui void.
- Rate limit PIN memakai `login_attempt` dengan kunci `pin:<nama pengguna>`: 5 PIN salah per pengguna dalam 15 menit mengunci PIN pengguna itu, dan 20 gagal per IP (sandi dan PIN dihitung bersama) mengunci IP itu. Hitungan PIN terpisah dari hitungan sandi supaya penguncian satu jalur tidak menutup jalur lain, tetapi batasnya sama. Pengguna tak dikenal tetap diproses bcrypt pada hash tiruan dan pesannya selalu "Nama atau PIN salah." PIN penyetuju void memakai hitungan yang sama.
- Owner mengatur PIN siapa saja. Pemegang `kasir.pin` lain hanya mengatur PIN dirinya sendiri dan PIN pengguna yang boleh masuk dengan PIN, supaya PIN tidak dipakai menyamar sebagai Admin lain. Memasang, mengganti, atau menghapus PIN mencabut sesi lain pengguna itu.

## 8. Sidebar per tahap

Syarat dari user: setiap item sidebar yang tampil berfungsi penuh ke database (daftar, tambah, ubah, alur status). Tidak ada menu kosong, "segera hadir", atau tautan mati. Item tampil hanya bila peran punya izin Lihat di kode menunya. Modul yang belum dibangun tidak punya item sidebar.

| Tahap | Item sidebar (kode menu) |
|---|---|
| 2 | Beranda (semua pengguna), Pengguna (`atur.pengguna`), Peran dan Izin (`atur.peran`), Saklar Fitur (`atur.saklar`), Jejak Audit (`atur.audit`) |
| 3 | Layar Kasir, Shift, Transaksi, Menu dan Harga, Promo, Member, Metode Bayar; login PIN kasir; admin lama dipindah dari data browser ke server. Tahap 3A (master) sudah tayang: Menu dan Harga (`menu.menu`, dengan tab Kategori, Paket set, Ubah harga, Riwayat harga), Promo (`menu.promo`), Member (`menu.member`, dengan tab Tingkat Greenbox Key di `menu.tingkat`), dan Metode Bayar (`akun.metode_bayar`) |
| 4 | Produk dan Satuan, Resep dan BOM, Stok, Penyesuaian, Opname, Pindah Stok, Alasan, Pemasok, Permintaan, Pesanan, Penerimaan, Faktur, Retur, Pembelian Langsung, Pembayaran, Perintah Produksi, Pengeluaran Bahan, Hasil Produksi, Produksi Cepat. Tahap 4A sudah tayang: Produk dan Satuan (`stok.produk`, tab Kategori dan Satuan), Stok (`stok.saldo`, tab Kartu stok), Penyesuaian (`stok.penyesuaian`), Opname (`stok.opname`), Pindah Stok (`stok.pindah`), Alasan (`stok.alasan`), dan Lokasi (`atur.lokasi`, master sederhana yang dimajukan dari tahap 6) |
| 5 | Laporan, Akun dan Pemetaan, Jurnal Umum, Buku Besar, Tutup Periode, Kas dan Bank, Rekonsiliasi, Setoran POS, Hutang Pemasok |
| 6 | Penjualan B2B, Aset, Anggaran, Lokasi dan Profil Usaha |
| 7 | Migrasi data dari ekspor resmi ESB, uji paralel, lalu ESB dihentikan |

Urutan tahap 3 sampai 5 mengikuti SERAH-TERIMA. Tahap 3B (kasir) menambah Layar Kasir (`/kasir`, `kasir.layar`), Shift (`/shift`, `kasir.shift`), Transaksi (`/transaksi`, `kasir.transaksi`), dan PIN Kasir (`/pin`, `kasir.pin`). Struk cetak ada di `/struk/[id]` di luar kerangka admin dan memakai izin Lihat `kasir.transaksi`. Daftar sidebar ada di `src/lib/katalog.ts` (`SIDEBAR`) dan hanya berisi halaman yang sudah ada.

## 9. Batas sumber daya produksi

Target produksi VPS gugai dalam `greenbox.slice` (1,5 GB untuk situs, app, database, dan WAHA Greenbox). Karena itu:

- Pool koneksi Prisma `DB_POOL_MAX` bawaan 3, koneksi menganggur ditutup sesudah 30 detik.
- Node dijalankan dengan `NODE_OPTIONS=--max-old-space-size=256`, build `output: 'standalone'`.
- PostgreSQL disetel kecil (`shared_buffers` sekitar 128 MB, `max_connections` 20).
- Halaman daftar selalu berhalaman (bawaan 50 baris), tidak ada kueri tanpa batas.
- Tidak ada deploy di tahap 2.

## 10. Lokal dan uji

- PostgreSQL lokal di container `greenbox-pg-dev` (`postgres:18-alpine`, hanya `127.0.0.1:55441`, volume `greenbox-pg-dev-data`). Basis data dev `greenbox`. Tes membuat basis data baru `greenbox_uji_<acak>` per berkas tes, memigrasinya, dan menghapusnya sesudahnya.
- Server dev di port 3241.
- Perintah: `npm run db:setup` (migrasi dan seed), `npm run seed:contoh`, `npm run impor:menu`, `npm run impor:stok`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`.

## 11. Penyimpangan dari ERD dan perubahan kontrak

1. Tabel tambahan `user_session` dan `login_attempt` untuk sesi di database dan rate limit (bagian 7).
2. `audit_log` menambah kolom `actor_name`, `summary`, dan `user_agent`; `doc_id` bertipe teks.
3. `feature_switch` menambah kolom `sort` untuk urutan tampilan; saklar ke-24 `log.lihat_semua` (bagian 4.4).
4. Satu baris matriks "Pengguna, peran, izin, saklar" menjadi tiga kode menu dengan aksi L T U, L T U, dan L U (bagian 4.3).
5. Kolom `*_by` tanpa foreign key (bagian 3.1); semua tabel dokumen dan master memakai `updated_by` juga, mengikuti RANCANGAN 1 butir 9.
6. Harga satuan per satuan dasar memakai `Decimal(18,4)` (bagian 3.1).
7. `approval_rule` belum diisi di tahap 2. Bawaan RANCANGAN 2.2 diisi di tahap 4 bersama dokumen pembelian.

Tahap 3A (master, migrasi `20261120095737_tahap3a_master`):

8. Tahap 3A, skema: `menu_category` baru, dan `menu_item.category` tetap berupa teks tetapi kini menjadi kunci asing ke `menu_category.code` (kode yang membaca kolom itu tetap jalan, nama kategori lewat relasi `categoryRef`). `menu_item` menambah `description`, `kcal`, `sort`. Tabel baru `menu_price_batch` dan `menu_price_history` (setiap perubahan harga, satuan maupun massal, satu batch), `menu_set` (paket set: satu menu utama, satu minuman, harga normal, harga paket, foto), dan `promo` (jenis `persen`, `nominal`, atau `hadiah` dengan masa berlaku). `member` dan `member_tier` menambah kolom `active`. Migrasi `tahap3a_master` mengisi `menu_category` dari nilai `menu_item.category` yang sudah ada sebelum kunci asing dipasang.
9. Kode menu `menu.tingkat` (L T U H untuk Owner, L T U Admin, L Kasir) dipisah dari `menu.member`, supaya Kasir yang boleh mendaftarkan member (L T) tidak ikut mengatur tingkat dan potongan. Paket set memakai izin `menu.menu`.
10. Aturan modul master: master tidak dihapus, hanya dinonaktifkan; harga menu dan paket rupiah bulat lebih dari 0 dan paling besar Rp 10.000.000; nama menu, paket, promo, metode bayar, tingkat unik tanpa peduli huruf besar; kategori dengan menu aktif tidak bisa dinonaktifkan; menu yang dipakai paket aktif tidak bisa dinonaktifkan; metode tunai selalu ber-MDR 0 dan minimal satu metode bayar harus aktif; nomor WA member dinormalisasi ke format 62 (nomor seluler Indonesia saja) dan unik; tingkat member dihitung dari kunjungan (tingkat aktif dengan syarat tertinggi yang terpenuhi) dan dihitung ulang untuk semua member saat tingkat berubah.
11. Foto menu dan paket: kolom `image` berisi nama berkas di `public/img` situs tanpa `.webp` (dibaca dari `SITUS_IMG_DIR`, bawaan `../public/img`) atau `unggahan/<16 heksa>.<webp|png|jpg>` (folder `UNGGAHAN_DIR`, bawaan `data/unggahan`, di-gitignore). Keduanya dilayani route `/foto/[jenis]/[nama]` yang butuh sesi sah, karena Next tidak melayani berkas baru di `public/` saat berjalan. Unggahan paling besar 2 MB dan diperiksa isinya (bukan hanya ekstensi); batas badan aksi server dinaikkan ke 3 MB di `next.config.ts`. Di produksi, folder foto situs harus tersedia lewat `SITUS_IMG_DIR` atau fotonya diunggah ulang.
12. Impor: `npm run impor:menu` (`scripts/impor-menu.ts`, logika di `src/lib/impor-menu.ts`) mengisi kategori, menu beserta harga dan kalori, tingkat member, paket set, dan metode bayar Tunai, QRIS, Debit (MDR 0, diatur Owner) dari `src/data.ts` dan bawaan `src/store.ts` yang disalin ke berkas impor. Baris yang sudah ada dilewati, bukan ditimpa. Atribut minuman `level`, `serve`, `beans`, bahan visual `mat`, dan promo langkah harian (`dailyGift`) tidak dibawa. Member contoh ada di `seed:contoh`, bukan di impor.

Tahap 3B (kasir, migrasi `20261120130000_tahap3b_kasir`):

13. Kolom tambahan di luar ERD: `shift.closed_by` (penutup shift), `shift.diff_limit` (batas selisih yang berlaku saat ditutup), `shift.approval_note` (catatan persetujuan Owner); `sale.member_pct`, `sale.svc_pct`, `sale.tax_pct` (persen yang berlaku saat transaksi, untuk struk), `sale.void_approved_by` (penyetuju void lewat PIN); `sale_line.name` dan `sale_line.category` (nama dan kategori menu saat dijual, supaya struk lama tidak berubah bila menu diganti).
14. Jurnal akuntansi dan potong stok dari resep belum dibuat di tahap 3B. `sale.hpp` dan `sale_line.hpp` diisi 0, dan penjualan tidak ditolak walau stok bahan kurang. Jurnal penjualan (RANCANGAN 6.1) dan mutasi `stock_ledger` penjualan akan dibentuk ulang dari data `sale`, `sale_line`, dan `sale_payment` (termasuk status Void dan waktu void) saat modul stok (tahap 4) dan akuntansi (tahap 5) dibangun. Jurnal selisih kas saat tutup shift juga dibentuk ulang dari `shift.cash_diff`.
15. Kas seharusnya = modal awal + jumlah `sale_payment.amount` metode berjenis `tunai` dari penjualan yang tidak void (sudah bersih dari kembalian) + kas masuk laci - kas keluar laci. Metode tunai dikenali dari `payment_method.kind = 'tunai'`.
16. Batas selisih kas memakai saklar `pos.batas_selisih_kas` milik peran kasir pemilik shift (bawaan Rp 10.000), diubah Owner lewat Saklar Fitur. Saklar nyala dengan batas: selisih mutlak di atas batas membuat status `PerluPersetujuan`. Saklar nyala tanpa batas: tidak pernah perlu persetujuan. Saklar mati: setiap selisih yang bukan nol perlu persetujuan. Owner (Setujui di `kasir.shift`) menyetujui dengan catatan wajib, lalu status menjadi `Tutup`.
17. Tutup shift memakai hitung buta: kas seharusnya, rekap per metode, dan selisih baru tampil sesudah shift ditutup. Kas dihitung boleh lewat hitung pecahan (disimpan di `shift.denominations_json`); bila pecahan diisi, totalnya yang dipakai.
18. "Milik sendiri" di matriks Kasir (RANCANGAN 8.2) diterapkan lewat izin Lihat `laporan.penjualan`: pemegangnya (Owner dan Admin) melihat dan mengelola shift serta transaksi semua kasir, selain itu hanya shift miliknya. Ini mengikuti admin lama yang memakai izin laporan untuk riwayat semua shift.
19. Satu pengguna hanya punya satu shift berstatus `Buka`. Buka shift mengunci baris `app_user` (FOR UPDATE), dan penjualan, void, kas laci, serta tutup shift mengunci baris `shift` lebih dulu, jadi tidak ada penjualan yang masuk sesudah kas dihitung.
20. Void: langsung bila memegang Ubah di `kasir.transaksi` dan saklar `pos.void`. Tanpa itu, void butuh PIN penyetuju yang memegang keduanya (RANCANGAN 8.3, Kasir meminta PIN Admin). Alasan wajib, status menjadi `Void` tanpa menghapus baris, dan kunjungan member dikurangi satu. Void sesudah shift ditutup hanya boleh bila yang mengizinkan berperan Owner (Owner sendiri atau penyetuju Owner lewat PIN).
21. Nomor penjualan `GB-YYMM-NNNN` dari `doc_sequence` (`doc_type` `sale`), berbeda dari admin lama yang memakai `GBYYMMDD-NNN` per hari.
22. Pajak dan service diambil dari `branch.tax_pct` dan `branch.service_pct` lokasi shift. Seed membuat cabang Greenbox dan lokasi Outlet (jenis `outlet`, pajak dan service 0 persen, sama dengan admin lama) bila belum ada lokasi. Lokasi shift: `app_user.location_id`, lalu lokasi aktif berjenis outlet, lalu lokasi aktif pertama. Pengubahan persen menunggu menu Lokasi dan profil usaha (tahap 6).
23. Potongan member versi tahap 3B (tingkat dari `tier_id` bila diisi, semua baris kena potongan) diganti aturan akhir di butir 24 saat integrasi.

Integrasi tahap 3A dan 3B (migrasi `20261120140000_tahap3c_paket_kasir`):

24. Aturan akhir potongan member, satu sumber di `src/lib/member.ts`. Tingkat yang berlaku = `tingkatUntuk(visits)`: tingkat aktif dengan `min_visits` tertinggi yang sudah dicapai, atau tidak ada tingkat bila belum ada yang tercapai. Persennya = `potonganMember`: `discount_pct` tingkat itu bila member aktif, `discount_on` nyala, dan tingkatnya aktif; selain itu 0. Kasir menghitung tingkat dari kunjungan saat transaksi (bukan dari `tier_id` yang tersimpan), dan persen yang dipakai disimpan di `sale.member_pct`. Potongan hanya untuk baris menu biasa; baris paket set tidak kena potongan (admin lama: hanya baris reguler). Hitungannya `hitungKeranjang` di `src/lib/hitung-kasir.ts`, dipakai layar kasir dan server. Penjualan menambah satu kunjungan dan void menguranginya (tidak di bawah 0) lewat `catatKunjungan`, yang sekaligus menghitung ulang `tier_id` dalam satu pernyataan.
25. Pencarian member di kasir memakai `normalisasiWa` (`src/lib/wa.ts`, dipakai bersama modul member), jadi "0812...", "+62 812..." dan "812..." menemukan member yang sama dari kolom `member.wa` berformat 62. Member nonaktif tidak ditemukan, dan penjualan dengan member nonaktif ditolak di server.
26. Layar kasir hanya menampilkan kategori dan menu yang aktif, diurutkan menurut `menu_category.sort` lalu `menu_item.sort`, dengan nama kategori dari `menu_category`. Server juga menolak menu yang kategorinya nonaktif.
27. Paket set dijual di layar kasir sebagai kelompok "Paket set" (paket aktif yang menu utama dan minumannya aktif). Satu paket satu baris `sale_line`: `menu_set_id` terisi sebagai penanda paket, `menu_item_id` berisi menu utama, `set_drink_item_id` berisi minuman saat dijual (CHECK: keduanya terisi atau keduanya kosong), `price` harga paket, `name` "Paket <nama paket>", dan `category` `paket`. Potong stok tahap 4 untuk baris paket memakai resep menu utama dan minuman dari baris itu, bukan isi `menu_set` saat ini yang bisa sudah diubah.
28. Tertunda: promo (`promo`, jenis persen, nominal, hadiah) belum diterapkan otomatis di kasir. Alasannya: aturan gabungnya belum diputuskan (admin lama menulis potongan member tidak digabung dengan Early set atau promo lain, tetapi urutan promo terhadap potongan member, service, dan pajak belum ada), kolom `condition` berupa teks bebas yang tidak bisa dievaluasi mesin, promo hadiah butuh baris Rp 0 yang ikut memotong stok di tahap 4, dan `sale` belum punya kolom untuk mencatat promo yang dipakai. Sampai diputuskan, promo hanya data master untuk ditampilkan dan diterapkan manual oleh kasir; penerapan otomatis menunggu keputusan aturan tersebut.
29. Data uji kasir (`scripts/seed-kasir-uji.ts`) memakai kategori dan tingkat yang sudah ada atau membuatnya dulu dengan kode dan nama yang sama dengan `impor:menu`, menyimpan WA member dalam format 62, dan menambah paket uji "Sarapan Uji". Menu uji bernama lain dari menu hasil impor supaya harga menu impor tidak ditimpa.

Tahap 4A (persediaan, migrasi `20261120150000_tahap4a_stok`):

30. Tahap 4A, skema (migrasi `tahap4a_stok`): `stock_balance` menambah `value` (rupiah) dan `avg_cost` (harga rata-rata per lokasi); `stock_ledger` menambah `balance_value` dan `doc_no`, indeks `(product_id, location_id, id)`, CHECK `qty <> 0`, dan trigger yang menolak `UPDATE`, `DELETE`, dan `TRUNCATE` (ledger hanya bertambah seperti `audit_log`); `location` menambah `code` unik (bawaan `HO` dan `OUTLET`); `stock_reason` menambah `code` unik untuk alasan sistem (`saldo_awal`); `unit` menambah `active`.
31. Penilaian rata-rata tertimbang per lokasi (`stock_balance.avg_cost`), bukan per produk. RANCANGAN tidak menentukan, dan per lokasi membuat Pindah Stok netral nilai. `product.avg_cost` diisi rata-rata gabungan semua lokasi (dipakai HPP menu nanti), `product.last_cost` diisi harga gerak masuk yang ditandai harga beli.
32. Gerak keluar yang membuat qty tepat 0 mengeluarkan seluruh sisa nilai, supaya saldo nol selalu bernilai nol. Akibatnya gerak balik bisa bernilai sedikit berbeda dari gerak asalnya bila di antaranya ada gerak lain dan qty kembali tepat 0; selisih ini tercatat di ledger dan harus dijurnal sebagai selisih penilaian saat modul jurnal ada. Di luar kasus itu gerak balik memakai nilai persis dokumen asal (RANCANGAN 2.3 butir 3).
33. Aturan persetujuan bawaan tahap 4A di `approval_rule`: `stock_opname` (semua opname) dan `stock_adjustment` (hanya penyesuaian yang punya baris tambah; dokumen yang semua barisnya kurang boleh langsung Diposting). Persetujuan dokumen stok satu langkah: pemegang S dan P menekan "Setujui dan posting" dari Diajukan. Aturan dokumen pembelian menyusul di tahap 4 berikutnya.
34. Master Lokasi sederhana (kode, nama, jenis, izin stok minus, aktif) memakai kode menu `atur.lokasi` dari tahap 6. Profil usaha dan cabang belum punya halaman; satu cabang `GB` dibuat oleh seed.
35. Tanggal dokumen persediaan tidak boleh lewat dari hari ini (WIB) dan hanya boleh mundur sejauh saklar `dok.tanggal_mundur` (mati berarti hanya hari ini, nyala tanpa batas berarti bebas mundur sampai tutup periode ada di tahap 5). Diperiksa saat draf dibuat, saat kepala diubah, dan saat diposting.
36. Jurnal akuntansi belum dibentuk di tahap 4A. Saat modul jurnal ada (tahap 5), jurnal dokumen persediaan dibentuk dari `stock_ledger` per dokumen (`doc_type`, `doc_id`): penyesuaian dan opname berlawanan dengan akun alasan (`stock_reason.account_id`), pindah stok tidak berjurnal (satu akun persediaan), dan gerak balik membentuk jurnal balik bertanggal hari pembatalan (`reversal_journal_id`). Kolom `account_id` alasan dibiarkan kosong sampai saat itu.
37. Impor `npm run impor:stok` (`scripts/impor-stok.ts`, logika `src/lib/stok/impor.ts`) memindahkan 28 bahan dari data contoh admin lama (`ING` di `src/admin/contoh.ts`, disalin) menjadi produk berkode `BHN-<id>` dengan kategori Bahan minuman, Bahan makanan, dan Kemasan, lalu stok akhirnya menjadi saldo awal di lokasi Outlet lewat satu Penyesuaian Stok berasalan "Saldo awal" yang langsung Diposting dengan harga rata-rata lama. Idempoten: produk yang kodenya sudah ada dilewati dan bahan yang sudah punya gerak di Outlet tidak diberi saldo awal lagi.

## 12. Persediaan dan mesin stok (tahap 4A)

### 12.1 Prinsip

- `stock_ledger` adalah satu-satunya sumber gerak stok (RANCANGAN prinsip 1). Tidak ada kode yang menulis `stock_ledger` atau `stock_balance` selain `src/lib/stok/mesin.ts`. `stock_balance` hanya ringkasan dan bisa dihitung ulang dari ledger kapan saja.
- Qty dalam satuan dasar produk, paling banyak 3 desimal, bertanda (plus masuk, minus keluar, tidak pernah 0). Harga satuan per satuan dasar, 4 desimal. Nilai baris dan saldo nilai rupiah bulat; pembulatan setengah menjauhi nol, sehingga gerak balik menghasilkan angka yang simetris. Hitungan memakai `Prisma.Decimal`, tidak pernah `number`.
- Rata-rata tertimbang per produk per lokasi, dihitung ulang setiap barang masuk: `rata baru = (nilai saldo + nilai masuk) / (qty saldo + qty masuk)`. Barang keluar memakai harga rata-rata saat itu dan tidak mengubahnya. Gerak balik menghitung ulang rata-rata dari saldo sesudahnya.
- Stok minus ditolak dengan `GalatAturan` ("Stok X di Y tidak cukup: tersedia a, perlu b") kecuali `location.allow_negative_stock` atau pemanggil memberi `izinkanMinus`. Seluruh transaksi pemanggil ikut batal.

### 12.2 API (`src/lib/stok/mesin.ts`)

```ts
type DokumenAsal = { docType: string; docId: number; docNo: string; tanggal: Date; oleh: number | null }
type Gerak = {
  productId: number; locationId: number
  qty: Decimal | string | number          // bertanda, satuan dasar
  hargaSatuan?: Decimal | string | null   // hanya masuk; kosong = harga rata-rata lokasi (lalu last_cost)
  nilai?: bigint | null                    // hanya masuk; nilai total pasti, mengalahkan hargaSatuan
  lineId?: number | null
}
type OpsiGerak = { izinkanMinus?: boolean; hargaBeli?: boolean }   // hargaBeli: perbarui product.last_cost
type HasilGerak = { ledgerId, productId, locationId, lineId, qty, hargaSatuan, nilai: bigint, saldoQty, saldoNilai: bigint, hargaRata }

catatGerak(tx, dok, gerak[], opsi?): Promise<HasilGerak[]>
pindahStok(tx, dok, { productId, dari, ke, qty, lineId }[], opsi?): Promise<HasilGerak[]>   // keluar lalu masuk, nilai sama persis
balikDokumen(tx, dok, opsi?): Promise<HasilGerak[]>    // dok.tanggal = hari pembatalan; gagal bila sudah pernah dibalik
periksaSaldo(db, { productId?, locationId? }?): Promise<SelisihSaldo[]>   // kosong berarti saldo cocok dengan ledger
periksaRantai(db): Promise<number>                      // baris ledger yang saldo berjalannya putus
hitungUlangSaldo(tx, { productId?, locationId? }?)      // tulis ulang stock_balance dari ledger, kembalikan yang diperbaiki
saldoDi(db, productId, locationId)                      // baca saldo tanpa kunci
```

Aturan pemakaian:

1. Selalu di dalam `db.$transaction(async (tx) => ...)` milik pemanggil, bersama perubahan status dokumen dan `catatAudit`. Kalau satu gerak gagal, semuanya batal.
2. Satu panggilan per dokumen dengan semua barisnya. Mesin mengunci baris `stock_balance` (`INSERT ... ON CONFLICT DO NOTHING` lalu `SELECT ... FOR UPDATE`) berurutan menurut produk lalu lokasi, lalu baris `product` berurutan menurut id, sehingga dua transaksi yang menyentuh pasangan yang sama tidak saling mengunci silang. Bila satu transaksi memanggil mesin lebih dari sekali, PostgreSQL bisa menggagalkan salah satu transaksi yang bersamaan dengan kode `40P01`; pemanggil boleh mengulang.
3. `docType` memakai nama tabel dokumen (`stock_adjustment`, `goods_receipt`, `sale`, ...). Tambahkan barisnya di `TAUTAN_DOK` (`src/lib/stok/posisi.ts`) bila dokumen itu punya halaman, supaya kartu stok bisa menautkannya.
4. Pembatalan dokumen Diposting: panggil `balikDokumen` dengan `docType` dan `docId` yang sama dan `tanggal` hari pembatalan. Jangan menulis gerak kebalikan sendiri.
5. Mesin tidak memeriksa izin, saklar, status dokumen, atau produk nonaktif; itu tugas modul dokumen. Mesin hanya memeriksa angka, keberadaan produk dan lokasi, dan stok minus.

Contoh untuk modul berikutnya:

```ts
// Penerimaan barang (pembelian): qty beli dikonversi ke satuan dasar lewat product_unit.factor_to_base.
await catatGerak(tx, { docType: 'goods_receipt', docId: gr.id, docNo: gr.no, tanggal: gr.date, oleh: p.id },
  baris.map((b) => ({ productId: b.productId, locationId: gr.locationId, qty: des(b.qty).times(b.faktor), nilai: b.nilaiRupiah, lineId: b.id })),
  { hargaBeli: true })

// Produksi cepat: bahan keluar dulu, hasil masuk dengan nilai = jumlah nilai bahan + biaya tambahan.
const bahan = await catatGerak(tx, dok, resep.map((r) => ({ productId: r.productId, locationId: dari, qty: des(r.qty).neg(), lineId: r.id })))
const nilaiBahan = bahan.reduce((n, h) => n - h.nilai, 0n)
await catatGerak(tx, dok, [{ productId: hasil.id, locationId: ke, qty: qtyHasil, nilai: nilaiBahan + biayaTambahan }])
// (dua panggilan dalam satu transaksi: lihat aturan 2)

// Kasir: potong bahan resep per penjualan di lokasi kasir, HPP = jumlah nilai keluar.
const g = await catatGerak(tx, { docType: 'sale', docId: sale.id, docNo: sale.no, tanggal: hariIni(), oleh: kasir.id },
  pemakaian.map((u) => ({ productId: u.productId, locationId: shift.locationId, qty: des(u.qty).neg() })))
const hpp = g.reduce((n, h) => n - h.nilai, 0n)
// Void: balikDokumen(tx, { docType: 'sale', docId: sale.id, docNo: sale.no, tanggal: hariIni(), oleh: p.id })
```

### 12.3 Dokumen persediaan

- Penyesuaian Stok (`PS`), Stock Opname (`OP`), Pindah Stok (`PD`) adalah dokumen pelaksana (bagian 3.2). Satu pintu perubahan status: `ubahStatusDok` di `src/lib/stok/dokumen.ts`, yang mengunci kepala dokumen, memeriksa transisi, izin, saklar, tanggal, menggerakkan stok saat Diposting, dan menulis audit.
- Izin: buat draf T; ubah kepala dan baris, ajukan T atau U; hapus draf H; kembalikan ke draf S atau pengaju sendiri; posting P, ditambah S bila dokumen wajib disetujui; batal dari Draft atau Diajukan U; batal dari Diposting P, saklar `dok.batal_posting`, dan alasan minimal 5 huruf.
- Penyesuaian: baris kurang butuh saklar `stok.sesuai_kurang` dan selalu memakai harga rata-rata; baris tambah butuh `stok.sesuai_tambah`, harga satuan boleh diisi atau kosong (rata-rata lokasi, lalu harga beli terakhir; bila keduanya 0, posting ditolak). Saklar diperiksa saat baris ditambah dan saat diposting. Alasan wajib (kolom NOT NULL); alasan sistem tidak ditawarkan di layar.
- Opname: draf membekukan qty sistem semua produk aktif di lokasi (bisa disaring kategori, paling banyak 500). Saat Diposting, gerak = qty fisik - qty sistem beku untuk baris yang sudah dihitung dan berselisih; gerak lain sesudah pembekuan tetap terhitung. Saklar `stok.wajib_alasan` mewajibkan alasan untuk baris berselisih saat diajukan dan diposting.
- Pindah Stok: satu produk satu baris; keluar dari asal dengan harga rata-rata asal dan masuk ke tujuan dengan nilai sama persis.
- Baris dokumen menyimpan harga satuan yang benar-benar dipakai mesin saat diposting (`unit_cost`).
- Nilai rupiah persediaan hanya tampil untuk pemegang saklar `stok.lihat_nilai`.
