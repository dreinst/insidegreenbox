-- Keputusan pemilik 24 November 2026 untuk temuan audit B-2 (KONTRAK 11 butir 132): Pembelian Langsung tunai dan
-- Faktur Pembelian yang berisi baris jasa atau biaya wajib diajukan dan disetujui Owner bila totalnya di atas batas.
-- Batas bawaan Rp 1.000.000, disimpan di approval_rule supaya bisa diubah. Baris yang sudah ada tidak ditimpa.
INSERT INTO "approval_rule" ("doc_type", "requires_approval", "min_amount", "min_pct", "updated_at") VALUES
  ('direct_purchase', true, 1000000, NULL, now()),
  ('purchase_invoice.jasa', true, 1000000, NULL, now())
ON CONFLICT ("doc_type") DO NOTHING;
