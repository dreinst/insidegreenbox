-- Keputusan user 24 November 2026 (KONTRAK 11 butir 123 sampai 125): riwayat tarif MDR per metode bayar.
CREATE TABLE "payment_method_mdr" (
    "id" SERIAL NOT NULL,
    "payment_method_id" INTEGER NOT NULL,
    "mdr_pct" DECIMAL(6,3) NOT NULL,
    "free_limit" BIGINT,
    "effective_from" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_method_mdr_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "payment_method_mdr_persen" CHECK ("mdr_pct" >= 0 AND "mdr_pct" <= 20),
    CONSTRAINT "payment_method_mdr_batas" CHECK ("free_limit" IS NULL OR "free_limit" >= 0)
);
CREATE UNIQUE INDEX "payment_method_mdr_payment_method_id_effective_from_key" ON "payment_method_mdr"("payment_method_id", "effective_from");
ALTER TABLE "payment_method_mdr" ADD CONSTRAINT "payment_method_mdr_payment_method_id_fkey" FOREIGN KEY ("payment_method_id") REFERENCES "payment_method"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Tarif awal untuk metode yang sudah ada. Tanggal awal = tanggal WIB penjualan pertama (atau hari ini bila belum
-- ada penjualan), supaya semua penjualan lama punya tarif. Instalasi baru belum punya metode, jadi bagian ini
-- tidak mengisi apa pun dan tarif bawaan datang dari seed (isiMetodeBayar).
-- Metode yang MDR-nya sudah diubah user (bukan 0) memakai nilainya sendiri dan tidak ditimpa bawaan.
WITH awal AS (
  SELECT LEAST(
    COALESCE(MIN(("at" AT TIME ZONE 'Asia/Jakarta')::date), (now() AT TIME ZONE 'Asia/Jakarta')::date),
    (now() AT TIME ZONE 'Asia/Jakarta')::date
  ) AS d FROM "sale"
)
INSERT INTO "payment_method_mdr" ("payment_method_id", "mdr_pct", "free_limit", "effective_from", "note")
SELECT m."id",
  CASE
    WHEN m."kind" = 'debit' AND m."mdr_pct" = 0 AND lower(m."name") = 'debit mandiri' THEN 0.15
    WHEN m."kind" = 'debit' AND m."mdr_pct" = 0 THEN 1
    ELSE m."mdr_pct"
  END,
  NULL,
  awal.d,
  CASE
    WHEN m."kind" = 'tunai' THEN 'Tunai tanpa MDR.'
    WHEN m."kind" = 'debit' AND m."mdr_pct" = 0 AND lower(m."name") = 'debit mandiri' THEN 'Bawaan kartu Mandiri di EDC Mandiri (on-us), bankmandiri.co.id/edc.'
    WHEN m."kind" = 'debit' AND m."mdr_pct" = 0 THEN 'Bawaan kartu bank lain di EDC Mandiri, bankmandiri.co.id/edc.'
    WHEN m."kind" = 'qris' AND m."mdr_pct" = 0 THEN 'Tarif sistem sebelum aturan BI 1 Oktober 2026.'
    ELSE 'Tarif dari pengaturan metode sebelum ada riwayat tarif.'
  END
FROM "payment_method" m CROSS JOIN awal
-- QRIS yang masih 0 dan penjualan pertamanya sejak 1 Oktober 2026 cukup memakai tarif BI di bawah.
WHERE NOT (m."kind" = 'qris' AND m."mdr_pct" = 0 AND awal.d >= DATE '2026-10-01');

-- QRIS usaha mikro: 0,3% untuk transaksi di atas Rp 500.000, bebas MDR sampai Rp 500.000, sejak 1 Oktober 2026
-- (BI, siaran pers 28/159/DKom 17 Agustus 2026). Hanya untuk QRIS yang MDR-nya belum diubah user.
INSERT INTO "payment_method_mdr" ("payment_method_id", "mdr_pct", "free_limit", "effective_from", "note")
SELECT m."id", 0.3, 500000, DATE '2026-10-01', 'Aturan BI MDR QRIS usaha mikro, siaran pers 28/159/DKom.'
FROM "payment_method" m
WHERE m."kind" = 'qris' AND m."mdr_pct" = 0;

-- Metode baru Debit Mandiri (kartu Mandiri, on-us) bila belum ada, hanya untuk data yang sudah punya metode bayar.
INSERT INTO "payment_method" ("name", "kind", "mdr_pct", "open_drawer", "active")
SELECT 'Debit Mandiri', 'debit', 0.15, false, true
WHERE EXISTS (SELECT 1 FROM "payment_method")
  AND NOT EXISTS (SELECT 1 FROM "payment_method" WHERE lower("name") = 'debit mandiri');

INSERT INTO "payment_method_mdr" ("payment_method_id", "mdr_pct", "free_limit", "effective_from", "note")
SELECT m."id", 0.15, NULL, (now() AT TIME ZONE 'Asia/Jakarta')::date, 'Bawaan kartu Mandiri di EDC Mandiri (on-us), bankmandiri.co.id/edc.'
FROM "payment_method" m
WHERE lower(m."name") = 'debit mandiri'
  AND NOT EXISTS (SELECT 1 FROM "payment_method_mdr" t WHERE t."payment_method_id" = m."id");

-- Kliring Debit Mandiri ke akun 1-1420 seperti metode debit lain (migrasi tahap5b).
INSERT INTO "account_mapping" ("key", "account_id", "updated_at")
SELECT 'kliring.' || m."id", a."id", now() FROM "payment_method" m JOIN "account" a ON a."code" = '1-1420'
WHERE lower(m."name") = 'debit mandiri'
ON CONFLICT ("key") DO NOTHING;

-- payment_method.mdr_pct tidak dibaca kode baru. Kolom ini diisi persen tarif yang berlaku hari ini supaya image
-- lama tetap memakai angka yang masuk akal bila rilis dimundurkan.
UPDATE "payment_method" m SET "mdr_pct" = t."mdr_pct"
FROM (
  SELECT DISTINCT ON ("payment_method_id") "payment_method_id", "mdr_pct"
  FROM "payment_method_mdr"
  WHERE "effective_from" <= (now() AT TIME ZONE 'Asia/Jakarta')::date
  ORDER BY "payment_method_id", "effective_from" DESC
) t
WHERE t."payment_method_id" = m."id";
