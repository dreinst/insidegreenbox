-- Tahap 3C (integrasi master dan kasir): baris penjualan paket set.
-- menu_set_id terisi berarti baris ini paket; menu_item_id tetap berisi menu utama paket dan set_drink_item_id
-- berisi minumannya saat dijual, supaya potong stok tahap 4 tidak bergantung pada isi paket yang bisa diubah.

-- AlterTable
ALTER TABLE "sale_line" ADD COLUMN     "menu_set_id" INTEGER,
ADD COLUMN     "set_drink_item_id" INTEGER;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_menu_set_id_fkey" FOREIGN KEY ("menu_set_id") REFERENCES "menu_set"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_set_drink_item_id_fkey" FOREIGN KEY ("set_drink_item_id") REFERENCES "menu_item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Paket selalu lengkap: menu_set_id dan set_drink_item_id terisi bersama atau kosong bersama.
ALTER TABLE "sale_line" ADD CONSTRAINT "sale_line_paket_lengkap" CHECK (("menu_set_id" IS NULL) = ("set_drink_item_id" IS NULL));
