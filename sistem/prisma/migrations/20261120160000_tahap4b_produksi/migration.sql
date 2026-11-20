-- Tahap 4B: resep dan BOM, potong stok penjualan, dokumen produksi (KONTRAK 11 dan 13).

-- Satu bahan hanya muncul sekali di satu resep.
CREATE UNIQUE INDEX "bom_line_bom_id_product_id_key" ON "bom_line"("bom_id", "product_id");
ALTER TABLE "bom_line" ADD CONSTRAINT "bom_line_qty_positif" CHECK ("qty" > 0);
ALTER TABLE "bom" ADD CONSTRAINT "bom_kind_sah" CHECK ("kind" IN ('menu', 'assembly'));
ALTER TABLE "bom" ADD CONSTRAINT "bom_output_qty_positif" CHECK ("output_qty" > 0);

-- Perintah produksi: penutup dan sisa nilai barang dalam proses yang dibuang saat Selesai.
ALTER TABLE "production_order" ADD COLUMN "closed_by" INTEGER,
ADD COLUMN "wip_writeoff" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "production_order" ADD CONSTRAINT "production_order_planned_qty_positif" CHECK ("planned_qty" > 0);

-- Toleransi bahan disalin dari BOM saat perintah dibuat.
ALTER TABLE "production_order_line" ADD COLUMN "tol_pct" DECIMAL(6,3) NOT NULL DEFAULT 0;

-- Jenis pengeluaran bahan: keluar ke proses atau kembali dari proses.
ALTER TABLE "material_issue" ADD CONSTRAINT "material_issue_kind_sah" CHECK ("kind" IN ('keluar', 'kembali'));

-- Produksi cepat menyimpan nilai hasil yang masuk persediaan.
ALTER TABLE "quick_production" ADD COLUMN "value" BIGINT NOT NULL DEFAULT 0;
