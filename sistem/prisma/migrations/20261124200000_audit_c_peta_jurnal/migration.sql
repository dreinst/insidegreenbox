-- Audit C (KONTRAK 11 butir C-2): potret kunci pemetaan per jurnal, supaya jurnal balik memakai akun jurnal majunya.
-- Jurnal lama tanpa potret tetap dibalik lewat pemetaan saat ini.
ALTER TABLE "journal" ADD COLUMN IF NOT EXISTS "mapping_snapshot" JSONB;
