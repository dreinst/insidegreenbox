-- Temuan audit B-1 (KONTRAK 11 butir 127): koreksi nilai saat barang masuk menutup saldo nol atau minus.
-- Kolom ini bagian dari value, jadi jumlah value per produk-lokasi tetap sama dengan stock_balance.value.
ALTER TABLE "stock_ledger" ADD COLUMN "revalue" BIGINT NOT NULL DEFAULT 0;
