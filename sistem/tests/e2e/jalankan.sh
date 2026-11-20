#!/usr/bin/env bash
# Uji klik terhadap build produksi (npm run build dulu). Basis data greenbox_e2e dibuat ulang tiap kali,
# lalu dimigrasi dan diisi seed serta seed:contoh. Server jalan dengan TRUST_PROXY=1 supaya tiap konteks uji
# memakai IP sendiri lewat X-Forwarded-For. Server dimatikan lagi di akhir, berhasil atau gagal.
set -euo pipefail
cd "$(dirname "$0")/../.."
# .env dibaca lewat dotenv (bukan source) karena nilainya boleh berisi spasi.
DATABASE_URL="$(node -e "require('dotenv').config({ quiet: true }); process.stdout.write(process.env.DATABASE_URL || '')")"
PORT="${E2E_PORT:-3241}"
DB_E2E="${DATABASE_URL%/*}/greenbox_e2e"
DB_ADMIN="${DATABASE_URL%/*}/postgres"

node -e "
const pg = require('pg');
const c = new pg.Client({ connectionString: process.argv[1] });
c.connect().then(() => c.query('DROP DATABASE IF EXISTS greenbox_e2e WITH (FORCE)')).then(() => c.query('CREATE DATABASE greenbox_e2e')).then(() => c.end());
" "$DB_ADMIN"
DATABASE_URL="$DB_E2E" npx prisma migrate deploy > /dev/null
DATABASE_URL="$DB_E2E" npx prisma db seed > /dev/null
DATABASE_URL="$DB_E2E" npx tsx scripts/seed-contoh.ts > /dev/null

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
BASE_URL="http://127.0.0.1:$PORT" E2E_DATABASE_URL="$DB_E2E" node tests/e2e/klik.mjs
