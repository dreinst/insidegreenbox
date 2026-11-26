-- Permintaan pemilik 26 November 2026 (KONTRAK 4.1 dan 11 butir 161): peran sistem Superadmin (setara Owner) dan
-- Finance (keuangan). Basis data baru mendapat kedua peran dari seed (src/lib/seed-inti.ts), jadi migrasi ini hanya
-- bekerja bila peran owner sudah ada, yaitu basis data yang sudah berjalan. Aman dijalankan ulang: peran, izin, dan
-- saklar yang sudah ada tidak ditimpa, sehingga izin yang sudah diubah pemilik tetap. Nilai di bawah sama dengan
-- bawaan superadmin dan finance di src/lib/katalog.ts (tests/peran-baru.test.ts membandingkannya).

-- Peran tambahan buatan Owner yang kebetulan berkode superadmin akan menjadi setara Owner karena kode itu diperiksa
-- di program. Migrasi berhenti supaya pemilik memeriksanya dulu, karena hak peran itu akan naik tanpa terlihat.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "role" WHERE "code" = 'superadmin' AND NOT "is_system") THEN
    RAISE EXCEPTION 'Sudah ada peran tambahan berkode superadmin. Periksa peran itu dulu (KONTRAK bagian 11 butir 161) sebelum migrasi ini dijalankan.';
  END IF;
END $$;

INSERT INTO "role" ("code", "name", "is_system", "active", "created_at", "updated_at")
SELECT v."code", v."name", true, true, now(), now()
FROM (VALUES ('superadmin', 'Superadmin'), ('finance', 'Finance')) AS v("code", "name")
WHERE EXISTS (SELECT 1 FROM "role" WHERE "code" = 'owner')
ON CONFLICT ("code") DO NOTHING;

-- Peran tambahan berkode finance yang sudah ada dipakai apa adanya sebagai peran sistem: izinnya tidak diubah, hanya
-- menu yang belum punya baris diisi bawaan.
UPDATE "role" SET "is_system" = true, "updated_at" = now() WHERE "code" IN ('superadmin', 'finance') AND NOT "is_system";

-- Huruf aksi per menu: L Lihat, T Tambah, U Ubah, H Hapus, S Setujui, P Posting (KONTRAK 4.2).
INSERT INTO "role_permission" ("role_id", "menu_code", "can_view", "can_create", "can_update", "can_delete", "can_approve", "can_post", "updated_at")
SELECT r."id", v."menu", strpos(v."aksi", 'L') > 0, strpos(v."aksi", 'T') > 0, strpos(v."aksi", 'U') > 0, strpos(v."aksi", 'H') > 0, strpos(v."aksi", 'S') > 0, strpos(v."aksi", 'P') > 0, now()
FROM (VALUES
  ('superadmin', 'kasir.layar', 'LT'),
  ('superadmin', 'kasir.shift', 'LTUS'),
  ('superadmin', 'kasir.transaksi', 'LU'),
  ('superadmin', 'kasir.setoran', 'LTUHSP'),
  ('superadmin', 'menu.menu', 'LTUH'),
  ('superadmin', 'menu.promo', 'LTUHS'),
  ('superadmin', 'menu.member', 'LTUH'),
  ('superadmin', 'menu.tingkat', 'LTUH'),
  ('superadmin', 'stok.produk', 'LTUH'),
  ('superadmin', 'stok.resep', 'LTUH'),
  ('superadmin', 'stok.saldo', 'L'),
  ('superadmin', 'stok.penyesuaian', 'LTUHSP'),
  ('superadmin', 'stok.opname', 'LTUHSP'),
  ('superadmin', 'stok.pindah', 'LTUHP'),
  ('superadmin', 'stok.alasan', 'LTUH'),
  ('superadmin', 'beli.pemasok', 'LTUH'),
  ('superadmin', 'beli.permintaan', 'LTUHS'),
  ('superadmin', 'beli.pesanan', 'LTUHS'),
  ('superadmin', 'beli.penerimaan', 'LTUHSP'),
  ('superadmin', 'beli.faktur', 'LTUHSP'),
  ('superadmin', 'beli.retur', 'LTUHSP'),
  ('superadmin', 'beli.langsung', 'LTUHSP'),
  ('superadmin', 'beli.pembayaran', 'LTUHSP'),
  ('superadmin', 'produksi.perintah', 'LTUHS'),
  ('superadmin', 'produksi.pengeluaran', 'LTUHSP'),
  ('superadmin', 'produksi.hasil', 'LTUHSP'),
  ('superadmin', 'produksi.cepat', 'LTUHSP'),
  ('superadmin', 'kas.transaksi', 'LTUHSP'),
  ('superadmin', 'kas.pindah', 'LTUHSP'),
  ('superadmin', 'kas.rekening', 'LTUH'),
  ('superadmin', 'kas.rekonsiliasi', 'LTUHSP'),
  ('superadmin', 'kas.hutang', 'L'),
  ('superadmin', 'akun.coa', 'LTUH'),
  ('superadmin', 'akun.metode_bayar', 'LTUH'),
  ('superadmin', 'akun.jurnal', 'LTUHSP'),
  ('superadmin', 'akun.buku_besar', 'L'),
  ('superadmin', 'akun.tutup_periode', 'LTH'),
  ('superadmin', 'b2b.pelanggan', 'LTUH'),
  ('superadmin', 'b2b.pesanan', 'LTUHS'),
  ('superadmin', 'b2b.faktur', 'LTUHSP'),
  ('superadmin', 'b2b.penerimaan', 'LTUHSP'),
  ('superadmin', 'b2b.retur', 'LTUHSP'),
  ('superadmin', 'aset.daftar', 'LTUHS'),
  ('superadmin', 'aset.penyusutan', 'LTHP'),
  ('superadmin', 'anggaran.anggaran', 'LTUHS'),
  ('superadmin', 'laporan.penjualan', 'L'),
  ('superadmin', 'laporan.persediaan', 'L'),
  ('superadmin', 'laporan.keuangan', 'L'),
  ('superadmin', 'atur.pengguna', 'LTU'),
  ('superadmin', 'atur.peran', 'LTU'),
  ('superadmin', 'atur.saklar', 'LU'),
  ('superadmin', 'atur.lokasi', 'LTU'),
  ('superadmin', 'atur.audit', 'L'),
  ('superadmin', 'kasir.pin', 'LU'),
  ('superadmin', 'kas.piutang', 'L'),
  ('superadmin', 'atur.persetujuan', 'LU'),
  ('finance', 'kasir.layar', ''),
  ('finance', 'kasir.shift', ''),
  ('finance', 'kasir.transaksi', ''),
  ('finance', 'kasir.setoran', 'LTUHP'),
  ('finance', 'menu.menu', ''),
  ('finance', 'menu.promo', ''),
  ('finance', 'menu.member', ''),
  ('finance', 'menu.tingkat', ''),
  ('finance', 'stok.produk', ''),
  ('finance', 'stok.resep', ''),
  ('finance', 'stok.saldo', ''),
  ('finance', 'stok.penyesuaian', ''),
  ('finance', 'stok.opname', ''),
  ('finance', 'stok.pindah', ''),
  ('finance', 'stok.alasan', ''),
  ('finance', 'beli.pemasok', ''),
  ('finance', 'beli.permintaan', ''),
  ('finance', 'beli.pesanan', ''),
  ('finance', 'beli.penerimaan', ''),
  ('finance', 'beli.faktur', 'LTUH'),
  ('finance', 'beli.retur', ''),
  ('finance', 'beli.langsung', ''),
  ('finance', 'beli.pembayaran', 'LTUH'),
  ('finance', 'produksi.perintah', ''),
  ('finance', 'produksi.pengeluaran', ''),
  ('finance', 'produksi.hasil', ''),
  ('finance', 'produksi.cepat', ''),
  ('finance', 'kas.transaksi', 'LTUHP'),
  ('finance', 'kas.pindah', 'LTUHP'),
  ('finance', 'kas.rekening', 'LTUH'),
  ('finance', 'kas.rekonsiliasi', 'LTUHP'),
  ('finance', 'kas.hutang', 'L'),
  ('finance', 'akun.coa', 'L'),
  ('finance', 'akun.metode_bayar', 'L'),
  ('finance', 'akun.jurnal', 'LTUH'),
  ('finance', 'akun.buku_besar', 'L'),
  ('finance', 'akun.tutup_periode', 'L'),
  ('finance', 'b2b.pelanggan', ''),
  ('finance', 'b2b.pesanan', ''),
  ('finance', 'b2b.faktur', ''),
  ('finance', 'b2b.penerimaan', 'LTUHP'),
  ('finance', 'b2b.retur', ''),
  ('finance', 'aset.daftar', 'L'),
  ('finance', 'aset.penyusutan', 'L'),
  ('finance', 'anggaran.anggaran', 'L'),
  ('finance', 'laporan.penjualan', 'L'),
  ('finance', 'laporan.persediaan', 'L'),
  ('finance', 'laporan.keuangan', 'L'),
  ('finance', 'atur.pengguna', ''),
  ('finance', 'atur.peran', ''),
  ('finance', 'atur.saklar', ''),
  ('finance', 'atur.lokasi', ''),
  ('finance', 'atur.audit', 'L'),
  ('finance', 'kasir.pin', ''),
  ('finance', 'kas.piutang', 'L'),
  ('finance', 'atur.persetujuan', '')
) AS v("peran", "menu", "aksi")
JOIN "role" r ON r."code" = v."peran"
ON CONFLICT ("role_id", "menu_code") DO NOTHING;

INSERT INTO "role_feature_switch" ("role_id", "feature_switch_id", "enabled", "limit_value", "updated_at")
SELECT r."id", f."id", v."nyala", v."batas"::bigint, now()
FROM (VALUES
  ('superadmin', 'beli.po_tanpa_pr', true, NULL),
  ('superadmin', 'beli.ubah_qty_pr', true, NULL),
  ('superadmin', 'beli.ubah_harga_po', true, NULL),
  ('superadmin', 'beli.ubah_harga_faktur', true, NULL),
  ('superadmin', 'beli.tutup_po', true, NULL),
  ('superadmin', 'beli.po_selesai_otomatis', true, NULL),
  ('superadmin', 'beli.langsung_tunai', true, NULL),
  ('superadmin', 'beli.langsung_kredit', true, NULL),
  ('superadmin', 'beli.langsung_biaya', true, NULL),
  ('superadmin', 'beli.ubah_harga_langsung', true, 20),
  ('superadmin', 'stok.sesuai_kurang', true, NULL),
  ('superadmin', 'stok.sesuai_tambah', true, NULL),
  ('superadmin', 'stok.wajib_alasan', true, NULL),
  ('superadmin', 'stok.lihat_nilai', true, NULL),
  ('superadmin', 'produk.ubah_kode_nama', true, NULL),
  ('superadmin', 'menu.ubah_hpp', true, NULL),
  ('superadmin', 'pos.void', true, NULL),
  ('superadmin', 'pos.lihat_void_nonsales', true, NULL),
  ('superadmin', 'dok.tanggal_mundur', true, NULL),
  ('superadmin', 'dok.batal_posting', true, NULL),
  ('superadmin', 'b2b.ubah_harga', true, NULL),
  ('superadmin', 'aset.penyusutan_fiskal', true, NULL),
  ('superadmin', 'log.lihat_semua', true, NULL),
  ('superadmin', 'pos.jual_stok_minus', true, NULL),
  ('finance', 'beli.po_tanpa_pr', false, NULL),
  ('finance', 'beli.ubah_qty_pr', false, NULL),
  ('finance', 'beli.ubah_harga_po', false, NULL),
  ('finance', 'beli.ubah_harga_faktur', true, NULL),
  ('finance', 'beli.tutup_po', false, NULL),
  ('finance', 'beli.po_selesai_otomatis', true, NULL),
  ('finance', 'beli.langsung_tunai', false, NULL),
  ('finance', 'beli.langsung_kredit', false, NULL),
  ('finance', 'beli.langsung_biaya', false, NULL),
  ('finance', 'beli.ubah_harga_langsung', false, 20),
  ('finance', 'stok.sesuai_kurang', false, NULL),
  ('finance', 'stok.sesuai_tambah', false, NULL),
  ('finance', 'stok.wajib_alasan', true, NULL),
  ('finance', 'stok.lihat_nilai', true, NULL),
  ('finance', 'produk.ubah_kode_nama', false, NULL),
  ('finance', 'menu.ubah_hpp', false, NULL),
  ('finance', 'pos.void', false, NULL),
  ('finance', 'pos.lihat_void_nonsales', true, NULL),
  ('finance', 'dok.tanggal_mundur', true, 1),
  ('finance', 'dok.batal_posting', false, NULL),
  ('finance', 'b2b.ubah_harga', false, NULL),
  ('finance', 'aset.penyusutan_fiskal', false, NULL),
  ('finance', 'log.lihat_semua', false, NULL),
  ('finance', 'pos.jual_stok_minus', false, NULL)
) AS v("peran", "saklar", "nyala", "batas")
JOIN "role" r ON r."code" = v."peran"
JOIN "feature_switch" f ON f."code" = v."saklar"
ON CONFLICT ("role_id", "feature_switch_id") DO NOTHING;
