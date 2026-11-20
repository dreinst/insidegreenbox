// Kas Masuk, Kas Keluar, dan Pindah Dana (tahap 5C, RANCANGAN 2.2 dan 8.2). Satu tabel cash_transaction dengan kind
// masuk, keluar, atau pindah. Sumber dan tujuan: Kas Besar atau rekening bank_account. Baris kas masuk dan keluar
// memilih akun lawan dari daftar akun yang diizinkan (akunLawan). Alur status mengikuti dokumen pelaksana; kas keluar dan
// pindah dana terkena approval_rule sehingga disetujui dulu lalu diposting saat uang benar-benar bergerak. Jurnal dibuat
// saat Diposting dan dibalik saat dibatalkan, di transaksi yang sama. Tanpa impor Next.
import type { AccountKind, DocStatus } from '@/generated/prisma/client'
import { z } from 'zod'
import { GalatAturan, GalatIzin } from './aksi'
import { buatJurnal, buatJurnalBalik, pastikanPeriodeTerbuka, type BarisJurnal, type HasilJurnal } from './akuntansi/jurnal'
import { kunciBank, pembacaAkun } from './akuntansi/pemetaan'
import { catatAudit, type Konteks } from './audit'
import type { Db, DbAtauTx, Tx } from './db'
import { pastikanIzin, punyaIzin, saklarNyala, type Pengguna } from './izin-inti'
import { PER_HALAMAN, formatRupiah, sesuaiHalaman, skemaUang } from './master'
import { ambilNomor } from './nomor'
import { namaRekening } from './rekening'
import { transisiSah } from './status'
import { hariIni, periksaTanggal } from './stok/dokumen'

export type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar'>
export type JenisKas = 'masuk' | 'keluar' | 'pindah'

export const INFO_KAS: Record<JenisKas, { menu: string; awalan: string; nama: string; jalur: string; audit: string }> = {
  masuk: { menu: 'kas.transaksi', awalan: 'KM', nama: 'Kas Masuk', jalur: '/kas', audit: 'kas_masuk' },
  keluar: { menu: 'kas.transaksi', awalan: 'KK', nama: 'Kas Keluar', jalur: '/kas', audit: 'kas_keluar' },
  pindah: { menu: 'kas.pindah', awalan: 'PN', nama: 'Pindah Dana', jalur: '/pindah-dana', audit: 'pindah_dana' },
}
export const BATAS_BARIS_KAS = 50
const jenisDari = (k: string): JenisKas => (k === 'masuk' || k === 'keluar' || k === 'pindah' ? k : 'masuk')

// --- Sumber dana dan akun ---

// "kas" (Kas Besar) atau id rekening. Rekening harus aktif.
export const skemaSumber = (label: string) => z.string().regex(/^(kas|\d+)$/, `Pilih ${label}.`)

async function rekeningDari(tx: DbAtauTx, sumber: string, kolom: string) {
  if (sumber === 'kas') return null
  const r = await tx.bankAccount.findUnique({ where: { id: Number(sumber) } })
  if (!r || !r.active) throw new GalatAturan('Rekening tidak ditemukan atau nonaktif.', kolom)
  return r.id
}

export const kunciDana = (bankAccountId: number | null) => (bankAccountId ? kunciBank(bankAccountId) : 'kas_besar')

export async function namaDana(db: DbAtauTx, bankAccountId: number | null) {
  if (!bankAccountId) return 'Kas Besar'
  const r = await db.bankAccount.findUnique({ where: { id: bankAccountId } })
  return r ? namaRekening(r) : `Rekening #${bankAccountId}`
}

// Akun inti: akun kas dan bank, serta akun yang dipetakan ke kunci yang hanya boleh digerakkan dokumennya sendiri
// (persediaan, hutang, BDBF, kliring, laba). Akun ini tidak boleh dipilih sebagai lawan kas oleh siapa pun.
const KUNCI_INTI = ['kas_laci', 'kas_besar', 'bank', 'kliring', 'persediaan', 'bdp', 'hutang_usaha', 'grni', 'ppn_masukan', 'uang_muka_beli', 'pajak_pb1', 'saldo_awal', 'laba_ditahan', 'laba_berjalan', 'penjualan', 'pendapatan_service', 'potongan_penjualan', 'hpp']
const AWALAN_INTI = ['bank.', 'kliring.', 'persediaan.']
// Tanpa izin Setujui Kas (Admin), lawan hanya akun beban dan pendapatan yang bukan inti.
const JENIS_ADMIN: AccountKind[] = ['Beban', 'Pendapatan']

export async function idAkunInti(db: DbAtauTx) {
  const peta = await db.accountMapping.findMany({ select: { key: true, accountId: true } })
  const kas = await db.account.findMany({ where: { isCashBank: true }, select: { id: true } })
  return new Set([...peta.filter((m) => KUNCI_INTI.includes(m.key) || AWALAN_INTI.some((a) => m.key.startsWith(a))).map((m) => m.accountId), ...kas.map((a) => a.id)])
}

// Daftar akun yang boleh dipilih aktor sebagai lawan kas masuk atau keluar.
export async function akunLawan(db: DbAtauTx, aktor: Pick<Pengguna, 'izin'>) {
  const inti = await idAkunInti(db)
  const luas = punyaIzin(aktor.izin, 'kas.transaksi', 'S')
  const akun = await db.account.findMany({ where: { active: true, isPostable: true, ...(luas ? {} : { kind: { in: JENIS_ADMIN } }) }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, kind: true } })
  return akun.filter((a) => !inti.has(a.id))
}

async function periksaLawan(tx: DbAtauTx, aktor: Pick<Pengguna, 'izin'>, accountId: number, kolom = 'accountId') {
  const boleh = await akunLawan(tx, aktor)
  const a = boleh.find((x) => x.id === accountId)
  if (!a) throw new GalatAturan('Akun ini tidak boleh dipakai di kas masuk atau keluar. Pilih dari daftar.', kolom)
  return a
}

// --- Skema ---

export const skemaKepalaKas = z.object({
  date: z.string().transform((v, ctx) => {
    const d = new Date(`${v.trim()}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim()) || Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: v.trim() ? 'Tanggal bukan tanggal yang sah.' : 'Tanggal wajib diisi.' })
      return z.NEVER
    }
    return d
  }),
  sumber: skemaSumber('kas atau rekening'),
  partyName: z.string().trim().max(80, 'Nama pihak paling panjang 80 huruf.').default(''),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})
export const skemaKasBaru = skemaKepalaKas.extend({ kind: z.enum(['masuk', 'keluar'], { message: 'Pilih kas masuk atau keluar.' }) })
export const skemaPindah = skemaKepalaKas.omit({ partyName: true }).extend({
  tujuan: skemaSumber('tujuan'),
  amount: skemaUang({ label: 'Jumlah', max: 10_000_000_000n }),
})
export const skemaBarisKas = z.object({
  accountId: z.string().regex(/^\d+$/, 'Pilih akun.').transform(Number),
  amount: skemaUang({ label: 'Jumlah', max: 10_000_000_000n }),
  memo: z.string().trim().max(120, 'Keterangan paling panjang 120 huruf.').default(''),
})

// --- Aturan persetujuan ---

export async function butuhSetujuKas(db: DbAtauTx, kind: string, amount: bigint) {
  const r = await db.approvalRule.findUnique({ where: { docType: `cash_transaction.${kind}` } })
  if (!r || !r.requiresApproval) return false
  return r.minAmount === null || amount >= r.minAmount
}

// --- Buat dan ubah draf ---

async function muatDraf(tx: Tx, id: number) {
  await tx.$executeRaw`SELECT id FROM cash_transaction WHERE id = ${id} FOR UPDATE`
  const d = await tx.cashTransaction.findUnique({ where: { id } })
  if (!d) throw new GalatAturan('Dokumen kas tidak ditemukan.')
  if (d.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return d
}

async function akunDana(tx: DbAtauTx, bankAccountId: number | null) {
  return (await pembacaAkun(tx)(kunciDana(bankAccountId))).id
}

export async function buatKas(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, 'kas.transaksi', 'T')
  const d = skemaKasBaru.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction((tx) => buatKasTx(tx, k, aktor, d))
}

async function buatKasTx(tx: Tx, k: Konteks, aktor: Aktor, d: z.infer<typeof skemaKasBaru>) {
  const info = INFO_KAS[d.kind]
  const bankAccountId = await rekeningDari(tx, d.sumber, 'sumber')
  const accountId = await akunDana(tx, bankAccountId)
  const no = await ambilNomor(tx, `cash_transaction.${d.kind}`, info.awalan, d.date)
  const c = await tx.cashTransaction.create({ data: { kind: d.kind, date: d.date, bankAccountId, accountId, partyName: d.partyName, note: d.note, no, createdBy: aktor.id, updatedBy: aktor.id } })
  await catatAudit(tx, k, { action: `${info.audit}.tambah`, docType: 'cash_transaction', docId: c.id, summary: `Membuat draf ${info.nama.toLowerCase()} ${no} dari ${await namaDana(tx, bankAccountId)}`, after: { no, kind: d.kind, date: d.date, sumber: bankAccountId ?? 'kas', partyName: d.partyName, note: d.note } })
  return c
}

export async function ubahKepalaKas(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  const d = skemaKepalaKas.parse(masukan)
  return db.$transaction(async (tx) => {
    const c = await muatDraf(tx, id)
    const info = INFO_KAS[jenisDari(c.kind)]
    if (c.kind === 'pindah') throw new GalatAturan('Pindah dana diubah lewat formulir pindah dana.')
    pastikanSalahSatu(aktor, info.menu)
    periksaTanggal(aktor, d.date)
    const bankAccountId = await rekeningDari(tx, d.sumber, 'sumber')
    const iso = (x: Date) => x.toISOString().slice(0, 10)
    const sebelum = { date: iso(c.date), sumber: c.bankAccountId ?? 'kas', partyName: c.partyName, note: c.note }
    const sesudah = { date: iso(d.date), sumber: bankAccountId ?? 'kas', partyName: d.partyName, note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.cashTransaction.update({ where: { id }, data: { date: d.date, bankAccountId, accountId: await akunDana(tx, bankAccountId), partyName: d.partyName, note: d.note, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: `${info.audit}.ubah`, docType: 'cash_transaction', docId: id, summary: `Mengubah kepala ${c.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

function pastikanSalahSatu(aktor: Aktor, menu: string) {
  if (!punyaIzin(aktor.izin, menu, 'T') && !punyaIzin(aktor.izin, menu, 'U')) throw new GalatIzin(menu, 'U')
}

async function hitungUlang(tx: Tx, id: number) {
  const s = await tx.cashTransactionLine.aggregate({ where: { cashTransactionId: id }, _sum: { amount: true }, _count: true })
  const total = s._sum.amount ?? 0n
  await tx.cashTransaction.update({ where: { id }, data: { amount: total } })
  return { total, baris: s._count }
}

export async function tambahBarisKas(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, 'kas.transaksi')
  const d = skemaBarisKas.parse(masukan)
  return db.$transaction((tx) => tambahBarisTx(tx, k, aktor, id, d))
}

async function tambahBarisTx(tx: Tx, k: Konteks, aktor: Aktor, id: number, d: z.infer<typeof skemaBarisKas>) {
  const c = await muatDraf(tx, id)
  if (c.kind === 'pindah') throw new GalatAturan('Pindah dana tidak punya baris akun.')
  const a = await periksaLawan(tx, aktor, d.accountId)
  if ((await tx.cashTransactionLine.count({ where: { cashTransactionId: id } })) >= BATAS_BARIS_KAS) throw new GalatAturan(`Satu dokumen paling banyak ${BATAS_BARIS_KAS} baris.`)
  const b = await tx.cashTransactionLine.create({ data: { cashTransactionId: id, accountId: a.id, amount: d.amount, memo: d.memo } })
  const h = await hitungUlang(tx, id)
  await tx.cashTransaction.update({ where: { id }, data: { updatedBy: aktor.id } })
  const info = INFO_KAS[jenisDari(c.kind)]
  await catatAudit(tx, k, { action: `${info.audit}.baris_tambah`, docType: 'cash_transaction', docId: id, summary: `Menambah baris ${c.no}: ${a.code} ${a.name} ${formatRupiah(d.amount)}, total ${formatRupiah(h.total)}`, after: { lineId: b.id, akun: `${a.code} ${a.name}`, amount: d.amount, memo: d.memo } })
  return b
}

export async function hapusBarisKas(db: Db, k: Konteks, aktor: Aktor, id: number, idBaris: number) {
  pastikanSalahSatu(aktor, 'kas.transaksi')
  return db.$transaction(async (tx) => {
    const c = await muatDraf(tx, id)
    const b = await tx.cashTransactionLine.findFirst({ where: { id: idBaris, cashTransactionId: id }, include: { account: true } })
    if (!b) throw new GalatAturan('Baris tidak ditemukan.')
    await tx.cashTransactionLine.delete({ where: { id: idBaris } })
    const h = await hitungUlang(tx, id)
    const info = INFO_KAS[jenisDari(c.kind)]
    await catatAudit(tx, k, { action: `${info.audit}.baris_hapus`, docType: 'cash_transaction', docId: id, summary: `Menghapus baris ${c.no}: ${b.account.code} ${formatRupiah(b.amount)}, total ${formatRupiah(h.total)}`, before: { lineId: b.id, akun: b.account.code, amount: b.amount, memo: b.memo } })
  })
}

// --- Pindah Dana ---

export async function buatPindah(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, 'kas.pindah', 'T')
  const d = skemaPindah.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const { dari, ke } = await danaPindah(tx, d)
    const no = await ambilNomor(tx, 'cash_transaction.pindah', 'PN', d.date)
    const c = await tx.cashTransaction.create({
      data: { kind: 'pindah', date: d.date, bankAccountId: dari, toBankAccountId: ke, accountId: await akunDana(tx, dari), toAccountId: await akunDana(tx, ke), amount: d.amount, note: d.note, no, createdBy: aktor.id, updatedBy: aktor.id },
    })
    await catatAudit(tx, k, { action: 'pindah_dana.tambah', docType: 'cash_transaction', docId: c.id, summary: `Membuat draf pindah dana ${no}: ${await namaDana(tx, dari)} ke ${await namaDana(tx, ke)} ${formatRupiah(d.amount)}`, after: { no, date: d.date, dari: dari ?? 'kas', ke: ke ?? 'kas', amount: d.amount, note: d.note } })
    return c
  })
}

async function danaPindah(tx: DbAtauTx, d: { sumber: string; tujuan: string }) {
  const dari = await rekeningDari(tx, d.sumber, 'sumber')
  const ke = await rekeningDari(tx, d.tujuan, 'tujuan')
  if (dari === ke) throw new GalatAturan('Sumber dan tujuan harus berbeda.', 'tujuan')
  return { dari, ke }
}

export async function ubahPindah(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, 'kas.pindah')
  const d = skemaPindah.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const c = await muatDraf(tx, id)
    if (c.kind !== 'pindah') throw new GalatAturan('Dokumen ini bukan pindah dana.')
    const { dari, ke } = await danaPindah(tx, d)
    const iso = (x: Date) => x.toISOString().slice(0, 10)
    const sebelum = { date: iso(c.date), dari: c.bankAccountId ?? 'kas', ke: c.toBankAccountId ?? 'kas', amount: c.amount.toString(), note: c.note }
    const sesudah = { date: iso(d.date), dari: dari ?? 'kas', ke: ke ?? 'kas', amount: d.amount.toString(), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.cashTransaction.update({ where: { id }, data: { date: d.date, bankAccountId: dari, toBankAccountId: ke, accountId: await akunDana(tx, dari), toAccountId: await akunDana(tx, ke), amount: d.amount, note: d.note, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pindah_dana.ubah', docType: 'cash_transaction', docId: id, summary: `Mengubah pindah dana ${c.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// --- Jurnal ---

// Kas masuk: debit kas atau bank, kredit akun baris. Kas keluar: kebalikannya. Pindah dana: debit tujuan, kredit sumber.
export async function jurnalKas(tx: Tx, id: number, oleh: number | null): Promise<HasilJurnal | null> {
  const c = await tx.cashTransaction.findUniqueOrThrow({ where: { id }, include: { cashTransactionLines: { orderBy: { id: 'asc' } } } })
  const info = INFO_KAS[jenisDari(c.kind)]
  const memo = `${info.nama} ${c.no}${c.partyName ? ` (${c.partyName})` : ''}`
  const baris: BarisJurnal[] = []
  if (c.kind === 'pindah') {
    baris.push({ akun: kunciDana(c.toBankAccountId), debit: c.amount, memo, bankAccountId: c.toBankAccountId })
    baris.push({ akun: kunciDana(c.bankAccountId), kredit: c.amount, memo, bankAccountId: c.bankAccountId })
  } else {
    const masuk = c.kind === 'masuk'
    for (const b of c.cashTransactionLines) baris.push(masuk ? { akun: b.accountId, kredit: b.amount, memo: b.memo || memo } : { akun: b.accountId, debit: b.amount, memo: b.memo || memo })
    baris.push(masuk ? { akun: kunciDana(c.bankAccountId), debit: c.amount, memo, bankAccountId: c.bankAccountId } : { akun: kunciDana(c.bankAccountId), kredit: c.amount, memo, bankAccountId: c.bankAccountId })
  }
  return buatJurnal(tx, { docType: 'cash_transaction', docId: id, docNo: c.no, tanggal: c.date, memo, oleh }, baris)
}

// --- Alur status ---

export type AksiKas = 'ajukan' | 'kembalikan' | 'setujui' | 'posting' | 'batal'
const NAMA_AKSI: Record<AksiKas, string> = { ajukan: 'Mengajukan', kembalikan: 'Mengembalikan ke draf', setujui: 'Menyetujui', posting: 'Memposting', batal: 'Membatalkan' }

// Pemeriksaan isi sebelum diajukan, disetujui, atau diposting.
async function periksaIsi(tx: Tx, c: { id: number; kind: string; amount: bigint; bankAccountId: number | null; toBankAccountId: number | null }) {
  if (c.kind !== 'pindah') {
    const n = await tx.cashTransactionLine.count({ where: { cashTransactionId: c.id } })
    if (!n) throw new GalatAturan('Tambahkan minimal satu baris akun dulu.')
    const h = await hitungUlang(tx, c.id)
    if (h.total !== c.amount) c.amount = h.total
  }
  if (c.amount <= 0n) throw new GalatAturan('Jumlah harus lebih dari 0.')
  for (const r of [c.bankAccountId, c.toBankAccountId]) {
    if (!r) continue
    const x = await tx.bankAccount.findUnique({ where: { id: r } })
    if (!x || !x.active) throw new GalatAturan('Rekening di dokumen ini sudah nonaktif. Ubah draf dan pilih yang lain.')
  }
}

// Satu pintu perubahan status kas (KONTRAK 3.2). Dengan aturan persetujuan: Draft -> Diajukan -> Disetujui (S) ->
// Diposting (P). Tanpa aturan: Draft atau Diajukan -> Diposting (P). Batal dari Diposting membalik jurnal.
export const ubahStatusKas = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiKas, opsi: { alasan?: string } = {}) => db.$transaction((tx) => ubahStatusKasTx(tx, k, aktor, id, aksi, opsi))

export async function ubahStatusKasTx(tx: Tx, k: Konteks, aktor: Aktor, id: number, aksi: AksiKas, opsi: { alasan?: string } = {}) {
  await tx.$executeRaw`SELECT id FROM cash_transaction WHERE id = ${id} FOR UPDATE`
  const c = await tx.cashTransaction.findUnique({ where: { id } })
  if (!c) throw new GalatAturan('Dokumen kas tidak ditemukan.')
  const info = INFO_KAS[jenisDari(c.kind)]
  const menu = info.menu
  pastikanIzin(aktor, menu, 'L')
  const nama = info.nama.toLowerCase()
  const setuju = await butuhSetujuKas(tx, c.kind, c.amount)
  const gol = setuju ? 'pelaksana_setuju' : 'pelaksana'
  const iz = (a: 'T' | 'U' | 'S' | 'P') => punyaIzin(aktor.izin, menu, a)
  const tolak = (): never => {
    throw new GalatAturan(`${info.nama} berstatus ${c.status} tidak bisa ${NAMA_AKSI[aksi].toLowerCase()}.`)
  }
  const sekarang = new Date()
  let ringkas = `${NAMA_AKSI[aksi]} ${nama} ${c.no}`
  let sesudah: Record<string, unknown> = {}
  let data: Record<string, unknown>
  if (aksi === 'ajukan') {
    if (!iz('T') && !iz('U')) throw new GalatIzin(menu, 'U')
    if (!transisiSah(gol, c.status, 'Diajukan')) tolak()
    await periksaIsi(tx, c)
    data = { status: 'Diajukan', submittedBy: aktor.id, submittedAt: sekarang }
  } else if (aksi === 'kembalikan') {
    if (!transisiSah(gol, c.status, 'Draft')) tolak()
    if (!iz('S') && c.submittedBy !== aktor.id) throw new GalatIzin(menu, 'S')
    data = { status: 'Draft', submittedBy: null, submittedAt: null }
  } else if (aksi === 'setujui') {
    if (!setuju || !transisiSah(gol, c.status, 'Disetujui')) {
      if (!setuju) throw new GalatAturan(`${info.nama} ini tidak butuh persetujuan. Langsung posting.`)
      tolak()
    }
    pastikanIzin(aktor, menu, 'S')
    await periksaIsi(tx, c)
    ringkas += `, ${formatRupiah(c.amount)}`
    data = { status: 'Disetujui', approvedBy: aktor.id, approvedAt: sekarang }
  } else if (aksi === 'posting') {
    pastikanIzin(aktor, menu, 'P')
    if (!transisiSah(gol, c.status, 'Diposting', { butuhSetuju: setuju })) {
      if (setuju && c.status !== 'Disetujui') throw new GalatAturan(`${info.nama} ini harus diajukan dan disetujui dulu sebelum diposting.`)
      tolak()
    }
    periksaTanggal(aktor, c.date)
    await pastikanPeriodeTerbuka(tx, c.date, `Posting ${c.no}`)
    await periksaIsi(tx, c)
    // Akun kas atau bank dibaca ulang dari pemetaan saat posting; baris lawan diperiksa lagi terhadap akun inti.
    const inti = await idAkunInti(tx)
    for (const b of await tx.cashTransactionLine.findMany({ where: { cashTransactionId: id }, include: { account: true } })) {
      if (inti.has(b.accountId) || !b.account.active || !b.account.isPostable) throw new GalatAturan(`Akun ${b.account.code} ${b.account.name} tidak boleh dipakai di kas masuk atau keluar. Hapus barisnya dulu.`)
    }
    await tx.cashTransaction.update({ where: { id }, data: { accountId: await akunDana(tx, c.bankAccountId), ...(c.kind === 'pindah' ? { toAccountId: await akunDana(tx, c.toBankAccountId) } : {}) } })
    const j = await jurnalKas(tx, id, aktor.id)
    ringkas += `, ${formatRupiah(c.amount)}`
    sesudah = { jumlah: c.amount, jurnal: j?.no ?? null }
    data = { status: 'Diposting', postedBy: aktor.id, postedAt: sekarang }
  } else {
    const alasan = (opsi.alasan ?? '').trim()
    if (alasan.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
    if (c.status === 'Diposting') {
      pastikanIzin(aktor, menu, 'P')
      if (!saklarNyala(aktor, 'dok.batal_posting')) throw new GalatAturan('Membatalkan dokumen yang sudah Diposting butuh saklar Batalkan dokumen diposting.')
      if (alasan.length < 5) throw new GalatAturan('Tulis alasan pembatalan, minimal 5 huruf.', 'alasan')
      const tgl = hariIni(sekarang)
      await pastikanPeriodeTerbuka(tx, tgl, `Pembatalan ${c.no}`)
      const b = await buatJurnalBalik(tx, { docType: 'cash_transaction', docId: id, docNo: c.no, tanggal: tgl, memo: `Batal ${nama} ${c.no}`, oleh: aktor.id })
      ringkas = `Membatalkan ${nama} ${c.no} yang sudah Diposting. Alasan: ${alasan}`
      sesudah = { jurnalBalik: b?.no ?? null }
      data = { status: 'Batal', cancelledBy: aktor.id, cancelledAt: sekarang, cancelReason: alasan, reversalJournalId: b?.id ?? null }
    } else {
      pastikanIzin(aktor, menu, 'U')
      if (!transisiSah(gol, c.status, 'Batal')) tolak()
      if (alasan) ringkas += `. Alasan: ${alasan}`
      data = { status: 'Batal', cancelledBy: aktor.id, cancelledAt: sekarang, cancelReason: alasan || null }
    }
  }
  await tx.cashTransaction.update({ where: { id }, data: { ...data, updatedBy: aktor.id } })
  await catatAudit(tx, k, { action: `${info.audit}.${aksi}`, docType: 'cash_transaction', docId: id, summary: ringkas, before: { status: c.status }, after: { status: data.status, ...sesudah } })
  return data.status as DocStatus
}

export async function hapusKas(db: Db, k: Konteks, aktor: Aktor, id: number) {
  return db.$transaction(async (tx) => {
    const c = await muatDraf(tx, id)
    const info = INFO_KAS[jenisDari(c.kind)]
    pastikanIzin(aktor, info.menu, 'H')
    await tx.cashTransaction.delete({ where: { id } })
    await catatAudit(tx, k, { action: `${info.audit}.hapus`, docType: 'cash_transaction', docId: id, summary: `Menghapus draf ${info.nama.toLowerCase()} ${c.no}`, before: { no: c.no, status: c.status } })
    return c
  })
}

// Tombol yang ditawarkan layar rincian. Server memeriksa ulang di ubahStatusKas.
export function tombolKas(aktor: Pick<Pengguna, 'izin' | 'saklar' | 'id'>, menu: string, status: DocStatus, butuhSetuju: boolean, submittedBy: number | null) {
  const iz = (a: 'T' | 'U' | 'H' | 'S' | 'P') => punyaIzin(aktor.izin, menu, a)
  const draf = status === 'Draft'
  const aju = status === 'Diajukan'
  return {
    ubah: draf && (iz('T') || iz('U')),
    hapus: draf && iz('H'),
    ajukan: draf && (iz('T') || iz('U')),
    kembalikan: aju && (iz('S') || submittedBy === aktor.id),
    setujui: butuhSetuju && aju && iz('S'),
    posting: butuhSetuju ? status === 'Disetujui' && iz('P') : (draf || aju) && iz('P'),
    batal: (draf || aju || status === 'Disetujui') && iz('U'),
    batalPosting: status === 'Diposting' && iz('P') && saklarNyala(aktor, 'dok.batal_posting'),
  }
}

// --- Dibuat dari baris mutasi bank (Rekonsiliasi, RANCANGAN 7) ---

// Kas masuk atau keluar satu baris dari rekening, langsung melewati semua langkah status dalam transaksi pemanggil
// (uangnya sudah bergerak di bank). Butuh izin T, S, dan P di kas.transaksi. Mengembalikan id dokumen dan id baris
// jurnal bank yang akan dicocokkan.
export async function kasDariMutasi(tx: Tx, k: Konteks, aktor: Aktor, d: { kind: 'masuk' | 'keluar'; date: Date; bankAccountId: number; accountId: number; amount: bigint; memo: string }) {
  for (const a of ['T', 'S', 'P'] as const) pastikanIzin(aktor, 'kas.transaksi', a)
  const c = await buatKasTx(tx, k, aktor, { kind: d.kind, date: d.date, sumber: String(d.bankAccountId), partyName: '', note: `Dari mutasi rekening: ${d.memo}`.slice(0, 300) })
  await tambahBarisTx(tx, k, aktor, c.id, { accountId: d.accountId, amount: d.amount, memo: d.memo.slice(0, 120) })
  const setuju = await butuhSetujuKas(tx, d.kind, d.amount)
  await ubahStatusKasTx(tx, k, aktor, c.id, 'ajukan')
  if (setuju) await ubahStatusKasTx(tx, k, aktor, c.id, 'setujui')
  await ubahStatusKasTx(tx, k, aktor, c.id, 'posting')
  const baris = await tx.journalLine.findFirstOrThrow({ where: { journal: { sourceType: 'cash_transaction', sourceId: c.id, reversalOfId: null }, bankAccountId: d.bankAccountId } })
  return { id: c.id, no: c.no, journalLineId: baris.id }
}

// --- Daftar dan rincian ---

export type SaringKas = { jenis?: string; status?: string; dari?: string; sampai?: string; q?: string; hal?: string }
const STATUS_KAS = ['Draft', 'Diajukan', 'Disetujui', 'Diposting', 'Batal'] as const

export async function daftarKas(db: Db, s: SaringKas, pindah: boolean) {
  const status = (STATUS_KAS as readonly string[]).includes(s.status ?? '') ? (s.status as DocStatus) : undefined
  const tgl = (t?: string) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime()) ? new Date(`${t}T00:00:00Z`) : undefined)
  const dari = tgl(s.dari)
  const sampai = tgl(s.sampai)
  const q = s.q?.trim().slice(0, 30)
  const jenis = pindah ? ['pindah'] : s.jenis === 'masuk' || s.jenis === 'keluar' ? [s.jenis] : ['masuk', 'keluar']
  const where = {
    kind: { in: jenis },
    ...(status ? { status } : {}),
    ...(dari || sampai ? { date: { ...(dari ? { gte: dari } : {}), ...(sampai ? { lte: sampai } : {}) } } : {}),
    ...(q ? { OR: [{ no: { contains: q.toUpperCase() } }, { partyName: { contains: q, mode: 'insensitive' as const } }, { note: { contains: q, mode: 'insensitive' as const } }] } : {}),
  }
  const hal = sesuaiHalaman(s.hal)
  const [baris, total] = await Promise.all([
    db.cashTransaction.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.cashTransaction.count({ where }),
  ])
  const rek = new Map((await db.bankAccount.findMany()).map((r) => [r.id, namaRekening(r)]))
  const dana = (id: number | null) => (id ? (rek.get(id) ?? `Rekening #${id}`) : 'Kas Besar')
  return { baris: baris.map((b) => ({ ...b, dari: dana(b.bankAccountId), ke: dana(b.toBankAccountId) })), total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export const muatKas = (db: DbAtauTx, id: number) =>
  db.cashTransaction.findUnique({ where: { id }, include: { cashTransactionLines: { include: { account: true }, orderBy: { id: 'asc' } } } })

// Pilihan sumber dana: Kas Besar dan rekening aktif.
export async function pilihanDana(db: DbAtauTx) {
  const r = await db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } })
  return [{ nilai: 'kas', label: 'Kas Besar' }, ...r.map((x) => ({ nilai: String(x.id), label: namaRekening(x) }))]
}
