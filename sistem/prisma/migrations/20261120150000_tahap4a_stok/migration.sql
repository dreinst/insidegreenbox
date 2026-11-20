-- Tahap 4A: mesin stok dan persediaan (KONTRAK 12 dan 11).

-- Lokasi mendapat kode tetap. Baris yang sudah ada (bila ada) diberi kode dari id-nya.
ALTER TABLE "location" ADD COLUMN "code" TEXT;
UPDATE "location" SET "code" = 'L' || "id" WHERE "code" IS NULL;
ALTER TABLE "location" ALTER COLUMN "code" SET NOT NULL;
CREATE UNIQUE INDEX "location_code_key" ON "location"("code");

-- Nilai dan harga rata-rata tertimbang per lokasi.
ALTER TABLE "stock_balance" ADD COLUMN "avg_cost" DECIMAL(18,4) NOT NULL DEFAULT 0,
ADD COLUMN "value" BIGINT NOT NULL DEFAULT 0;

-- Saldo nilai sesudah gerak dan nomor dokumen asal untuk kartu stok.
ALTER TABLE "stock_ledger" ADD COLUMN "balance_value" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN "doc_no" TEXT NOT NULL DEFAULT '';
CREATE INDEX "stock_ledger_product_id_location_id_id_idx" ON "stock_ledger"("product_id", "location_id", "id");

-- Alasan sistem (saldo_awal) punya kode.
ALTER TABLE "stock_reason" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "stock_reason_code_key" ON "stock_reason"("code");

-- Satuan tidak dihapus, hanya dinonaktifkan.
ALTER TABLE "unit" ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- Qty di ledger tidak boleh nol, dan kartu stok hanya bertambah: koreksi selalu lewat gerak baru atau gerak balik.
ALTER TABLE "stock_ledger" ADD CONSTRAINT "stock_ledger_qty_bukan_nol" CHECK ("qty" <> 0);

CREATE FUNCTION stock_ledger_tolak_ubah() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'stock_ledger hanya boleh ditambah, tidak boleh diubah atau dihapus';
END;
$$;

CREATE TRIGGER stock_ledger_tolak_ubah_baris
  BEFORE UPDATE OR DELETE ON "stock_ledger"
  FOR EACH ROW EXECUTE FUNCTION stock_ledger_tolak_ubah();

CREATE TRIGGER stock_ledger_tolak_truncate
  BEFORE TRUNCATE ON "stock_ledger"
  FOR EACH STATEMENT EXECUTE FUNCTION stock_ledger_tolak_ubah();
