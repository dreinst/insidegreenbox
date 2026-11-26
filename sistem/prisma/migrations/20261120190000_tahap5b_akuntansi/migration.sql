-- Tahap 5B: akuntansi. Bagan akun bawaan kedai kopi, pemetaan akun bawaan, alur status jurnal memorial, tutup dan
-- buka periode, serta pengaman jurnal (KONTRAK bagian 14).

-- DropIndex
DROP INDEX "journal_line_account_id_idx";

-- AlterTable
ALTER TABLE "account" ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" INTEGER,
ADD COLUMN     "note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" INTEGER;

-- AlterTable
ALTER TABLE "fiscal_period" ADD COLUMN     "reopen_reason" TEXT,
ADD COLUMN     "reopened_at" TIMESTAMPTZ(6),
ADD COLUMN     "reopened_by" INTEGER;

-- AlterTable
ALTER TABLE "journal" ADD COLUMN     "approved_at" TIMESTAMPTZ(6),
ADD COLUMN     "approved_by" INTEGER,
ADD COLUMN     "cancel_reason" TEXT,
ADD COLUMN     "cancelled_at" TIMESTAMPTZ(6),
ADD COLUMN     "cancelled_by" INTEGER,
ADD COLUMN     "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "created_by" INTEGER,
ADD COLUMN     "doc_no" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "status" "doc_status" NOT NULL DEFAULT 'Diposting',
ADD COLUMN     "submitted_at" TIMESTAMPTZ(6),
ADD COLUMN     "submitted_by" INTEGER,
ADD COLUMN     "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updated_by" INTEGER,
ALTER COLUMN "posted_at" DROP NOT NULL,
ALTER COLUMN "posted_at" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "journal_line_account_id_journal_id_idx" ON "journal_line"("account_id", "journal_id");

-- Satu jurnal maju per dokumen sumber (memorial memakai dirinya sendiri sebagai sumber) dan satu jurnal balik per jurnal.
CREATE UNIQUE INDEX "journal_sumber_maju" ON "journal" ("source_type", "source_id") WHERE "reversal_of_id" IS NULL AND "source_id" IS NOT NULL;
CREATE UNIQUE INDEX "journal_balik_satu" ON "journal" ("reversal_of_id") WHERE "reversal_of_id" IS NOT NULL;

-- Baris jurnal: debit dan kredit tidak minus, dan satu baris hanya berisi salah satunya.
ALTER TABLE "journal_line" ADD CONSTRAINT "journal_line_debit_kredit" CHECK ("debit" >= 0 AND "credit" >= 0 AND NOT ("debit" > 0 AND "credit" > 0));
ALTER TABLE "account" ADD CONSTRAINT "account_kode_tidak_kosong" CHECK (length(trim("code")) > 0);

-- Jurnal yang sudah berlaku (posted_at terisi) tidak dihapus, dan barisnya tidak diubah atau dihapus. Satu-satunya
-- kolom baris yang boleh berubah adalah cleared_at (tanggal kliring rekonsiliasi bank).
CREATE FUNCTION tolak_ubah_jurnal_berlaku() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'journal' THEN
    IF OLD.posted_at IS NOT NULL THEN
      IF TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Jurnal % sudah berlaku dan tidak bisa dihapus.', OLD.no;
      END IF;
      IF NEW.date IS DISTINCT FROM OLD.date OR NEW.source_type IS DISTINCT FROM OLD.source_type OR NEW.source_id IS DISTINCT FROM OLD.source_id
         OR NEW.reversal_of_id IS DISTINCT FROM OLD.reversal_of_id OR NEW.posted_at IS DISTINCT FROM OLD.posted_at OR NEW.no IS DISTINCT FROM OLD.no THEN
        RAISE EXCEPTION 'Jurnal % sudah berlaku dan tidak bisa diubah.', OLD.no;
      END IF;
    END IF;
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;
  IF EXISTS (SELECT 1 FROM journal j WHERE j.id = OLD.journal_id AND j.posted_at IS NOT NULL) THEN
    IF TG_OP = 'DELETE' OR NEW.journal_id IS DISTINCT FROM OLD.journal_id OR NEW.account_id IS DISTINCT FROM OLD.account_id OR NEW.debit IS DISTINCT FROM OLD.debit
       OR NEW.credit IS DISTINCT FROM OLD.credit OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id OR NEW.customer_id IS DISTINCT FROM OLD.customer_id THEN
      RAISE EXCEPTION 'Baris jurnal yang sudah berlaku tidak bisa diubah atau dihapus.';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER journal_tetap BEFORE UPDATE OR DELETE ON "journal" FOR EACH ROW EXECUTE FUNCTION tolak_ubah_jurnal_berlaku();
CREATE TRIGGER journal_line_tetap BEFORE UPDATE OR DELETE ON "journal_line" FOR EACH ROW EXECUTE FUNCTION tolak_ubah_jurnal_berlaku();

-- Bagan akun bawaan kedai kopi. Akun induk (is_postable false) hanya pengelompok; jurnal hanya ke akun anak.
INSERT INTO "account" ("code", "name", "kind", "is_cash_bank", "is_postable") VALUES
  ('1', 'Aset', 'Aset', false, false),
  ('2', 'Kewajiban', 'Kewajiban', false, false),
  ('3', 'Ekuitas', 'Ekuitas', false, false),
  ('4', 'Pendapatan', 'Pendapatan', false, false),
  ('5', 'Harga Pokok Penjualan', 'HPP', false, false),
  ('6', 'Beban', 'Beban', false, false)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "account" ("code", "name", "kind", "is_cash_bank", "is_postable", "parent_id")
SELECT v.code, v.name, v.kind::"account_kind", v.kas, v.pos, (SELECT a.id FROM "account" a WHERE a.code = v.induk)
FROM (VALUES
  ('1-1000', 'Aset Lancar', 'Aset', false, false, '1'),
  ('1-2000', 'Aset Tetap', 'Aset', false, false, '1'),
  ('2-1000', 'Kewajiban Lancar', 'Kewajiban', false, false, '2'),
  ('6-1000', 'Beban Operasional', 'Beban', false, false, '6')
) AS v(code, name, kind, kas, pos, induk)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "account" ("code", "name", "kind", "is_cash_bank", "is_postable", "parent_id")
SELECT v.code, v.name, v.kind::"account_kind", v.kas, v.pos, (SELECT a.id FROM "account" a WHERE a.code = v.induk)
FROM (VALUES
  ('1-1100', 'Kas Laci', 'Aset', true, true, '1-1000'),
  ('1-1200', 'Kas Besar', 'Aset', true, true, '1-1000'),
  ('1-1300', 'Bank', 'Aset', false, false, '1-1000'),
  ('1-1400', 'Piutang Kliring', 'Aset', false, false, '1-1000'),
  ('1-1500', 'Persediaan', 'Aset', false, true, '1-1000'),
  ('1-1600', 'Barang Dalam Proses', 'Aset', false, true, '1-1000'),
  ('1-1700', 'PPN Masukan', 'Aset', false, true, '1-1000'),
  ('1-1800', 'Uang Muka Pembelian', 'Aset', false, true, '1-1000'),
  ('1-2100', 'Peralatan', 'Aset', false, true, '1-2000'),
  ('1-2900', 'Akumulasi Penyusutan Peralatan', 'Aset', false, true, '1-2000'),
  ('2-1100', 'Hutang Usaha', 'Kewajiban', false, true, '2-1000'),
  ('2-1200', 'Barang Diterima Belum Difakturkan', 'Kewajiban', false, true, '2-1000'),
  ('2-1300', 'Pajak PB1 Terutang', 'Kewajiban', false, true, '2-1000'),
  ('2-1900', 'Hutang Lain-lain', 'Kewajiban', false, true, '2-1000'),
  ('3-1000', 'Modal Pemilik', 'Ekuitas', false, true, '3'),
  ('3-1100', 'Ekuitas Saldo Awal', 'Ekuitas', false, true, '3'),
  ('3-2000', 'Laba Ditahan', 'Ekuitas', false, true, '3'),
  ('3-3000', 'Laba Tahun Berjalan', 'Ekuitas', false, true, '3'),
  ('4-1000', 'Penjualan', 'Pendapatan', false, true, '4'),
  ('4-2000', 'Pendapatan Service', 'Pendapatan', false, true, '4'),
  ('4-3000', 'Potongan Penjualan', 'Pendapatan', false, true, '4'),
  ('4-9000', 'Pendapatan Lain-lain', 'Pendapatan', false, true, '4'),
  ('5-1000', 'HPP Penjualan', 'HPP', false, true, '5'),
  ('5-2000', 'Selisih Harga Pembelian', 'HPP', false, true, '5'),
  ('5-3000', 'Selisih Persediaan', 'HPP', false, true, '5'),
  ('5-4000', 'Selisih Produksi', 'HPP', false, true, '5'),
  ('5-5000', 'Biaya Produksi Dibebankan', 'HPP', false, true, '5'),
  ('5-6000', 'Potongan Pembelian', 'HPP', false, true, '5'),
  ('6-1100', 'Selisih Kas', 'Beban', false, true, '6-1000'),
  ('6-1200', 'Beban MDR', 'Beban', false, true, '6-1000'),
  ('6-1300', 'Beban Administrasi Bank', 'Beban', false, true, '6-1000'),
  ('6-1400', 'Beban Gaji', 'Beban', false, true, '6-1000'),
  ('6-1500', 'Beban Sewa', 'Beban', false, true, '6-1000'),
  ('6-1600', 'Beban Listrik dan Air', 'Beban', false, true, '6-1000'),
  ('6-1700', 'Beban Penyusutan', 'Beban', false, true, '6-1000'),
  ('6-1900', 'Beban Lain-lain', 'Beban', false, true, '6-1000')
) AS v(code, name, kind, kas, pos, induk)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "account" ("code", "name", "kind", "is_cash_bank", "is_postable", "parent_id")
SELECT v.code, v.name, 'Aset'::"account_kind", v.kas, true, (SELECT a.id FROM "account" a WHERE a.code = v.induk)
FROM (VALUES
  ('1-1310', 'Bank Usaha', true, '1-1300'),
  ('1-1410', 'Piutang Kliring QRIS', false, '1-1400'),
  ('1-1420', 'Piutang Kliring Debit', false, '1-1400'),
  ('1-1490', 'Piutang Kliring Lainnya', false, '1-1400')
) AS v(code, name, kas, induk)
ON CONFLICT ("code") DO NOTHING;

-- Pemetaan akun bawaan. Dokumen tidak pernah memilih akun sendiri; kunci per metode bayar, rekening, lokasi, dan
-- alasan (kliring.<id>, bank.<id>, persediaan.<id>, alasan.<id>) bila kosong jatuh ke kunci umumnya.
INSERT INTO "account_mapping" ("key", "account_id", "updated_at")
SELECT v.key, a.id, now() FROM (VALUES
  ('kas_laci', '1-1100'),
  ('kas_besar', '1-1200'),
  ('bank', '1-1310'),
  ('kliring', '1-1490'),
  ('persediaan', '1-1500'),
  ('bdp', '1-1600'),
  ('ppn_masukan', '1-1700'),
  ('uang_muka_beli', '1-1800'),
  ('hutang_usaha', '2-1100'),
  ('grni', '2-1200'),
  ('pajak_pb1', '2-1300'),
  ('saldo_awal', '3-1100'),
  ('laba_ditahan', '3-2000'),
  ('laba_berjalan', '3-3000'),
  ('penjualan', '4-1000'),
  ('pendapatan_service', '4-2000'),
  ('potongan_penjualan', '4-3000'),
  ('hpp', '5-1000'),
  ('selisih_harga_beli', '5-2000'),
  ('selisih_persediaan', '5-3000'),
  ('selisih_produksi', '5-4000'),
  ('biaya_produksi', '5-5000'),
  ('potongan_beli', '5-6000'),
  ('selisih_kas', '6-1100'),
  ('beban_mdr', '6-1200'),
  ('beban_bank', '6-1300'),
  ('laci_masuk', '1-1200'),
  ('laci_keluar', '6-1900')
) AS v(key, code) JOIN "account" a ON a.code = v.code
ON CONFLICT ("key") DO NOTHING;

-- Kliring per metode bayar yang sudah ada (QRIS dan Debit dari impor menu).
INSERT INTO "account_mapping" ("key", "account_id", "updated_at")
SELECT 'kliring.' || m.id, a.id, now() FROM "payment_method" m
JOIN "account" a ON a.code = CASE WHEN m.kind = 'qris' OR lower(m.name) = 'qris' THEN '1-1410' ELSE '1-1420' END
WHERE m.kind <> 'tunai' AND (m.kind IN ('qris', 'debit') OR lower(m.name) IN ('qris', 'debit'))
ON CONFLICT ("key") DO NOTHING;

-- Jurnal memorial selalu lewat persetujuan (Diajukan lalu Setujui dan posting).
INSERT INTO "approval_rule" ("doc_type", "requires_approval", "updated_at") VALUES ('journal', true, now()) ON CONFLICT ("doc_type") DO NOTHING;
