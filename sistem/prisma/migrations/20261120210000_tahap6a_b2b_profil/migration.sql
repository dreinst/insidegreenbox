-- Tahap 6A: penjualan B2B (pelanggan, harga khusus, pesanan, faktur, penerimaan, retur) dan profil usaha (KONTRAK 11).
-- Tabel B2B masih kosong saat migrasi ini dibuat, jadi kolom NOT NULL baru tanpa nilai bawaan aman ditambahkan.

-- DropForeignKey
ALTER TABLE "customer_payment" DROP CONSTRAINT "customer_payment_to_account_id_fkey";

-- DropForeignKey
ALTER TABLE "customer_payment_alloc" DROP CONSTRAINT "customer_payment_alloc_sales_invoice_id_fkey";

-- AlterTable
ALTER TABLE "branch" ADD COLUMN     "npwp" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "phone" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "receipt_logo" TEXT,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" INTEGER;

-- AlterTable
ALTER TABLE "customer" ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "npwp" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "customer_payment" ADD COLUMN     "bank_account_id" INTEGER,
ALTER COLUMN "to_account_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "customer_payment_alloc" ADD COLUMN     "sales_return_id" INTEGER,
ALTER COLUMN "sales_invoice_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "sales_invoice" ADD COLUMN     "customer_ref" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "hpp" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_invoice_line" ADD COLUMN     "factor" DECIMAL(18,6) NOT NULL DEFAULT 1,
ADD COLUMN     "line_total" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "unit_id" INTEGER NOT NULL,
ADD COLUMN     "value" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_order" ADD COLUMN     "customer_ref" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "sales_order_line" ADD COLUMN     "factor" DECIMAL(18,6) NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "sales_return" ADD COLUMN     "credit_used" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "customer_id" INTEGER NOT NULL,
ADD COLUMN     "value" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sales_return_line" ADD COLUMN     "line_total" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "price" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "value" BIGINT NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "customer_price" (
    "id" SERIAL NOT NULL,
    "customer_id" INTEGER NOT NULL,
    "product_id" INTEGER NOT NULL,
    "unit_id" INTEGER NOT NULL,
    "price" BIGINT NOT NULL,
    "created_by" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_by" INTEGER,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "customer_price_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customer_price_customer_id_product_id_unit_id_key" ON "customer_price"("customer_id", "product_id", "unit_id");

-- AddForeignKey
ALTER TABLE "customer_price" ADD CONSTRAINT "customer_price_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price" ADD CONSTRAINT "customer_price_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_price" ADD CONSTRAINT "customer_price_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_invoice_line" ADD CONSTRAINT "sales_invoice_line_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "unit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment" ADD CONSTRAINT "customer_payment_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_alloc" ADD CONSTRAINT "customer_payment_alloc_sales_invoice_id_fkey" FOREIGN KEY ("sales_invoice_id") REFERENCES "sales_invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_payment_alloc" ADD CONSTRAINT "customer_payment_alloc_sales_return_id_fkey" FOREIGN KEY ("sales_return_id") REFERENCES "sales_return"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Satu alokasi penerimaan pelanggan menunjuk tepat satu dokumen: faktur penjualan atau nota kredit retur.
ALTER TABLE "customer_payment_alloc" ADD CONSTRAINT "customer_payment_alloc_satu_dok" CHECK (num_nonnulls("sales_invoice_id", "sales_return_id") = 1 AND "amount" > 0);

-- Qty dan uang dokumen penjualan B2B tidak boleh minus.
ALTER TABLE "customer" ADD CONSTRAINT "customer_termin_sah" CHECK ("payment_days" BETWEEN 0 AND 365);
ALTER TABLE "customer_price" ADD CONSTRAINT "customer_price_harga_sah" CHECK ("price" > 0);
ALTER TABLE "sales_order_line" ADD CONSTRAINT "sales_order_line_qty_sah" CHECK ("qty" > 0 AND "price" >= 0 AND "factor" > 0 AND "qty_invoiced" >= 0);
ALTER TABLE "sales_invoice_line" ADD CONSTRAINT "sales_invoice_line_qty_sah" CHECK ("qty" > 0 AND "price" >= 0 AND "factor" > 0 AND "qty_returned" >= 0 AND "qty_returned" <= "qty");
ALTER TABLE "sales_invoice" ADD CONSTRAINT "sales_invoice_bayar_sah" CHECK ("paid_amount" >= 0);
ALTER TABLE "sales_return_line" ADD CONSTRAINT "sales_return_line_qty_sah" CHECK ("qty" > 0);
ALTER TABLE "sales_return" ADD CONSTRAINT "sales_return_kredit_sah" CHECK ("credit_used" >= 0 AND "credit_used" <= "total");
ALTER TABLE "branch" ADD CONSTRAINT "branch_persen_sah" CHECK ("tax_pct" BETWEEN 0 AND 100 AND "service_pct" BETWEEN 0 AND 100);

-- Kode menu baru kas.piutang (Piutang Pelanggan, baca saja): Owner dan Admin memegang Lihat. Seed juga mengisinya, baris
-- ini supaya basis data yang sudah berjalan langsung punya izinnya. Baris yang sudah ada tidak ditimpa.
INSERT INTO "role_permission" ("role_id", "menu_code", "can_view", "updated_at")
SELECT "id", 'kas.piutang', true, now() FROM "role" WHERE "code" IN ('owner', 'admin')
ON CONFLICT ("role_id", "menu_code") DO NOTHING;
INSERT INTO "role_permission" ("role_id", "menu_code", "can_view", "updated_at")
SELECT "id", 'kas.piutang', false, now() FROM "role" WHERE "code" = 'kasir'
ON CONFLICT ("role_id", "menu_code") DO NOTHING;

