-- Keputusan pemilik 24 November 2026 (KONTRAK 11 butir 143): halaman Aturan Persetujuan dengan kode menu baru
-- atur.persetujuan (Owner Lihat dan Ubah, Admin dan Kasir tanpa akses). Seed juga mengisinya; baris ini supaya basis
-- data yang sudah berjalan langsung punya izinnya. Baris yang sudah ada tidak ditimpa.
INSERT INTO "role_permission" ("role_id", "menu_code", "can_view", "can_update", "updated_at")
SELECT "id", 'atur.persetujuan', true, true, now() FROM "role" WHERE "code" = 'owner'
ON CONFLICT ("role_id", "menu_code") DO NOTHING;
INSERT INTO "role_permission" ("role_id", "menu_code", "can_view", "can_update", "updated_at")
SELECT "id", 'atur.persetujuan', false, false, now() FROM "role" WHERE "code" IN ('admin', 'kasir')
ON CONFLICT ("role_id", "menu_code") DO NOTHING;
