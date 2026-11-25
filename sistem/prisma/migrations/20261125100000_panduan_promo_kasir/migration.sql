-- Promo otomatis di kasir (KONTRAK 11 butir 160, menutup butir 28). sale.disc tetap berisi seluruh potongan
-- transaksi, jadi semua laporan dan hitungan yang memakai sub - disc tidak berubah. promo_disc adalah bagian disc yang
-- berasal dari promo; promo tidak digabung dengan potongan member, jadi salah satunya selalu 0. promo_name menyimpan
-- nama promo saat dijual supaya struk lama tidak ikut berubah. Penjualan lama bernilai kosong dan 0.
ALTER TABLE "sale" ADD COLUMN "promo_id" INTEGER;
ALTER TABLE "sale" ADD COLUMN "promo_name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "sale" ADD COLUMN "promo_disc" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "sale" ADD CONSTRAINT "sale_promo_id_fkey" FOREIGN KEY ("promo_id") REFERENCES "promo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "sale" ADD CONSTRAINT "sale_potongan_promo_sah" CHECK ("promo_disc" >= 0 AND "promo_disc" <= "disc");
CREATE INDEX "sale_promo_id_idx" ON "sale"("promo_id");

-- Baris menu gratis dari promo hadiah: harga 0, tetap memotong stok resep dan ber-HPP.
ALTER TABLE "sale_line" ADD COLUMN "promo_gift" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_hadiah_gratis" CHECK (NOT "promo_gift" OR ("price" = 0 AND "menu_set_id" IS NULL));

-- Kunci pemetaan potongan promo. Bawaannya akun yang sama dengan potongan penjualan (4-3000), jadi Owner bisa
-- memisahkannya ke akun lain dari halaman Pemetaan. Baris yang sudah ada tidak ditimpa.
INSERT INTO "account_mapping" ("key", "account_id", "updated_at")
SELECT 'potongan_promo', m."account_id", now() FROM "account_mapping" m WHERE m."key" = 'potongan_penjualan'
ON CONFLICT ("key") DO NOTHING;
