-- Tahap 5A: setoran POS dan master rekening bank.
-- Akun COA belum ada sampai modul akuntansi, jadi pos_settlement.to_account_id dan bank_account.account_id boleh
-- kosong. Rekening tujuan setoran disimpan di pos_settlement.bank_account_id.

-- AlterTable
ALTER TABLE "pos_settlement" ADD COLUMN     "bank_account_id" INTEGER,
ALTER COLUMN "to_account_id" DROP NOT NULL;

-- AlterTable: kolom metode diisi dulu dari kepala setoran, baru diwajibkan.
ALTER TABLE "pos_settlement_line" ADD COLUMN     "cancelled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "payment_method_id" INTEGER;
UPDATE "pos_settlement_line" l SET "payment_method_id" = s."payment_method_id", "cancelled" = (s."status" = 'Batal')
FROM "pos_settlement" s WHERE s."id" = l."pos_settlement_id";
ALTER TABLE "pos_settlement_line" ALTER COLUMN "payment_method_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "bank_account" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" INTEGER,
ALTER COLUMN "account_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "pos_settlement_date_idx" ON "pos_settlement"("date");

-- AddForeignKey
ALTER TABLE "pos_settlement" ADD CONSTRAINT "pos_settlement_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "bank_account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Satu setoran per tanggal per metode bayar, selama setorannya tidak Batal.
CREATE UNIQUE INDEX "pos_settlement_tanggal_metode_aktif" ON "pos_settlement" ("date", "payment_method_id") WHERE "status" <> 'Batal';

-- Satu shift dan metode hanya boleh masuk satu setoran yang tidak Batal (RANCANGAN 6.2).
CREATE UNIQUE INDEX "pos_settlement_line_shift_metode_aktif" ON "pos_settlement_line" ("shift_id", "payment_method_id") WHERE NOT "cancelled";
