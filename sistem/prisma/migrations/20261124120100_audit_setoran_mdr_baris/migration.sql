-- Temuan audit A-3 (KONTRAK 11 butir 131): MDR bawaan per baris setoran, supaya muat ulang sesudah void tahu
-- apakah nilai disetor baris itu masih bawaan sistem. Baris lama kosong (tidak diketahui), jadi nilai disetornya
-- tidak pernah ditimpa otomatis.
ALTER TABLE "pos_settlement_line" ADD COLUMN "mdr" BIGINT;
