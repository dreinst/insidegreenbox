// Data aset tetap (tahap 6B, RANCANGAN 8.2 "Daftar aset" Owner L T U H S, Admin L). Aset dibuat sebagai draf lalu
// diaktifkan (pola Asset Data ESB: draf lalu Activation). Aktivasi butuh izin Setujui dan mencatat perolehan lewat
// jurnal: debit akun aset tetap kategorinya, kredit Kas Besar atau rekening bank sumber dana (KONTRAK 11). Akun aset,
// akumulasi, dan beban disalin dari pemetaan saat aktivasi, supaya penyusutan dan pelepasan sesudahnya memakai akun
// yang sama walau pemetaan diubah. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan, GalatSaklar } from '../aksi'
import { buatJurnal, buatJurnalBalik, dk } from '../akuntansi/jurnal'
import { kunciAset, kunciBank, pembacaAkun } from '../akuntansi/pemetaan'
import { catatAudit, selisih, type Konteks } from '../audit'
import { idSkema, kunciBaris, skemaTanggalWajib, type Aktor } from '../beli/dokumen'
import type { Db, DbAtauTx, Tx } from '../db'
import { pastikanIzin, saklarNyala } from '../izin-inti'
import { formatRupiah, PER_HALAMAN, sesuaiHalaman, skemaUang } from '../master'
import { ambilNomor } from '../nomor'
import { hariIni, periksaTanggal } from '../stok/dokumen'
import { MENU_ASET, skemaUmur } from './kategori'

export const STATUS_ASET = { draft: 'Draft', aktif: 'Aktif', dilepas: 'Dilepas', batal: 'Batal' } as const
export type StatusAset = keyof typeof STATUS_ASET

const BATAS_NILAI = 100_000_000_000n

const idOpsional = z
  .string()
  .optional()
  .transform((v) => (v && /^\d+$/.test(v) ? Number(v) : null))

const kepalaUmum = {
  name: z.string().trim().min(2, 'Nama aset minimal 2 huruf.').max(80, 'Nama aset paling panjang 80 huruf.'),
  locationId: idOpsional,
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
}

export const skemaAset = z.object({
  ...kepalaUmum,
  categoryId: idSkema('kategori'),
  acquiredDate: skemaTanggalWajib('Tanggal perolehan'),
  cost: skemaUang({ label: 'Nilai perolehan', max: BATAS_NILAI }),
  salvage: z.string().default('').pipe(skemaUang({ label: 'Nilai sisa', min: 0n, max: BATAS_NILAI, wajib: false })),
  // Kosong berarti umur bawaan kategori.
  usefulMonths: z
    .string()
    .default('')
    .transform((v) => v.trim())
    .pipe(z.union([z.literal('').transform(() => null), skemaUmur('Umur manfaat')])),
  sumber: z.string().regex(/^(kas|\d+)$/, 'Pilih kas atau rekening bank sumber dana.'),
})

// Aset Aktif hanya boleh diubah nama, lokasi, dan catatannya; angka penyusutannya sudah dipakai jurnal.
export const skemaAsetAktif = z.object(kepalaUmum)

const NAMA_KOLOM: Record<string, string> = {
  name: 'nama',
  locationId: 'lokasi',
  note: 'catatan',
  categoryId: 'kategori',
  acquiredDate: 'tanggal perolehan',
  cost: 'nilai perolehan',
  salvage: 'nilai sisa',
  usefulMonths: 'umur manfaat',
  bankAccountId: 'sumber dana',
}
const label = (k: string[]) => k.map((x) => NAMA_KOLOM[x] ?? x).join(', ')

async function rekening(tx: DbAtauTx, sumber: string, kolom = 'sumber') {
  if (sumber === 'kas') return null
  const r = await tx.bankAccount.findUnique({ where: { id: Number(sumber) } })
  if (!r || !r.active) throw new GalatAturan('Rekening bank tidak ditemukan atau nonaktif.', kolom)
  return r.id
}

async function kategoriAktif(tx: DbAtauTx, id: number) {
  const c = await tx.assetCategory.findUnique({ where: { id } })
  if (!c || !c.active) throw new GalatAturan('Kategori aset tidak ditemukan atau nonaktif.', 'categoryId')
  return c
}

async function lokasiAset(tx: DbAtauTx, id: number | null) {
  if (!id) return null
  const l = await tx.location.findUnique({ where: { id } })
  if (!l || !l.active) throw new GalatAturan('Lokasi tidak ditemukan atau nonaktif.', 'locationId')
  return l.id
}

function periksaNilai(d: { cost: bigint; salvage: bigint }) {
  if (d.salvage >= d.cost) throw new GalatAturan('Nilai sisa harus lebih kecil dari nilai perolehan.', 'salvage')
}

async function dataAset(tx: DbAtauTx, aktor: Aktor, d: z.infer<typeof skemaAset>) {
  periksaTanggal(aktor, d.acquiredDate, 'acquiredDate')
  periksaNilai(d)
  const c = await kategoriAktif(tx, d.categoryId)
  return {
    name: d.name,
    note: d.note,
    categoryId: c.id,
    locationId: await lokasiAset(tx, d.locationId),
    acquiredDate: d.acquiredDate,
    cost: d.cost,
    salvage: d.salvage,
    usefulMonths: d.usefulMonths ?? c.usefulMonths,
    bankAccountId: await rekening(tx, d.sumber),
  }
}

export async function tambahAset(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU_ASET, 'T')
  const d = skemaAset.parse(masukan)
  return db.$transaction(async (tx) => {
    const isi = await dataAset(tx, aktor, d)
    const code = await ambilNomor(tx, 'fixed_asset', 'AT', isi.acquiredDate)
    const a = await tx.fixedAsset.create({ data: { ...isi, code, status: 'draft', bookValue: isi.cost, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'aset.tambah', docType: 'fixed_asset', docId: a.id, summary: `Membuat draf aset ${code} ${a.name}, nilai ${formatRupiah(a.cost)}, umur ${a.usefulMonths} bulan`, after: { code, ...isi } })
    return a
  })
}

async function muatTerkunci(tx: Tx, id: number) {
  await kunciBaris(tx, 'fixed_asset', id)
  const a = await tx.fixedAsset.findUnique({ where: { id } })
  if (!a) throw new GalatAturan('Aset tidak ditemukan.')
  return a
}

export async function ubahAset(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU_ASET, 'U')
  return db.$transaction(async (tx) => {
    const a = await muatTerkunci(tx, id)
    let baru: Record<string, unknown>
    if (a.status === 'draft') baru = await dataAset(tx, aktor, skemaAset.parse(masukan))
    else if (a.status === 'aktif') {
      const d = skemaAsetAktif.parse(masukan)
      baru = { name: d.name, note: d.note, locationId: await lokasiAset(tx, d.locationId) }
    } else throw new GalatAturan(`Aset berstatus ${STATUS_ASET[a.status as StatusAset] ?? a.status} tidak bisa diubah.`)
    const lama: Record<string, unknown> = {
      name: a.name,
      note: a.note,
      locationId: a.locationId,
      categoryId: a.categoryId,
      acquiredDate: a.acquiredDate,
      cost: a.cost,
      salvage: a.salvage,
      usefulMonths: a.usefulMonths,
      bankAccountId: a.bankAccountId,
    }
    const beda = selisih(lama, baru)
    if (!beda.berubah.length) return 0
    await tx.fixedAsset.update({ where: { id }, data: { ...baru, ...(a.status === 'draft' && typeof baru.cost === 'bigint' ? { bookValue: baru.cost } : {}), updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'aset.ubah', docType: 'fixed_asset', docId: id, summary: `Mengubah ${label(beda.berubah)} aset ${a.code}`, before: beda.sebelum, after: beda.sesudah })
    return beda.berubah.length
  })
}

export async function hapusAset(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU_ASET, 'H')
  return db.$transaction(async (tx) => {
    const a = await muatTerkunci(tx, id)
    if (a.status !== 'draft') throw new GalatAturan('Hanya draf aset yang bisa dihapus.')
    await tx.fixedAsset.delete({ where: { id } })
    await catatAudit(tx, k, { action: 'aset.hapus', docType: 'fixed_asset', docId: id, summary: `Menghapus draf aset ${a.code} ${a.name}`, before: { code: a.code, name: a.name, cost: a.cost } })
  })
}

const sumberDana = (a: { bankAccountId: number | null }) => (a.bankAccountId ? kunciBank(a.bankAccountId) : 'kas_besar')

// Setujui dan aktifkan: akun disalin dari pemetaan kategori, lalu jurnal perolehan bertanggal tanggal perolehan.
export async function aktifkanAset(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU_ASET, 'S')
  return db.$transaction(async (tx) => {
    const a = await muatTerkunci(tx, id)
    if (a.status !== 'draft') throw new GalatAturan('Hanya draf aset yang bisa diaktifkan.')
    periksaTanggal(aktor, a.acquiredDate, 'acquiredDate')
    const c = await kategoriAktif(tx, a.categoryId)
    if (a.locationId) await lokasiAset(tx, a.locationId)
    if (a.bankAccountId) await rekening(tx, String(a.bankAccountId))
    const akun = pembacaAkun(tx)
    const asetAkun = await akun(kunciAset('aset_tetap', c.id))
    const akumAkun = await akun(kunciAset('akumulasi_penyusutan', c.id))
    const bebanAkun = await akun(kunciAset('beban_penyusutan', c.id))
    const memo = `Perolehan aset ${a.code} ${a.name}`
    const j = await buatJurnal(tx, { docType: 'fixed_asset', docId: a.id, docNo: a.code, tanggal: a.acquiredDate, memo, oleh: aktor.id }, [dk(asetAkun.id, a.cost, memo), dk(sumberDana(a), -a.cost, memo)])
    const sekarang = new Date()
    await tx.fixedAsset.update({
      where: { id },
      data: { status: 'aktif', assetAccountId: asetAkun.id, accumAccountId: akumAkun.id, expenseAccountId: bebanAkun.id, accumDepreciation: 0n, bookValue: a.cost, activatedBy: aktor.id, activatedAt: sekarang, updatedBy: aktor.id },
    })
    await catatAudit(tx, k, {
      action: 'aset.aktifkan',
      docType: 'fixed_asset',
      docId: id,
      summary: `Menyetujui dan mengaktifkan aset ${a.code} ${a.name}, perolehan ${formatRupiah(a.cost)}`,
      before: { status: a.status },
      after: { status: 'aktif', jurnal: j?.no ?? null, akunAset: asetAkun.code, akunAkumulasi: akumAkun.code, akunBeban: bebanAkun.code },
    })
    return j
  })
}

// Pembatalan aset Aktif: hanya bila belum pernah disusutkan dan belum dilepas. Butuh izin Setujui, saklar
// dok.batal_posting, dan alasan; jurnal perolehan dibalik bertanggal hari ini.
export async function batalkanAset(db: Db, k: Konteks, aktor: Aktor, id: number, alasan: string) {
  pastikanIzin(aktor, MENU_ASET, 'S')
  const teks = alasan.trim()
  return db.$transaction(async (tx) => {
    const a = await muatTerkunci(tx, id)
    if (a.status !== 'aktif') throw new GalatAturan('Hanya aset Aktif yang bisa dibatalkan. Draf cukup dihapus.')
    if (!saklarNyala(aktor, 'dok.batal_posting')) throw new GalatSaklar('dok.batal_posting', 'Membatalkan aset yang sudah aktif butuh saklar Batalkan dokumen diposting.')
    if (teks.length < 5) throw new GalatAturan('Tulis alasan pembatalan, minimal 5 huruf.', 'alasan')
    if (teks.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
    const susut = await tx.assetDepreciation.count({ where: { fixedAssetId: id, run: { status: 'Diposting' } } })
    if (susut || a.accumDepreciation > 0n) throw new GalatAturan('Aset ini sudah disusutkan. Batalkan dokumen penyusutannya dulu, atau lepas asetnya.')
    if (await tx.assetDisposal.count({ where: { fixedAssetId: id, status: { not: 'Batal' } } })) throw new GalatAturan('Aset ini punya dokumen pelepasan. Hapus atau batalkan dulu.')
    const sekarang = new Date()
    const b = await buatJurnalBalik(tx, { docType: 'fixed_asset', docId: id, docNo: a.code, tanggal: hariIni(sekarang), memo: `Batal perolehan aset ${a.code}`, oleh: aktor.id })
    await tx.fixedAsset.update({ where: { id }, data: { status: 'batal', bookValue: 0n, cancelledBy: aktor.id, cancelledAt: sekarang, cancelReason: teks, reversalJournalId: b?.id ?? null, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'aset.batal', docType: 'fixed_asset', docId: id, summary: `Membatalkan aset ${a.code} ${a.name}. Alasan: ${teks}`, before: { status: a.status }, after: { status: 'batal', jurnalBalik: b?.no ?? null } })
    return b
  })
}

export type SaringAset = { status?: string; kategori?: string; q?: string; hal?: string }

export async function daftarAset(db: Db, s: SaringAset) {
  const hal = sesuaiHalaman(s.hal)
  const where = {
    ...(s.status && s.status in STATUS_ASET ? { status: s.status } : {}),
    ...(s.kategori && /^\d+$/.test(s.kategori) ? { categoryId: Number(s.kategori) } : {}),
    ...(s.q?.trim() ? { OR: [{ code: { contains: s.q.trim(), mode: 'insensitive' as const } }, { name: { contains: s.q.trim(), mode: 'insensitive' as const } }] } : {}),
  }
  const [baris, total, jumlah] = await Promise.all([
    db.fixedAsset.findMany({ where, include: { category: true, location: true }, orderBy: [{ acquiredDate: 'desc' }, { id: 'desc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.fixedAsset.count({ where }),
    db.fixedAsset.aggregate({ where: { ...where, status: 'aktif' }, _sum: { cost: true, accumDepreciation: true, bookValue: true } }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)), aktif: { cost: jumlah._sum.cost ?? 0n, akumulasi: jumlah._sum.accumDepreciation ?? 0n, buku: jumlah._sum.bookValue ?? 0n } }
}

export const muatAset = (db: DbAtauTx, id: number) =>
  db.fixedAsset.findUnique({
    where: { id },
    include: {
      category: true,
      location: true,
      assetAccount: { select: { code: true, name: true } },
      accumAccount: { select: { code: true, name: true } },
      expenseAccount: { select: { code: true, name: true } },
      assetDepreciations: { include: { run: { select: { id: true, no: true, yearMonth: true, status: true } } }, orderBy: { id: 'desc' }, take: 120 },
      assetDisposals: { orderBy: { id: 'desc' }, select: { id: true, no: true, status: true, date: true, proceeds: true, gainLoss: true } },
    },
  })

// Aset Aktif untuk pilihan dokumen pelepasan.
export const asetBisaDilepas = (db: DbAtauTx) =>
  db.fixedAsset.findMany({ where: { status: 'aktif', assetDisposals: { none: { status: { not: 'Batal' } } } }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, bookValue: true }, take: 500 })
