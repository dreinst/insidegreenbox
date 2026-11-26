-- Keputusan Owner 24 November 2026: semua Pesanan Pembelian, berapa pun nilainya, wajib diajukan lalu disetujui
-- pemegang Setujui (Owner). min_amount NULL berarti aturan berlaku untuk semua nilai (aturanPesanan di
-- src/lib/beli/pesanan.ts). Sebelumnya 5000000, sehingga pesanan sampai batas itu cukup dikonfirmasi pembuatnya.
UPDATE "approval_rule"
SET "requires_approval" = true, "min_amount" = NULL, "updated_at" = now()
WHERE "doc_type" = 'purchase_order';

-- Instalasi baru yang barisnya belum ada tetap mendapat aturan yang sama.
INSERT INTO "approval_rule" ("doc_type", "requires_approval", "min_amount", "min_pct", "updated_at")
VALUES ('purchase_order', true, NULL, NULL, now())
ON CONFLICT ("doc_type") DO NOTHING;
