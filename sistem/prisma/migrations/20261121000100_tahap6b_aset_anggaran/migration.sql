-- Tahap 6B bagian 2: aset tetap (kategori, perolehan, penyusutan bulanan, pelepasan) dan anggaran (KONTRAK 11).
-- Tabel fixed_asset, asset_depreciation, asset_disposal, budget, dan budget_line belum pernah diisi modul mana pun,
-- jadi kolom wajib baru ditambah tanpa nilai bawaan sementara.

-- Kategori aset tetap.
CREATE TABLE "asset_category" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "useful_months" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_category_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asset_category_umur" CHECK ("useful_months" BETWEEN 1 AND 600)
);
CREATE UNIQUE INDEX "asset_category_code_key" ON "asset_category"("code");
CREATE UNIQUE INDEX "asset_category_name_key" ON "asset_category"("name");

-- Aset tetap: kategori menjadi kunci asing, akumulasi berjalan, sumber dana, jejak aktivasi dan pembatalan.
ALTER TABLE "fixed_asset" DROP COLUMN "category";
ALTER TABLE "fixed_asset" ADD COLUMN "category_id" INTEGER NOT NULL;
ALTER TABLE "fixed_asset" ADD COLUMN "accum_depreciation" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "fixed_asset" ADD COLUMN "bank_account_id" INTEGER;
ALTER TABLE "fixed_asset" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
ALTER TABLE "fixed_asset" ADD COLUMN "activated_by" INTEGER;
ALTER TABLE "fixed_asset" ADD COLUMN "activated_at" TIMESTAMPTZ(6);
ALTER TABLE "fixed_asset" ADD COLUMN "cancelled_by" INTEGER;
ALTER TABLE "fixed_asset" ADD COLUMN "cancelled_at" TIMESTAMPTZ(6);
ALTER TABLE "fixed_asset" ADD COLUMN "cancel_reason" TEXT;
ALTER TABLE "fixed_asset" ADD COLUMN "reversal_journal_id" INTEGER;
ALTER TABLE "fixed_asset" ALTER COLUMN "status" SET DEFAULT 'draft';
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "asset_category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "fixed_asset_category_id_idx" ON "fixed_asset"("category_id");
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_status" CHECK ("status" IN ('draft', 'aktif', 'dilepas', 'batal'));
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_metode" CHECK ("method" = 'garis_lurus');
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_nilai" CHECK ("cost" > 0 AND "salvage" >= 0 AND "salvage" < "cost" AND "useful_months" BETWEEN 1 AND 600);
ALTER TABLE "fixed_asset" ADD CONSTRAINT "fixed_asset_akumulasi" CHECK ("accum_depreciation" >= 0 AND "accum_depreciation" <= "cost" - "salvage");

-- Dokumen penyusutan bulanan: satu dokumen Diposting per bulan.
CREATE TABLE "asset_depreciation_run" (
    "id" SERIAL NOT NULL,
    "no" TEXT NOT NULL,
    "year_month" VARCHAR(7) NOT NULL,
    "date" DATE NOT NULL,
    "total" BIGINT NOT NULL DEFAULT 0,
    "asset_count" INTEGER NOT NULL DEFAULT 0,
    "status" "doc_status" NOT NULL DEFAULT 'Diposting',
    "posted_by" INTEGER,
    "posted_at" TIMESTAMPTZ(6),
    "cancelled_by" INTEGER,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancel_reason" TEXT,
    "reversal_journal_id" INTEGER,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "asset_depreciation_run_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "asset_depreciation_run_status" CHECK ("status" IN ('Diposting', 'Batal')),
    CONSTRAINT "asset_depreciation_run_nilai" CHECK ("total" >= 0 AND "asset_count" >= 0)
);
CREATE UNIQUE INDEX "asset_depreciation_run_no_key" ON "asset_depreciation_run"("no");
CREATE INDEX "asset_depreciation_run_year_month_idx" ON "asset_depreciation_run"("year_month");
CREATE UNIQUE INDEX "asset_depreciation_run_satu_per_bulan" ON "asset_depreciation_run"("year_month") WHERE "status" = 'Diposting';

-- Baris penyusutan per aset menempel ke dokumennya.
ALTER TABLE "asset_depreciation" ADD COLUMN "run_id" INTEGER NOT NULL;
ALTER TABLE "asset_depreciation" ADD COLUMN "accum_after" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "asset_depreciation_run"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE UNIQUE INDEX "asset_depreciation_run_id_fixed_asset_id_key" ON "asset_depreciation"("run_id", "fixed_asset_id");
ALTER TABLE "asset_depreciation" ADD CONSTRAINT "asset_depreciation_nilai" CHECK ("amount" > 0 AND "accum_after" >= "amount");

-- Pelepasan aset: tujuan uang dan salinan nilai saat diposting; satu pelepasan selain Batal per aset.
ALTER TABLE "asset_disposal" ADD COLUMN "bank_account_id" INTEGER;
ALTER TABLE "asset_disposal" ADD COLUMN "cost" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "asset_disposal" ADD COLUMN "accum_depreciation" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "asset_disposal" ADD COLUMN "book_value" BIGINT NOT NULL DEFAULT 0;
CREATE INDEX "asset_disposal_fixed_asset_id_idx" ON "asset_disposal"("fixed_asset_id");
CREATE UNIQUE INDEX "asset_disposal_satu_per_aset" ON "asset_disposal"("fixed_asset_id") WHERE "status" <> 'Batal';
ALTER TABLE "asset_disposal" ADD CONSTRAINT "asset_disposal_nilai" CHECK ("proceeds" >= 0);

-- Anggaran: nomor, versi revisi, dan tanda digantikan. Satu anggaran Disetujui yang berlaku per tahun.
ALTER TABLE "budget" ADD COLUMN "no" TEXT NOT NULL;
ALTER TABLE "budget" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "budget" ADD COLUMN "revised_from_id" INTEGER;
ALTER TABLE "budget" ADD COLUMN "replaced_by" INTEGER;
ALTER TABLE "budget" ADD COLUMN "replaced_at" TIMESTAMPTZ(6);
ALTER TABLE "budget" ADD COLUMN "note" TEXT NOT NULL DEFAULT '';
CREATE UNIQUE INDEX "budget_no_key" ON "budget"("no");
CREATE INDEX "budget_year_idx" ON "budget"("year");
ALTER TABLE "budget" ADD CONSTRAINT "budget_revised_from_id_fkey" FOREIGN KEY ("revised_from_id") REFERENCES "budget"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE UNIQUE INDEX "budget_berlaku_per_tahun" ON "budget"("year") WHERE "status" = 'Disetujui' AND "replaced_at" IS NULL;
ALTER TABLE "budget" ADD CONSTRAINT "budget_tahun" CHECK ("year" BETWEEN 2000 AND 2100 AND "version" >= 1);
ALTER TABLE "budget" ADD CONSTRAINT "budget_status" CHECK ("status" IN ('Draft', 'Disetujui', 'Batal'));

CREATE UNIQUE INDEX "budget_line_budget_id_account_id_month_key" ON "budget_line"("budget_id", "account_id", "month");
ALTER TABLE "budget_line" ADD CONSTRAINT "budget_line_nilai" CHECK ("month" BETWEEN 1 AND 12 AND "amount" >= 0);
