// Jurnal Umum (tahap 5B): daftar semua jurnal dan jurnal memorial manual (padanan Memorial Journal ESB, menu akun.jurnal,
// Owner L T U H S P). Memorial adalah dokumen pelaksana: Draft -> Diajukan -> Diposting lewat "Setujui dan posting"
// (approval_rule journal), Diajukan -> Draft, Draft | Diajukan -> Batal, Diposting -> Batal lewat jurnal balik.
// Barisnya disimpan langsung di journal_line selama Draft dan baru berlaku saat posted_at terisi. Tanpa impor Next.
import { z } from 'zod'
import type { DocStatus, Prisma } from '@/generated/prisma/client'
import { GalatAturan, GalatIzin, GalatSaklar } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, DbAtauTx, Tx } from '../db'
import { pastikanIzin, punyaIzin, saklarNyala, type Pengguna } from '../izin-inti'
import { ambilNomor } from '../nomor'
import { transisiSah } from '../status'
import { tanggalIso } from '../waktu'
import { buatJurnalBalik, pastikanPeriodeTerbuka, tanggalJurnal } from './jurnal'

type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar'>
const MENU = 'akun.jurnal'
export const SUMBER_MEMORIAL = 'memorial'
const BATAS_BARIS = 100

const rp = (n: bigint) => `Rp ${n.toLocaleString('id-ID')}`

const skemaTanggal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Isi tanggal jurnal.')
  .refine((s) => !Number.isNaN(new Date(`${s}T00:00:00Z`).getTime()) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s, 'Tanggal tidak sah.')
  .transform((s) => new Date(`${s}T00:00:00Z`))

export const skemaKepalaMemorial = z.object({
  date: skemaTanggal,
  memo: z.string().trim().min(3, 'Tulis keterangan jurnal, minimal 3 huruf.').max(300, 'Keterangan paling panjang 300 huruf.'),
})

const uang = z.preprocess((v) => String(v ?? '').replace(/[^\d]/g, ''), z.string().transform((s) => (s === '' ? 0n : BigInt(s))).refine((n) => n <= 100_000_000_000n, 'Nilai terlalu besar.'))

export const skemaBarisMemorial = z
  .object({
    accountId: z.coerce.number({ message: 'Pilih akun.' }).int('Pilih akun.').positive('Pilih akun.'),
    debit: uang,
    kredit: uang,
    memo: z.string().trim().max(200, 'Keterangan baris paling panjang 200 huruf.').default(''),
  })
  .refine((b) => (b.debit > 0n) !== (b.kredit > 0n), { path: ['debit'], message: 'Isi debit atau kredit saja, lebih dari 0.' })

function periksaTanggal(tanggal: Date) {
  if (tanggal.getTime() > new Date(`${tanggalIso(new Date())}T00:00:00Z`).getTime()) throw new GalatAturan('Tanggal jurnal tidak boleh lewat dari hari ini.', 'date')
}

async function kunci(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM journal WHERE id = ${id} FOR UPDATE`
  const j = await tx.journal.findUnique({ where: { id }, include: { journalLines: { include: { account: true }, orderBy: { id: 'asc' } } } })
  if (!j || j.sourceType !== SUMBER_MEMORIAL) throw new GalatAturan('Jurnal memorial tidak ditemukan.')
  return j
}

const pastikanDraf = (j: { status: DocStatus }) => {
  if (j.status !== 'Draft') throw new GalatAturan('Jurnal memorial hanya bisa diubah saat masih Draft.')
}

function pastikanTU(aktor: Aktor) {
  if (!punyaIzin(aktor.izin, MENU, 'T') && !punyaIzin(aktor.izin, MENU, 'U')) throw new GalatIzin(MENU, 'U')
}

export async function buatMemorial(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaMemorial.parse(masukan)
  periksaTanggal(d.date)
  return db.$transaction(async (tx) => {
    const no = await ambilNomor(tx, 'journal_memorial', 'JM', d.date)
    const j = await tx.journal.create({ data: { no, date: d.date, sourceType: SUMBER_MEMORIAL, docNo: no, memo: d.memo, status: 'Draft', postedAt: null, createdBy: aktor.id, updatedBy: aktor.id } })
    await tx.journal.update({ where: { id: j.id }, data: { sourceId: j.id } })
    await catatAudit(tx, k, { action: 'memorial.tambah', docType: 'journal', docId: j.id, summary: `Membuat draf jurnal memorial ${no}: ${d.memo}`, after: { no, date: d.date, memo: d.memo } })
    return j
  })
}

export async function ubahKepalaMemorial(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanTU(aktor)
  const d = skemaKepalaMemorial.parse(masukan)
  periksaTanggal(d.date)
  return db.$transaction(async (tx) => {
    const j = await kunci(tx, id)
    pastikanDraf(j)
    if (j.date.getTime() === d.date.getTime() && j.memo === d.memo) return { berubah: false }
    await tx.journal.update({ where: { id }, data: { date: d.date, memo: d.memo, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'memorial.ubah', docType: 'journal', docId: id, summary: `Mengubah kepala jurnal memorial ${j.no}`, before: { date: j.date, memo: j.memo }, after: { date: d.date, memo: d.memo } })
    return { berubah: true }
  })
}

export async function tambahBarisMemorial(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanTU(aktor)
  const d = skemaBarisMemorial.parse(masukan)
  return db.$transaction(async (tx) => {
    const j = await kunci(tx, id)
    pastikanDraf(j)
    if (j.journalLines.length >= BATAS_BARIS) throw new GalatAturan(`Satu jurnal memorial paling banyak ${BATAS_BARIS} baris.`)
    const a = await tx.account.findUnique({ where: { id: d.accountId } })
    if (!a) throw new GalatAturan('Akun tidak ditemukan.', 'accountId')
    if (!a.active || !a.isPostable) throw new GalatAturan(`${a.code} ${a.name} nonaktif atau akun induk, pilih akun lain.`, 'accountId')
    const l = await tx.journalLine.create({ data: { journalId: id, accountId: a.id, debit: d.debit, credit: d.kredit, memo: d.memo } })
    await tx.journal.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'memorial.baris_tambah',
      docType: 'journal',
      docId: id,
      summary: `Menambah baris ${a.code} ${a.name} ${d.debit ? `debit ${rp(d.debit)}` : `kredit ${rp(d.kredit)}`} di ${j.no}`,
      after: { lineId: l.id, akun: a.code, debit: d.debit, kredit: d.kredit, memo: d.memo },
    })
    return l
  })
}

export async function hapusBarisMemorial(db: Db, k: Konteks, aktor: Aktor, id: number, idBaris: number) {
  pastikanTU(aktor)
  return db.$transaction(async (tx) => {
    const j = await kunci(tx, id)
    pastikanDraf(j)
    const l = j.journalLines.find((x) => x.id === idBaris)
    if (!l) throw new GalatAturan('Baris tidak ditemukan.')
    await tx.journalLine.delete({ where: { id: idBaris } })
    await catatAudit(tx, k, { action: 'memorial.baris_hapus', docType: 'journal', docId: id, summary: `Menghapus baris ${l.account.code} ${l.account.name} dari ${j.no}`, before: { lineId: l.id, akun: l.account.code, debit: l.debit, kredit: l.credit } })
  })
}

export async function hapusMemorial(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'H')
  return db.$transaction(async (tx) => {
    const j = await kunci(tx, id)
    if (j.status !== 'Draft' || j.postedAt) throw new GalatAturan('Hanya jurnal memorial Draft yang bisa dihapus. Selain itu dibatalkan.')
    await tx.journal.delete({ where: { id } })
    await catatAudit(tx, k, { action: 'memorial.hapus', docType: 'journal', docId: id, summary: `Menghapus draf jurnal memorial ${j.no}`, before: { no: j.no, memo: j.memo, baris: j.journalLines.length } })
  })
}

export const butuhSetujuMemorial = async (db: DbAtauTx) => !!(await db.approvalRule.findUnique({ where: { docType: 'journal' } }))?.requiresApproval

// Isi memorial harus lengkap sebelum diajukan atau diposting: minimal dua baris, seimbang, dan semua akun masih aktif.
function periksaIsi(j: Awaited<ReturnType<typeof kunci>>) {
  if (j.journalLines.length < 2) throw new GalatAturan('Jurnal memorial butuh minimal dua baris.')
  const debit = j.journalLines.reduce((n, l) => n + l.debit, 0n)
  const kredit = j.journalLines.reduce((n, l) => n + l.credit, 0n)
  if (debit !== kredit) throw new GalatAturan(`Jurnal tidak seimbang: debit ${rp(debit)}, kredit ${rp(kredit)}. Selisih ${rp(debit > kredit ? debit - kredit : kredit - debit)}.`)
  if (debit === 0n) throw new GalatAturan('Jurnal memorial bernilai 0.')
  const mati = j.journalLines.find((l) => !l.account.active || !l.account.isPostable)
  if (mati) throw new GalatAturan(`Akun ${mati.account.code} ${mati.account.name} sudah nonaktif. Ganti barisnya dulu.`)
  return debit
}

export type AksiMemorial = 'ajukan' | 'kembalikan' | 'posting' | 'batal'

export async function ubahStatusMemorial(db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiMemorial, opsi: { alasan?: string } = {}) {
  pastikanIzin(aktor, MENU, 'L')
  return db.$transaction(async (tx) => {
    const j = await kunci(tx, id)
    const setuju = await butuhSetujuMemorial(tx)
    const sekarang = new Date()
    const tolak = () => {
      throw new GalatAturan(`Jurnal memorial berstatus ${j.status} tidak bisa di${aksi === 'kembalikan' ? 'kembalikan ke Draft' : aksi}.`)
    }
    let data: Prisma.JournalUpdateInput
    let ringkas: string
    let sesudah: Record<string, unknown> = {}
    if (aksi === 'ajukan') {
      pastikanTU(aktor)
      if (!transisiSah('pelaksana', j.status, 'Diajukan')) tolak()
      const total = periksaIsi(j)
      data = { status: 'Diajukan', submittedBy: aktor.id, submittedAt: sekarang }
      ringkas = `Mengajukan jurnal memorial ${j.no} senilai ${rp(total)}`
    } else if (aksi === 'kembalikan') {
      if (!transisiSah('pelaksana', j.status, 'Draft')) tolak()
      if (!punyaIzin(aktor.izin, MENU, 'S') && j.submittedBy !== aktor.id) throw new GalatIzin(MENU, 'S')
      data = { status: 'Draft', submittedBy: null, submittedAt: null }
      ringkas = `Mengembalikan jurnal memorial ${j.no} ke Draft${opsi.alasan ? `: ${opsi.alasan}` : ''}`
    } else if (aksi === 'posting') {
      pastikanIzin(aktor, MENU, 'P')
      if (!transisiSah('pelaksana', j.status, 'Diposting', { butuhSetuju: setuju })) {
        if (setuju && j.status === 'Draft') throw new GalatAturan('Jurnal memorial perlu disetujui. Ajukan dulu, lalu penyetuju menekan Setujui dan posting.')
        tolak()
      }
      if (setuju) pastikanIzin(aktor, MENU, 'S')
      periksaTanggal(j.date)
      const total = periksaIsi(j)
      const periodId = await pastikanPeriodeTerbuka(tx, j.date)
      data = { status: 'Diposting', postedAt: sekarang, postedBy: aktor.id, period: { connect: { id: periodId } }, ...(setuju ? { approvedBy: aktor.id, approvedAt: sekarang } : {}) }
      ringkas = `${setuju ? 'Menyetujui dan memposting' : 'Memposting'} jurnal memorial ${j.no} senilai ${rp(total)}`
      sesudah = { total }
    } else {
      const alasan = (opsi.alasan ?? '').trim()
      if (alasan.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
      if (j.status === 'Diposting') {
        pastikanIzin(aktor, MENU, 'P')
        if (!saklarNyala(aktor, 'dok.batal_posting')) throw new GalatSaklar('dok.batal_posting', 'Membatalkan jurnal yang sudah Diposting butuh saklar Batalkan dokumen diposting.')
        if (alasan.length < 5) throw new GalatAturan('Tulis alasan pembatalan, minimal 5 huruf.', 'alasan')
        const balik = await buatJurnalBalik(tx, { docType: SUMBER_MEMORIAL, docId: id, docNo: j.no, tanggal: tanggalJurnal(sekarang), memo: `Batal ${j.no}: ${alasan}`, oleh: aktor.id })
        sesudah = { jurnalBalik: balik?.no ?? null }
        ringkas = `Membatalkan jurnal memorial ${j.no} yang sudah Diposting dengan jurnal balik ${balik?.no ?? '-'}. Alasan: ${alasan}`
      } else {
        pastikanIzin(aktor, MENU, 'U')
        if (!transisiSah('pelaksana', j.status, 'Batal')) tolak()
        ringkas = `Membatalkan jurnal memorial ${j.no}${alasan ? `. Alasan: ${alasan}` : ''}`
      }
      data = { status: 'Batal', cancelledBy: aktor.id, cancelledAt: sekarang, cancelReason: alasan || null }
    }
    await tx.journal.update({ where: { id }, data: { ...data, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: `memorial.${aksi}`, docType: 'journal', docId: id, summary: ringkas, before: { status: j.status }, after: { status: data.status, ...sesudah } })
    return data.status as DocStatus
  })
}

// Tombol yang ditawarkan di rincian memorial. Server tetap memeriksa ulang.
export function tombolMemorial(aktor: Aktor, status: DocStatus, butuhSetuju: boolean, submittedBy: number | null) {
  const izin = (a: 'T' | 'U' | 'H' | 'S' | 'P') => punyaIzin(aktor.izin, MENU, a)
  return {
    ubah: status === 'Draft' && (izin('T') || izin('U')),
    hapus: status === 'Draft' && izin('H'),
    ajukan: status === 'Draft' && (izin('T') || izin('U')),
    kembalikan: status === 'Diajukan' && (izin('S') || submittedBy === aktor.id),
    posting: (status === 'Draft' && !butuhSetuju && izin('P')) || (status === 'Diajukan' && izin('P') && (!butuhSetuju || izin('S'))),
    setujuiPosting: butuhSetuju,
    batal: (status === 'Draft' || status === 'Diajukan') && izin('U'),
    batalPosting: status === 'Diposting' && izin('P') && saklarNyala(aktor, 'dok.batal_posting'),
  }
}

// --- Daftar dan rincian semua jurnal ---

export const PER_HALAMAN_JURNAL = 50
export type SaringJurnal = { dari?: string; sampai?: string; sumber?: string; status?: string; akun?: string; q?: string; hal?: string }
const tgl = (t?: string) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime()) ? new Date(`${t}T00:00:00Z`) : undefined)

export const STATUS_JURNAL = ['Draft', 'Diajukan', 'Diposting', 'Batal'] as const

export function syaratJurnal(s: SaringJurnal): Prisma.JournalWhereInput {
  const w: Prisma.JournalWhereInput = {}
  const dari = tgl(s.dari)
  const sampai = tgl(s.sampai)
  if (dari || sampai) w.date = { ...(dari ? { gte: dari } : {}), ...(sampai ? { lte: sampai } : {}) }
  if (s.sumber && /^[a-z_]{2,40}$/.test(s.sumber)) w.sourceType = s.sumber
  if (s.status === 'balik') w.reversalOfId = { not: null }
  else if (s.status && (STATUS_JURNAL as readonly string[]).includes(s.status)) w.status = s.status as DocStatus
  if (Number(s.akun) > 0) w.journalLines = { some: { accountId: Number(s.akun) } }
  const q = s.q?.trim().slice(0, 40)
  if (q) w.OR = [{ no: { contains: q, mode: 'insensitive' } }, { docNo: { contains: q, mode: 'insensitive' } }, { memo: { contains: q, mode: 'insensitive' } }]
  return w
}

export async function daftarJurnal(db: DbAtauTx, s: SaringJurnal) {
  const hal = Math.max(1, Math.min(1000, Number(s.hal) || 1))
  const where = syaratJurnal(s)
  const [baris, total] = await Promise.all([
    db.journal.findMany({ where, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * PER_HALAMAN_JURNAL, take: PER_HALAMAN_JURNAL, include: { journalLines: { select: { debit: true } }, reversalOf: { select: { no: true } } } }),
    db.journal.count({ where }),
  ])
  return {
    baris: baris.map((j) => ({ ...j, total: j.journalLines.reduce((n, l) => n + l.debit, 0n), jumlahBaris: j.journalLines.length })),
    total,
    hal,
    jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN_JURNAL)),
  }
}

export async function ambilJurnal(db: DbAtauTx, id: number) {
  const j = await db.journal.findUnique({
    where: { id },
    include: {
      journalLines: { include: { account: { select: { id: true, code: true, name: true, kind: true, active: true, isPostable: true } } }, orderBy: { id: 'asc' } },
      reversalOf: { select: { id: true, no: true } },
      reversals: { select: { id: true, no: true, date: true } },
      period: { select: { yearMonth: true, status: true } },
    },
  })
  if (!j) return null
  const ids = [j.createdBy, j.postedBy, j.submittedBy, j.approvedBy, j.cancelledBy].filter((x): x is number => !!x)
  const nama = new Map((await db.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  const n = (x: number | null) => (x ? (nama.get(x) ?? `#${x}`) : null)
  return {
    ...j,
    debit: j.journalLines.reduce((a, l) => a + l.debit, 0n),
    kredit: j.journalLines.reduce((a, l) => a + l.credit, 0n),
    nama: { dibuat: n(j.createdBy), diposting: n(j.postedBy), diajukan: n(j.submittedBy), disetujui: n(j.approvedBy), dibatalkan: n(j.cancelledBy) },
  }
}
