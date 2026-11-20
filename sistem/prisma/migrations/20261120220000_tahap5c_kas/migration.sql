-- Tahap 5C: jurnal pembelian, Kas Masuk dan Keluar, Pindah Dana, Rekonsiliasi Bank (KONTRAK 11 butir 87 dan seterusnya).

-- AlterTable
ALTER TABLE "bank_reconcile" ADD COLUMN     "outstanding" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "bank_statement_line" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" INTEGER,
ADD COLUMN     "dedup_key" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "cash_transaction" ADD COLUMN     "bank_account_id" INTEGER,
ADD COLUMN     "to_bank_account_id" INTEGER;

-- AlterTable
ALTER TABLE "journal_line" ADD COLUMN     "bank_account_id" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "bank_statement_line_bank_account_id_dedup_key_key" ON "bank_statement_line"("bank_account_id", "dedup_key");

-- CreateIndex
CREATE INDEX "journal_line_bank_account_id_idx" ON "journal_line"("bank_account_id");

-- Pengaman isi.
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_jenis" CHECK ("kind" IN ('masuk', 'keluar', 'pindah'));
ALTER TABLE "cash_transaction" ADD CONSTRAINT "cash_transaction_jumlah_tidak_minus" CHECK ("amount" >= 0);
ALTER TABLE "cash_transaction_line" ADD CONSTRAINT "cash_transaction_line_jumlah_positif" CHECK ("amount" > 0);
ALTER TABLE "bank_statement_line" ADD CONSTRAINT "bank_statement_line_satu_sisi" CHECK ("debit" >= 0 AND "credit" >= 0 AND ("debit" = 0 OR "credit" = 0) AND "debit" + "credit" > 0);
ALTER TABLE "bank_reconcile_match" ADD CONSTRAINT "bank_reconcile_match_jumlah_bukan_nol" CHECK ("amount" <> 0);
ALTER TABLE "bank_reconcile" ADD CONSTRAINT "bank_reconcile_periode_urut" CHECK ("period_from" <= "period_to");

-- Satu rekonsiliasi Draft per rekening; rekonsiliasi berikutnya baru boleh dibuat sesudah yang lama Diposting atau Batal.
CREATE UNIQUE INDEX "bank_reconcile_satu_draf" ON "bank_reconcile"("bank_account_id") WHERE "status" = 'Draft';

-- Baris bank setoran POS yang sudah berlaku diberi penanda rekening tujuannya (kolom baru di atas).
UPDATE "journal_line" jl SET "bank_account_id" = ps."bank_account_id"
FROM "journal" j JOIN "pos_settlement" ps ON j."source_type" = 'pos_settlement' AND ps."id" = j."source_id"
WHERE jl."journal_id" = j."id" AND ps."bank_account_id" IS NOT NULL
  AND jl."account_id" = COALESCE(
    (SELECT m."account_id" FROM "account_mapping" m WHERE m."key" = 'bank.' || ps."bank_account_id"),
    (SELECT m."account_id" FROM "account_mapping" m WHERE m."key" = 'bank'));

-- Kunci pemetaan baru: beban baris jasa faktur dan baris hanya biaya pembelian langsung.
INSERT INTO "account_mapping" ("key", "account_id", "updated_at")
SELECT 'beban_beli', a."id", now() FROM "account" a WHERE a."code" = '6-1900'
ON CONFLICT ("key") DO NOTHING;

-- Aturan persetujuan Kas dan Bank (RANCANGAN 2.2): kas keluar dan pindah dana disetujui dulu, lalu diposting saat uang
-- benar-benar bergerak. Kas masuk tanpa aturan.
INSERT INTO "approval_rule" ("doc_type", "requires_approval", "updated_at") VALUES
  ('cash_transaction.keluar', true, now()),
  ('cash_transaction.pindah', true, now())
ON CONFLICT ("doc_type") DO NOTHING;
