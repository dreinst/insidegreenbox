#!/usr/bin/env bash
# Uji klik terhadap build produksi (npm run build dulu). Basis data greenbox_e2e dibuat ulang tiap kali,
# lalu dimigrasi dan diisi seed serta seed:contoh. Server jalan dengan TRUST_PROXY=1 supaya tiap konteks uji
# memakai IP sendiri lewat X-Forwarded-For. Server dimatikan lagi di akhir, berhasil atau gagal.
set -euo pipefail
cd "$(dirname "$0")/../.."
# .env dibaca lewat dotenv (bukan source) karena nilainya boleh berisi spasi.
DATABASE_URL="$(node -e "require('dotenv').config({ quiet: true }); process.stdout.write(process.env.DATABASE_URL || '')")"
PORT="${E2E_PORT:-3241}"
# Nama basis data e2e bisa diganti lewat E2E_DB supaya dua sesi kerja tidak saling menimpa.
NAMA_DB="${E2E_DB:-greenbox_e2e}"
DB_E2E="${DATABASE_URL%/*}/$NAMA_DB"
DB_ADMIN="${DATABASE_URL%/*}/postgres"

node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: process.argv[1] });
const n = process.argv[2];
if (!/^[a-z0-9_]+$/.test(n)) throw new Error('E2E_DB hanya huruf kecil, angka, dan garis bawah.');
c.connect().then(() => c.query('DROP DATABASE IF EXISTS ' + n + ' WITH (FORCE)')).then(() => c.query('CREATE DATABASE ' + n)).then(() => c.end());
" "$DB_ADMIN" "$NAMA_DB"
DATABASE_URL="$DB_E2E" npx prisma migrate deploy > /dev/null
DATABASE_URL="$DB_E2E" npx prisma db seed > /dev/null
DATABASE_URL="$DB_E2E" npx tsx scripts/seed-contoh.ts > /dev/null
# tahap 3A: kategori, menu, paket, tingkat, dan metode bayar untuk uji modul master.
DATABASE_URL="$DB_E2E" npx tsx scripts/impor-menu.ts > /dev/null
# tahap 3B: menu, metode bayar, dan member uji untuk alur kasir.
DATABASE_URL="$DB_E2E" npx tsx scripts/seed-kasir-uji.ts > /dev/null
# tahap 4A: bahan dan saldo awal admin lama untuk uji persediaan.
DATABASE_URL="$DB_E2E" npx tsx scripts/impor-stok.ts > /dev/null
# tahap 4C: pemasok dan pesanan admin lama (PO yang sudah diterima menjadi riwayat tanpa gerak stok).
DATABASE_URL="$DB_E2E" npx tsx scripts/impor-beli.ts > /dev/null

DATABASE_URL="$DB_E2E" TRUST_PROXY=1 HTTPS_AKTIF=0 NODE_OPTIONS=--max-old-space-size=256 \
  node node_modules/next/dist/bin/next start -p "$PORT" > tests/hasil/server-e2e.log 2>&1 &
SERVER=$!
matikan() {
  local anak
  anak=$(ps -A -o pid=,ppid= | awk -v p="$SERVER" '$2==p {print $1}')
  kill $anak "$SERVER" 2> /dev/null || true
}
trap matikan EXIT
for _ in $(seq 1 40); do
  curl -s -o /dev/null "http://127.0.0.1:$PORT/masuk" && break
  sleep 1
done
# Berkas uji dijalankan berurutan; semuanya selalu jalan, dan skrip gagal bila salah satunya gagal.
# klik.mjs paling akhir, karena bagian 6 sengaja mengunci login sandi Admin selama 15 menit.
HASIL=0
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/kasir.mjs || HASIL=1
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/master.mjs || HASIL=1
# tahap 5A: laporan dan setoran memakai shift yang ditinggalkan kasir.mjs, jadi berjalan sesudahnya.
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/laporan.mjs || HASIL=1
# tahap 4A: persediaan.
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/stok.mjs || HASIL=1
# tahap 4B: resep, potong stok penjualan, dan produksi.
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/produksi.mjs || HASIL=1
# tahap 4C: pembelian, sesudah stok.mjs karena memakai bahan dan saldo awal impor.
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/pembelian.mjs || HASIL=1
# tahap 5B: akuntansi (jual lalu buku besar, memorial, laporan keuangan, tutup periode, akses).
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/akuntansi.mjs || HASIL=1
# tahap 6A: penjualan B2B dan profil usaha, sesudah pembelian.mjs (konversi kg biji kopi) dan kasir.mjs (struk), sebelum klik.mjs.
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/b2b.mjs || HASIL=1
# tahap 6B: jurnal B2B, aset tetap, dan anggaran, sesudah b2b.mjs (piutang) dan sebelum klik.mjs.
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/aset.mjs || HASIL=1
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/klik.mjs || HASIL=1
exit $HASIL
