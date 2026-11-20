-- Tahap 4C: pembelian (KONTRAK 11 butir 49 dan seterusnya).

-- DropForeignKey
ALTER TABLE "purchase_payment" DROP CONSTRAINT "purchase_payment_from_account_id_fkey";

-- AlterTable
ALTER TABLE "approval_rule" ADD COLUMN     "min_pct" DECIMAL(6,3);

-- AlterTable
ALTER TABLE "direct_purchase" ADD COLUMN     "bank_account_id" INTEGER;

-- AlterTable
ALTER TABLE "direct_purchase_line" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "extra_alloc" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "factor" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "line_total" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "value" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "goods_receipt_line" ADD COLUMN     "extra_alloc" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "factor" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "qty_ret_uninv" DECIMAL(18,3) NOT NULL DEFAULT 0,
ADD COLUMN     "value" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_invoice_line" ADD COLUMN     "description" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'barang',
ADD COLUMN     "line_total" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_order" ADD COLUMN     "legacy_no" TEXT;

-- AlterTable
ALTER TABLE "purchase_order_line" ADD COLUMN     "factor" DECIMAL(18,6) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "purchase_payment" ADD COLUMN     "bank_account_id" INTEGER,
ALTER COLUMN "from_account_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "purchase_return" ADD COLUMN     "debit_note_used" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_return_line" ADD COLUMN     "debit_note" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "value" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "supplier" ADD COLUMN     "note" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_legacy_no_key" ON "purchase_order"("legacy_no");

-- AddForeignKey
ALTER TABLE "purchase_payment" ADD CONSTRAINT "purchase_payment_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Nomor faktur pemasok unik per pemasok untuk faktur yang tidak Batal (RANCANGAN 3.4: faktur ganda berarti hutang ganda).
CREATE UNIQUE INDEX "purchase_invoice_pemasok_no_aktif" ON "purchase_invoice" ("supplier_id", lower("supplier_invoice_no")) WHERE "status" <> 'Batal';

-- Satu alokasi pembayaran menunjuk tepat satu dokumen: faktur, pembelian langsung, atau retur (nota debit).
ALTER TABLE "purchase_payment_alloc" ADD CONSTRAINT "purchase_payment_alloc_satu_dok" CHECK (num_nonnulls("purchase_invoice_id", "direct_purchase_id", "purchase_return_id") = 1);

-- Qty dan uang dokumen pembelian tidak boleh minus.
ALTER TABLE "goods_receipt_line" ADD CONSTRAINT "goods_receipt_line_qty_sah" CHECK ("qty" > 0 AND "qty_invoiced" >= 0 AND "qty_returned" >= 0 AND "qty_ret_uninv" >= 0 AND "qty_invoiced" + "qty_ret_uninv" <= "qty" AND "qty_returned" <= "qty");
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_qty_sah" CHECK ("qty" > 0 AND "qty_received" >= 0);
ALTER TABLE "purchase_invoice" ADD CONSTRAINT "purchase_invoice_bayar_sah" CHECK ("paid_amount" >= 0);
ALTER TABLE "direct_purchase" ADD CONSTRAINT "direct_purchase_bayar_sah" CHECK ("paid_amount" >= 0);
ALTER TABLE "purchase_return" ADD CONSTRAINT "purchase_return_nota_sah" CHECK ("debit_note_used" >= 0 AND "debit_note_used" <= "debit_note_amount");

-- Aturan persetujuan bawaan pembelian (RANCANGAN 2.2 dan 11.2 butir 2): pesanan di atas Rp 5.000.000, faktur dengan
-- selisih harga di atas 5 persen dari nilai penerimaan, dan semua pembayaran pembelian.
INSERT INTO "approval_rule" ("doc_type", "requires_approval", "min_amount", "min_pct", "updated_at") VALUES
  ('purchase_order', true, 5000000, NULL, now()),
  ('purchase_invoice', true, NULL, 5, now()),
  ('purchase_payment', true, NULL, NULL, now())
ON CONFLICT ("doc_type") DO NOTHING;
