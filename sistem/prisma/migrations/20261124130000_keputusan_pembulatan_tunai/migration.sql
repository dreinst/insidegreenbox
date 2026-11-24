-- Keputusan pemilik 24 November 2026 (KONTRAK 11 butir 142): bagian tunai penjualan dibulatkan ke Rp 500 terdekat,
-- setengah ke atas. sale.total tetap total pas (pendapatan, service, pajak); sale.rounding menyimpan selisih
-- pembulatannya, jadi uang yang diterima = total + rounding. Dengan kelipatan 500 dan setengah ke atas, selisihnya
-- selalu di antara -249 dan 250. Penjualan lama bernilai 0.
ALTER TABLE "sale" ADD COLUMN "rounding" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "sale" ADD CONSTRAINT "sale_pembulatan_sah" CHECK ("rounding" BETWEEN -249 AND 250);

-- Akun bawaan dan kunci pemetaan pembulatan. Pembulatan naik menjadi kredit, pembulatan turun menjadi debit di akun
-- yang sama. Baris yang sudah ada tidak ditimpa.
INSERT INTO "account" ("code", "name", "kind", "is_cash_bank", "is_postable", "parent_id")
SELECT '4-9200', 'Pembulatan Penjualan', 'Pendapatan'::"account_kind", false, true, (SELECT a.id FROM "account" a WHERE a.code = '4')
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "account_mapping" ("key", "account_id", "updated_at")
SELECT 'pembulatan', a."id", now() FROM "account" a WHERE a."code" = '4-9200'
ON CONFLICT ("key") DO NOTHING;
