# syntax=docker/dockerfile:1
# Image admin Greenbox. Konteks build adalah akar repo, karena impor menu membaca src/data.ts situs dan foto menu
# diambil dari public/img situs:
#   docker build -f sistem/Dockerfile -t greenbox-admin:<hash> .
#   docker build -f sistem/Dockerfile --target alat -t greenbox-admin-alat:<hash> .
# Target bawaan (jalan) hanya berisi server standalone. Target alat berisi node_modules lengkap dan sumber, dipakai
# sebagai container sekali pakai untuk prisma migrate deploy, seed, impor, dan jurnal:bentuk-ulang.

FROM node:24-alpine AS dasar
# Prisma memakai openssl untuk menentukan platform mesin skema.
RUN apk add --no-cache openssl
WORKDIR /repo/sistem
ENV NEXT_TELEMETRY_DISABLED=1

FROM dasar AS deps
COPY sistem/package.json sistem/package-lock.json sistem/prisma.config.ts ./
COPY sistem/prisma ./prisma
# Hanya supaya prisma.config.ts bisa dibaca saat postinstall (prisma generate); tidak ada koneksi ke basis data.
ENV DATABASE_URL=postgresql://bangun:bangun@127.0.0.1:5432/bangun
RUN npm ci --no-audit --no-fund
# npm ci bisa diam-diam melewati paket biner opsional yang gagal diunduh. Build berhenti di sini kalau ada yang hilang.
RUN set -e; \
    ls node_modules/@prisma/engines/schema-engine-linux-musl-* >/dev/null; \
    test -f src/generated/prisma/client.ts; \
    node -e "require('@next/swc-linux-' + process.arch + '-musl')"; \
    node -e "require('esbuild').transformSync('let a = 1')"; \
    node -e "require('sharp')"; \
    echo 'modul biner lengkap'

FROM deps AS bangun
COPY sistem/ ./
COPY src/data.ts /repo/src/data.ts
COPY public/img /repo/public/img
RUN NODE_OPTIONS=--max-old-space-size=1536 npm run build

# Container sekali pakai: migrasi, seed, impor, dan skrip lain dari package.json.
FROM deps AS alat
COPY sistem/ ./
COPY src/data.ts /repo/src/data.ts
COPY public/img /repo/public/img
ENV SITUS_IMG_DIR=/repo/public/img UNGGAHAN_DIR=/data/unggahan
USER node
CMD ["npx", "prisma", "migrate", "status"]

FROM node:24-alpine AS jalan
WORKDIR /repo/sistem
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    NODE_OPTIONS=--max-old-space-size=256 \
    SITUS_IMG_DIR=/repo/public/img \
    UNGGAHAN_DIR=/data/unggahan
# Berkas app milik root dan hanya bisa dibaca pengguna node. Yang boleh ditulis hanya unggahan dan cache Next.
COPY --from=bangun /repo/sistem/.next/standalone ./
COPY --from=bangun /repo/sistem/.next/static ./.next/static
COPY --from=bangun /repo/public/img /repo/public/img
RUN mkdir -p /data/unggahan .next/cache && chown node:node /data/unggahan .next/cache
USER node
EXPOSE 3000
HEALTHCHECK --interval=60s --timeout=5s --start-period=30s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/masuk || exit 1
CMD ["node", "server.js"]
