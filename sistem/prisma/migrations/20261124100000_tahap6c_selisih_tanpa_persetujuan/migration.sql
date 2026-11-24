-- Keputusan user 24 November 2026 (KONTRAK 11 butir 121 dan 122): selisih kas tanpa persetujuan Owner.
-- Selisih kas tutup shift tidak lagi butuh persetujuan Owner, jadi saklar pos.batas_selisih_kas dihapus.
--    Nilai per peran ikut terhapus lewat ON DELETE CASCADE di role_feature_switch. Shift lama tetap menyimpan
--    batasnya di shift.diff_limit, dan shift lama yang masih PerluPersetujuan tetap bisa disetujui Owner.
DELETE FROM "feature_switch" WHERE "code" = 'pos.batas_selisih_kas';
