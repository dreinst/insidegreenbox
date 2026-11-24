-- Keputusan user 24 November 2026 (KONTRAK 11 butir 121 dan 122): selisih kas tanpa persetujuan Owner.
-- Selisih kas tutup shift tidak lagi butuh persetujuan Owner, jadi saklar pos.batas_selisih_kas dihapus.
--    Nilai per peran ikut terhapus lewat ON DELETE CASCADE di role_feature_switch. Shift lama tetap menyimpan
--    batasnya di shift.diff_limit, dan shift lama yang masih PerluPersetujuan tetap bisa disetujui Owner.
DELETE FROM "feature_switch" WHERE "code" = 'pos.batas_selisih_kas';

-- Shift yang ditutup dengan selisih tanpa alasan ditandai, dan kasirnya tidak bisa membuka shift baru sampai alasan
-- diisi. Shift lama bernilai false, jadi tidak ada kasir yang tertahan sesudah migrasi.
ALTER TABLE "shift" ADD COLUMN "reason_missing" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "shift_user_id_reason_missing_idx" ON "shift"("user_id") WHERE "reason_missing";
