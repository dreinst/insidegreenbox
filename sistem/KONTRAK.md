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

Enum lain: `pay_status` (`BelumBayar`, `Sebagian`, `Lunas`), `progress` (`Belum`, `Sebagian`, `Penuh`), `shift_status` (`Buka`, `Tutup`, `PerluPersetujuan`), `sale_status` (`Selesai`, `Void`), `account_kind` (`Aset`, `Kewajiban`, `Ekuitas`, `Pendapatan`, `HPP`, `Beban`), `period_status` (`Terbuka`, `Ditutup`). Kolom `kind` lain berupa teks dengan nilai yang divalidasi zod di modulnya.

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

Katalog lengkap ada di `src/lib/katalog.ts` beserta matriks bawaan Owner, Admin, dan Kasir dari RANCANGAN 8.2. Kode berbentuk `grup.menu`, misalnya `beli.faktur`, `stok.opname`, `kasir.shift`. Baris RANCANGAN "Pengaturan: Pengguna, peran, izin, saklar" dipecah menjadi tiga kode (`atur.pengguna`, `atur.peran`, `atur.saklar`) supaya Owner bisa memberi akses satu per satu. Baris "Log aktivitas" menjadi `atur.audit`.

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
- Peran sistem (`owner`, `admin`, `kasir`) tidak bisa dinonaktifkan dan kodenya tidak bisa diubah.
- Owner aktif terakhir tidak bisa dinonaktifkan dan perannya tidak bisa diganti.
- Pengguna tidak bisa menonaktifkan dirinya sendiri dan tidak bisa mengganti perannya sendiri.
- Hanya pengguna berperan Owner yang bisa membuat atau mengubah pengguna berperan Owner, memberi peran Owner, atau mengatur ulang sandi Owner.
- Pengguna bukan Owner tidak bisa mengubah matriks izin atau saklar perannya sendiri.

## 5. Audit trail

- Tabel `audit_log` hanya bertambah. Trigger PostgreSQL menolak `UPDATE`, `DELETE`, dan `TRUNCATE` di tabel itu. Tidak ada halaman, aksi, atau fungsi untuk mengubah atau menghapus audit.
- Setiap perubahan data ditulis lewat `catatAudit(tx, konteks, entri)` di dalam transaksi Prisma yang sama dengan perubahannya. Kalau perubahan gagal, audit ikut batal; kalau audit gagal, perubahan ikut batal.
- Isi baris: waktu, `user_id` (boleh kosong untuk login gagal dengan nama tak dikenal), `actor_name` (nama pengguna saat itu atau yang diketik), `action` (misalnya `pengguna.ubah`), `doc_type` (nama tabel), `doc_id` (teks, karena ada kunci gabungan), `summary` (kalimat pendek bahasa Indonesia), `before_json`, `after_json`, `ip`, `user_agent`.
- `before_json` dan `after_json` dibersihkan oleh `bersihkanUntukAudit`: hash sandi dan PIN tidak pernah disimpan, diganti tanda `"[disembunyikan]"`. BigInt, Decimal, dan tanggal disimpan sebagai teks.
- Peristiwa yang wajib tercatat sejak tahap 2: `masuk.berhasil`, `masuk.gagal`, `masuk.terkunci`, `keluar`, `izin.ditolak`, `pengguna.tambah`, `pengguna.ubah`, `pengguna.sandi`, `pengguna.aktifkan`, `pengguna.nonaktifkan`, `peran.tambah`, `peran.ubah`, `peran.izin`, `peran.aktifkan`, `peran.nonaktifkan`, `saklar.ubah`. Tahap berikutnya menambah peristiwa per dokumen (`<jenis>.tambah`, `.ubah`, `.hapus`, `.ajukan`, `.setujui`, `.posting`, `.batal`).
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
- Login tahap 2 memakai nama pengguna dan sandi untuk ketiga peran. Login PIN kasir di layar kasir menyusul di tahap 3 bersama layar kasirnya.

## 8. Sidebar per tahap

Syarat dari user: setiap item sidebar yang tampil berfungsi penuh ke database (daftar, tambah, ubah, alur status). Tidak ada menu kosong, "segera hadir", atau tautan mati. Item tampil hanya bila peran punya izin Lihat di kode menunya. Modul yang belum dibangun tidak punya item sidebar.

| Tahap | Item sidebar (kode menu) |
|---|---|
| 2 | Beranda (semua pengguna), Pengguna (`atur.pengguna`), Peran dan Izin (`atur.peran`), Saklar Fitur (`atur.saklar`), Jejak Audit (`atur.audit`) |
| 3 | Layar Kasir, Shift, Transaksi, Menu dan Harga, Promo, Member, Metode Bayar; login PIN kasir; admin lama dipindah dari data browser ke server |
| 4 | Produk dan Satuan, Resep dan BOM, Stok, Penyesuaian, Opname, Pindah Stok, Alasan, Pemasok, Permintaan, Pesanan, Penerimaan, Faktur, Retur, Pembelian Langsung, Pembayaran, Perintah Produksi, Pengeluaran Bahan, Hasil Produksi, Produksi Cepat |
| 5 | Laporan, Akun dan Pemetaan, Jurnal Umum, Buku Besar, Tutup Periode, Kas dan Bank, Rekonsiliasi, Setoran POS, Hutang Pemasok |
| 6 | Penjualan B2B, Aset, Anggaran, Lokasi dan Profil Usaha |
| 7 | Migrasi data dari ekspor resmi ESB, uji paralel, lalu ESB dihentikan |

Urutan tahap 3 sampai 5 mengikuti SERAH-TERIMA. Daftar sidebar ada di `src/lib/katalog.ts` (`SIDEBAR`) dan hanya berisi halaman yang sudah ada.

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
- Perintah: `npm run db:setup` (migrasi dan seed), `npm run seed:contoh`, `npm run dev`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`.

## 11. Penyimpangan dari ERD dan perubahan kontrak

1. Tabel tambahan `user_session` dan `login_attempt` untuk sesi di database dan rate limit (bagian 7).
2. `audit_log` menambah kolom `actor_name`, `summary`, dan `user_agent`; `doc_id` bertipe teks.
3. `feature_switch` menambah kolom `sort` untuk urutan tampilan; saklar ke-24 `log.lihat_semua` (bagian 4.4).
4. Satu baris matriks "Pengguna, peran, izin, saklar" menjadi tiga kode menu (bagian 4.3).
5. Kolom `*_by` tanpa foreign key (bagian 3.1); semua tabel dokumen dan master memakai `updated_by` juga, mengikuti RANCANGAN 1 butir 9.
6. Harga satuan per satuan dasar memakai `Decimal(18,4)` (bagian 3.1).
7. `approval_rule` belum diisi di tahap 2. Bawaan RANCANGAN 2.2 diisi di tahap 4 bersama dokumen pembelian.
