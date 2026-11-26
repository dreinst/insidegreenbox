-- Tahap 6B bagian 1: akun dan kunci pemetaan untuk jurnal penjualan B2B, aset tetap, dan pelepasan aset (KONTRAK 11).
-- Akun yang kodenya sudah ada tidak ditimpa, begitu juga kunci pemetaan yang sudah diisi Owner.
INSERT INTO "account" ("code", "name", "kind", "is_cash_bank", "is_postable", "parent_id")
SELECT v.code, v.name, v.kind::"account_kind", false, true, (SELECT a.id FROM "account" a WHERE a.code = v.induk)
FROM (VALUES
  ('1-1450', 'Piutang Usaha', 'Aset', '1-1000'),
  ('4-1100', 'Penjualan B2B', 'Pendapatan', '4'),
  ('4-3100', 'Retur Penjualan B2B', 'Pendapatan', '4'),
  ('4-9100', 'Laba Pelepasan Aset', 'Pendapatan', '4'),
  ('6-1800', 'Rugi Pelepasan Aset', 'Beban', '6-1000')
) AS v(code, name, kind, induk)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "account_mapping" ("key", "account_id", "updated_at")
SELECT v.key, a.id, now() FROM (VALUES
  ('piutang_usaha', '1-1450'),
  ('penjualan_b2b', '4-1100'),
  ('retur_penjualan', '4-3100'),
  ('aset_tetap', '1-2100'),
  ('akumulasi_penyusutan', '1-2900'),
  ('beban_penyusutan', '6-1700'),
  ('laba_lepas_aset', '4-9100'),
  ('rugi_lepas_aset', '6-1800')
) AS v(key, code) JOIN "account" a ON a.code = v.code
ON CONFLICT ("key") DO NOTHING;
