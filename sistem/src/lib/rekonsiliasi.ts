// Rekonsiliasi Bank (tahap 5C, RANCANGAN 7). Impor mutasi rekening dari CSV, dokumen rekonsiliasi per rekening per
// periode, pencocokan mutasi dengan baris jurnal bank (manual dan saran otomatis), transaksi kas dari baris mutasi, dan
// posting bila selisihnya 0. Baris jurnal yang sudah dicocokkan terkunci dari pembatalan dokumen sumbernya (jurnal.ts).
// Izin kas.rekonsiliasi (bawaan Owner saja). Tanpa impor Next.
import { randomBytes } from 'node:crypto'
import type { DocStatus } from '@/generated/prisma/client'
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { kunciBank, pembacaAkun } from './akuntansi/pemetaan'
import { catatAudit, type Konteks } from './audit'
import type { Db, DbAtauTx, Tx } from './db'
import { pastikanIzin, type Pengguna } from './izin-inti'
import { kasDariMutasi } from './kas'
import { PER_HALAMAN, formatRupiah, sesuaiHalaman, skemaUang } from './master'
import { uraiMutasi, type PemetaanCsv } from './mutasi-csv'
import { ambilNomor } from './nomor'
import { namaRekening } from './rekening'
import { tanggalIso } from './waktu'

export type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar'>
const MENU = 'kas.rekonsiliasi'
export const JARAK_SARAN_HARI = 3
export const BATAS_IMPOR = 5000
const HARI = 86_400_000
const iso = (d: Date) => d.toISOString().slice(0, 10)
const tambahHari = (d: Date, n: number) => new Date(d.getTime() + n * HARI)

// Nilai bersih baris mutasi dari sisi buku: kredit rekening koran (uang masuk) = debit akun bank.
export const netMutasi = (m: { debit: bigint; credit: bigint }) => m.credit - m.debit
const netJurnal = (l: { debit: bigint; credit: bigint }) => l.debit - l.credit

async function rekeningAktif(tx: DbAtauTx, id: number) {
  const r = await tx.bankAccount.findUnique({ where: { id } })
  if (!r) throw new GalatAturan('Rekening tidak ditemukan.', 'bankAccountId')
  return r
}

// Akun COA rekening: pemetaan bank.<id>, lalu bank.
export async function akunRekening(tx: DbAtauTx, bankAccountId: number) {
  return (await pembacaAkun(tx)(kunciBank(bankAccountId))).id
}

// --- Impor mutasi ---

export async function imporMutasi(db: Db, k: Konteks, aktor: Aktor, bankAccountId: number, teks: string, p: PemetaanCsv, namaBerkas = '') {
  pastikanIzin(aktor, MENU, 'T')
  const urai = uraiMutasi(teks, p)
  if (!urai.baris.length) throw new GalatAturan(`Tidak ada baris mutasi yang terbaca dari ${urai.jumlahBaris} baris berkas. Periksa pemetaan kolom dan format tanggal.`)
  if (urai.baris.length > BATAS_IMPOR) throw new GalatAturan(`Satu impor paling banyak ${BATAS_IMPOR} baris mutasi.`)
  return db.$transaction(
    async (tx) => {
      const r = await rekeningAktif(tx, bankAccountId)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('mutasi'), ${bankAccountId})`
      // Baris di periode yang sudah direkonsiliasi (Diposting) tidak diimpor lagi.
      const akhir = await tx.bankReconcile.findFirst({ where: { bankAccountId, status: 'Diposting' }, orderBy: { periodTo: 'desc' } })
      const batas = akhir?.periodTo ?? null
      const sekarang = new Date()
      const batch = `IMP-${sekarang.toISOString().replace(/\D/g, '').slice(0, 17)}-${aktor.id}-${randomBytes(3).toString('hex')}`
      const ada = new Set((await tx.bankStatementLine.findMany({ where: { bankAccountId, dedupKey: { in: urai.baris.map((b) => b.dedupKey) } }, select: { dedupKey: true } })).map((x) => x.dedupKey))
      const baru = urai.baris.filter((b) => !ada.has(b.dedupKey) && (!batas || b.date > batas))
      const terkunci = urai.baris.filter((b) => !ada.has(b.dedupKey) && batas && b.date <= batas).length
      // Draf rekonsiliasi rekening ini yang periodenya mencakup baris baru langsung memuatnya.
      const draf = await tx.bankReconcile.findFirst({ where: { bankAccountId, status: 'Draft' } })
      if (baru.length) {
        await tx.bankStatementLine.createMany({
          data: baru.map((b) => ({
            bankAccountId,
            date: b.date,
            description: b.description,
            ref: b.ref,
            debit: b.debit,
            credit: b.credit,
            balance: b.balance,
            importBatch: batch,
            dedupKey: b.dedupKey,
            createdBy: aktor.id,
            bankReconcileId: draf && b.date >= draf.periodFrom && b.date <= draf.periodTo ? draf.id : null,
          })),
          skipDuplicates: true,
        })
      }
      const ringkas = { dibaca: urai.baris.length, baru: baru.length, sudahAda: ada.size, terkunci, bukanMutasi: urai.lewat.length }
      await catatAudit(tx, k, {
        action: 'mutasi.impor',
        docType: 'bank_statement_line',
        docId: batch,
        summary: `Mengimpor mutasi ${namaRekening(r)}${namaBerkas ? ` dari ${namaBerkas.slice(0, 80)}` : ''}: ${baru.length} baris baru, ${ada.size} sudah pernah diimpor, ${terkunci} di periode yang sudah direkonsiliasi, ${urai.lewat.length} baris bukan mutasi`,
        after: { batch, ...ringkas, pemetaan: p },
      })
      return { batch, ...ringkas, lewat: urai.lewat.slice(0, 20) }
    },
    { timeout: 30_000 },
  )
}

// Hapus baris mutasi yang belum cocok dan belum masuk rekonsiliasi Diposting (misalnya salah pemetaan saat impor).
export async function hapusMutasi(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'H')
  return db.$transaction(async (tx) => {
    const m = await tx.bankStatementLine.findUnique({ where: { id }, include: { bankReconcile: true } })
    if (!m) throw new GalatAturan('Baris mutasi tidak ditemukan.')
    if (m.matchStatus === 'Cocok') throw new GalatAturan('Baris ini sudah dicocokkan. Lepas pencocokannya dulu.')
    if (m.bankReconcile && m.bankReconcile.status !== 'Draft') throw new GalatAturan('Baris ini masuk rekonsiliasi yang sudah Diposting.')
    await tx.bankStatementLine.delete({ where: { id } })
    await catatAudit(tx, k, { action: 'mutasi.hapus', docType: 'bank_statement_line', docId: id, summary: `Menghapus baris mutasi ${iso(m.date)} ${formatRupiah(m.debit || m.credit)} ${m.description.slice(0, 60)}`, before: { date: iso(m.date), description: m.description, debit: m.debit, credit: m.credit, balance: m.balance, batch: m.importBatch } })
    return m
  })
}

// --- Dokumen rekonsiliasi ---

const skemaTanggal = (label: string) =>
  z.string().transform((v, ctx) => {
    const t = v.trim()
    const d = new Date(`${t}T00:00:00Z`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t) || Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: 'custom', message: t ? `${label} bukan tanggal yang sah.` : `${label} wajib diisi.` })
      return z.NEVER
    }
    return d
  })
const uangBertanda = (label: string) =>
  z
    .string()
    .optional()
    .transform((v) => (v ?? '').trim())
    .transform((v, ctx) => {
      if (!v) return null
      const minus = v.startsWith('-')
      const r = skemaUang({ label, min: 0n, max: 100_000_000_000n }).safeParse(minus ? v.slice(1) : v)
      if (!r.success) {
        ctx.addIssue({ code: 'custom', message: r.error.issues[0].message })
        return z.NEVER
      }
      return minus ? -r.data : r.data
    })

export const skemaRekonsiliasi = z.object({
  bankAccountId: z.string().regex(/^\d+$/, 'Pilih rekening.').transform(Number),
  periodFrom: skemaTanggal('Tanggal awal'),
  periodTo: skemaTanggal('Tanggal akhir'),
  stmtOpening: uangBertanda('Saldo awal rekening koran'),
  stmtClosing: uangBertanda('Saldo akhir rekening koran'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})
export const skemaKepalaRekonsiliasi = skemaRekonsiliasi.omit({ bankAccountId: true, periodFrom: true })

// Rekonsiliasi Diposting terakhir sebuah rekening: saldo akhirnya menjadi saldo awal berikutnya.
export const rekonsiliasiTerakhir = (db: DbAtauTx, bankAccountId: number) => db.bankReconcile.findFirst({ where: { bankAccountId, status: 'Diposting' }, orderBy: { periodTo: 'desc' } })

// Usulan periode dan saldo untuk rekonsiliasi baru.
export async function usulanBaru(db: DbAtauTx, bankAccountId: number) {
  const akhir = await rekonsiliasiTerakhir(db, bankAccountId)
  const pertama = akhir ? null : await db.bankStatementLine.findFirst({ where: { bankAccountId, bankReconcileId: null }, orderBy: [{ date: 'asc' }, { id: 'asc' }] })
  const dari = akhir ? tambahHari(akhir.periodTo, 1) : (pertama?.date ?? null)
  const awal = akhir ? akhir.stmtClosing : pertama?.balance != null ? pertama.balance - netMutasi(pertama) : null
  const terakhir = await db.bankStatementLine.findFirst({ where: { bankAccountId, ...(dari ? { date: { gte: dari } } : {}) }, orderBy: [{ date: 'desc' }, { id: 'desc' }] })
  return { dari, sampai: terakhir?.date ?? null, saldoAwal: awal, terkunciAwal: !!akhir, akhir }
}

async function pastikanDraf(tx: Tx, id: number) {
  await tx.$executeRaw`SELECT id FROM bank_reconcile WHERE id = ${id} FOR UPDATE`
  const r = await tx.bankReconcile.findUnique({ where: { id } })
  if (!r) throw new GalatAturan('Rekonsiliasi tidak ditemukan.')
  if (r.status !== 'Draft') throw new GalatAturan(`Rekonsiliasi ${r.no} berstatus ${r.status}, jadi tidak bisa diubah.`)
  return r
}

// Memuat baris mutasi rekening dalam periode yang belum masuk rekonsiliasi mana pun.
async function muatMutasi(tx: Tx, r: { id: number; bankAccountId: number; periodFrom: Date; periodTo: Date }) {
  const lepas = await tx.bankStatementLine.updateMany({ where: { bankReconcileId: r.id, matchStatus: 'BelumCocok', OR: [{ date: { lt: r.periodFrom } }, { date: { gt: r.periodTo } }] }, data: { bankReconcileId: null } })
  const muat = await tx.bankStatementLine.updateMany({ where: { bankAccountId: r.bankAccountId, bankReconcileId: null, date: { gte: r.periodFrom, lte: r.periodTo } }, data: { bankReconcileId: r.id } })
  return { dimuat: muat.count, dilepas: lepas.count }
}

export async function buatRekonsiliasi(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaRekonsiliasi.parse(masukan)
  return db.$transaction(async (tx) => {
    const rek = await rekeningAktif(tx, d.bankAccountId)
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('rekonsiliasi'), ${rek.id})`
    if (await tx.bankReconcile.findFirst({ where: { bankAccountId: rek.id, status: 'Draft' } })) throw new GalatAturan('Rekening ini masih punya rekonsiliasi Draft. Selesaikan atau batalkan dulu.', 'bankAccountId')
    if (d.periodTo < d.periodFrom) throw new GalatAturan('Tanggal akhir tidak boleh sebelum tanggal awal.', 'periodTo')
    if (iso(d.periodTo) > tanggalIso(new Date())) throw new GalatAturan('Tanggal akhir tidak boleh di masa depan.', 'periodTo')
    const akhir = await rekonsiliasiTerakhir(tx, rek.id)
    let opening = d.stmtOpening
    if (akhir) {
      // Periode bersambung dan saldo awal = saldo akhir rekonsiliasi sebelumnya (RANCANGAN 7).
      if (iso(d.periodFrom) !== iso(tambahHari(akhir.periodTo, 1))) throw new GalatAturan(`Periode harus dimulai ${iso(tambahHari(akhir.periodTo, 1))}, sehari sesudah rekonsiliasi ${akhir.no}.`, 'periodFrom')
      if (opening !== null && opening !== akhir.stmtClosing) throw new GalatAturan(`Saldo awal harus sama dengan saldo akhir ${akhir.no} (${formatRupiah(akhir.stmtClosing)}).`, 'stmtOpening')
      opening = akhir.stmtClosing
    } else if (opening === null) throw new GalatAturan('Isi saldo awal rekening koran untuk rekonsiliasi pertama rekening ini.', 'stmtOpening')
    const no = await ambilNomor(tx, 'bank_reconcile', 'RK', d.periodTo)
    const r = await tx.bankReconcile.create({ data: { bankAccountId: rek.id, no, periodFrom: d.periodFrom, periodTo: d.periodTo, stmtOpening: opening, stmtClosing: d.stmtClosing ?? opening, note: d.note, createdBy: aktor.id, updatedBy: aktor.id } })
    const m = await muatMutasi(tx, r)
    if (d.stmtClosing === null) {
      // Saldo akhir bawaan: saldo baris mutasi terakhir di periode, atau saldo awal ditambah mutasi.
      const baris = await tx.bankStatementLine.findMany({ where: { bankReconcileId: r.id }, orderBy: [{ date: 'asc' }, { id: 'asc' }] })
      const akhirBaris = [...baris].reverse().find((b) => b.balance !== null)
      const closing = akhirBaris?.balance ?? opening + baris.reduce((n, b) => n + netMutasi(b), 0n)
      await tx.bankReconcile.update({ where: { id: r.id }, data: { stmtClosing: closing } })
    }
    await hitungRekonsiliasi(tx, r.id)
    await catatAudit(tx, k, {
      action: 'rekonsiliasi.tambah',
      docType: 'bank_reconcile',
      docId: r.id,
      summary: `Membuat rekonsiliasi ${no} ${namaRekening(rek)} periode ${iso(d.periodFrom)} sampai ${iso(d.periodTo)}, ${m.dimuat} baris mutasi`,
      after: { no, rekening: namaRekening(rek), periodFrom: d.periodFrom, periodTo: d.periodTo, stmtOpening: opening, mutasi: m.dimuat },
    })
    return r
  })
}

export async function ubahKepalaRekonsiliasi(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaKepalaRekonsiliasi.parse(masukan)
  return db.$transaction(async (tx) => {
    const r = await pastikanDraf(tx, id)
    if (d.periodTo < r.periodFrom) throw new GalatAturan('Tanggal akhir tidak boleh sebelum tanggal awal.', 'periodTo')
    if (iso(d.periodTo) > tanggalIso(new Date())) throw new GalatAturan('Tanggal akhir tidak boleh di masa depan.', 'periodTo')
    if (d.periodTo < r.periodTo && (await tx.bankStatementLine.count({ where: { bankReconcileId: id, matchStatus: 'Cocok', date: { gt: d.periodTo } } }))) {
      throw new GalatAturan('Ada mutasi sesudah tanggal akhir baru yang sudah dicocokkan. Lepas dulu pencocokannya.', 'periodTo')
    }
    const akhir = await rekonsiliasiTerakhir(tx, r.bankAccountId)
    const opening = akhir ? akhir.stmtClosing : (d.stmtOpening ?? r.stmtOpening)
    if (akhir && d.stmtOpening !== null && d.stmtOpening !== akhir.stmtClosing) throw new GalatAturan(`Saldo awal harus sama dengan saldo akhir ${akhir.no} (${formatRupiah(akhir.stmtClosing)}).`, 'stmtOpening')
    const sebelum = { periodTo: iso(r.periodTo), stmtOpening: r.stmtOpening.toString(), stmtClosing: r.stmtClosing.toString(), note: r.note }
    const sesudah = { periodTo: iso(d.periodTo), stmtOpening: opening.toString(), stmtClosing: (d.stmtClosing ?? r.stmtClosing).toString(), note: d.note }
    const m = await muatMutasi(tx, { ...r, periodTo: d.periodTo })
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah) && !m.dimuat && !m.dilepas) return 0
    await tx.bankReconcile.update({ where: { id }, data: { periodTo: d.periodTo, stmtOpening: opening, stmtClosing: d.stmtClosing ?? r.stmtClosing, note: d.note, updatedBy: aktor.id } })
    await hitungRekonsiliasi(tx, id)
    await catatAudit(tx, k, { action: 'rekonsiliasi.ubah', docType: 'bank_reconcile', docId: id, summary: `Mengubah kepala rekonsiliasi ${r.no}${m.dimuat ? `, ${m.dimuat} mutasi baru dimuat` : ''}`, before: sebelum, after: { ...sesudah, dimuat: m.dimuat, dilepas: m.dilepas } })
    return 1
  })
}

// --- Saldo buku, belum cair, dan selisih ---

type BarisCalon = { id: number; journalId: number; no: string; docNo: string; sourceType: string; sourceId: number | null; date: Date; memo: string; debit: bigint; credit: bigint; matchedLine: number | null; matchedDate: Date | null; reversed: boolean }

// Baris jurnal akun rekening ini sampai tanggal akhir. Baris yang ditandai rekening lain tidak ikut (rekening yang
// berbagi satu akun COA tetap terpisah lewat journal_line.bank_account_id).
async function barisBuku(tx: DbAtauTx, r: { bankAccountId: number; periodTo: Date }) {
  const akun = await akunRekening(tx, r.bankAccountId)
  return tx.$queryRaw<BarisCalon[]>`
    SELECT l.id, l.journal_id AS "journalId", j.no, j.doc_no AS "docNo", j.source_type AS "sourceType", j.source_id AS "sourceId", j.date, l.memo, l.debit, l.credit,
      m.bank_statement_line_id AS "matchedLine", s.date AS "matchedDate",
      (j.reversal_of_id IS NOT NULL OR EXISTS (SELECT 1 FROM journal b WHERE b.reversal_of_id = j.id AND b.posted_at IS NOT NULL AND b.date <= ${r.periodTo})) AS reversed
    FROM journal_line l JOIN journal j ON j.id = l.journal_id
    LEFT JOIN bank_reconcile_match m ON m.journal_line_id = l.id
    LEFT JOIN bank_statement_line s ON s.id = m.bank_statement_line_id
    WHERE l.account_id = ${akun} AND j.posted_at IS NOT NULL AND j.date <= ${r.periodTo}
      AND (l.bank_account_id IS NULL OR l.bank_account_id = ${r.bankAccountId})
    ORDER BY j.date, l.id`
}

// Tanggal awal rekonsiliasi pertama (belum Batal) rekening ini. Jurnal bank sebelum tanggal itu dianggap sudah termasuk
// saldo awal rekening koran pertama, kecuali dicocokkan dengan mutasi sesudahnya.
async function awalPertama(tx: DbAtauTx, bankAccountId: number) {
  const r = await tx.bankReconcile.findFirst({ where: { bankAccountId, status: { not: 'Batal' } }, orderBy: { periodFrom: 'asc' } })
  return r?.periodFrom ?? null
}

export async function hitungRekonsiliasi(tx: DbAtauTx, id: number, simpan = true) {
  const r = await tx.bankReconcile.findUniqueOrThrow({ where: { id } })
  const buku = await barisBuku(tx, r)
  const awal = (await awalPertama(tx, r.bankAccountId)) ?? r.periodFrom
  const saldoBuku = buku.reduce((n, l) => n + netJurnal(l), 0n)
  // Belum cair: jurnal bank sejak awal rekonsiliasi pertama yang belum dicocokkan dengan mutasi sampai tanggal akhir.
  const belum = buku.filter((l) => l.date >= awal && (!l.matchedDate || l.matchedDate > r.periodTo))
  const outstanding = belum.reduce((n, l) => n + netJurnal(l), 0n)
  const mutasi = await tx.bankStatementLine.findMany({ where: { bankReconcileId: id } })
  const netMut = mutasi.reduce((n, m) => n + netMutasi(m), 0n)
  const diff = r.stmtClosing - (saldoBuku - outstanding)
  if (simpan && r.status === 'Draft') await tx.bankReconcile.update({ where: { id }, data: { bookClosing: saldoBuku, outstanding, diff } })
  return {
    saldoBuku,
    outstanding,
    diff,
    belumCair: belum,
    mutasiMasuk: mutasi.reduce((n, m) => n + m.credit, 0n),
    mutasiKeluar: mutasi.reduce((n, m) => n + m.debit, 0n),
    selisihMutasi: r.stmtClosing - (r.stmtOpening + netMut),
    belumCocok: mutasi.filter((m) => m.matchStatus === 'BelumCocok').length,
    jumlahMutasi: mutasi.length,
  }
}

// --- Calon dan saran pencocokan ---

export async function calonJurnal(tx: DbAtauTx, r: { id: number; bankAccountId: number; periodTo: Date }) {
  const buku = await barisBuku(tx, r)
  // Pasangan jurnal dan jurnal baliknya yang sama-sama belum cair tidak perlu dicocokkan.
  return buku.filter((l) => !l.matchedLine && !l.reversed)
}

export type Saran = { mutasiId: number; journalLineId: number; alasan: 'referensi' | 'nominal' }

const normal = (t: string) => t.toUpperCase().replace(/[^A-Z0-9]/g, '')

// Saran: nominal sama dan tanggal paling jauh 3 hari, atau referensi sama (nomor dokumen atau nomor jurnal muncul di
// referensi atau keterangan mutasi). Satu baris jurnal hanya disarankan untuk satu mutasi; referensi didahulukan, lalu
// selisih tanggal terkecil.
export async function saranCocok(tx: DbAtauTx, id: number): Promise<Saran[]> {
  const r = await tx.bankReconcile.findUniqueOrThrow({ where: { id } })
  const calon = await calonJurnal(tx, r)
  const mutasi = await tx.bankStatementLine.findMany({ where: { bankReconcileId: id, matchStatus: 'BelumCocok' }, orderBy: [{ date: 'asc' }, { id: 'asc' }] })
  const pakai = new Set<number>()
  const hasil: Saran[] = []
  const pasangan: { m: (typeof mutasi)[number]; l: BarisCalon; skor: number; alasan: Saran['alasan'] }[] = []
  for (const m of mutasi) {
    const net = netMutasi(m)
    const teks = normal(`${m.ref} ${m.description}`)
    for (const l of calon) {
      const ref = [l.docNo, l.no].map(normal).some((x) => x.length >= 6 && teks.includes(x))
      const hari = Math.abs(m.date.getTime() - new Date(l.date).getTime()) / HARI
      if (netJurnal(l) !== net) continue
      if (ref) pasangan.push({ m, l, skor: hari, alasan: 'referensi' })
      else if (hari <= JARAK_SARAN_HARI) pasangan.push({ m, l, skor: 100 + hari, alasan: 'nominal' })
    }
  }
  pasangan.sort((a, b) => a.skor - b.skor || a.m.id - b.m.id || a.l.id - b.l.id)
  const mutasiPakai = new Set<number>()
  for (const p of pasangan) {
    if (pakai.has(p.l.id) || mutasiPakai.has(p.m.id)) continue
    pakai.add(p.l.id)
    mutasiPakai.add(p.m.id)
    hasil.push({ mutasiId: p.m.id, journalLineId: p.l.id, alasan: p.alasan })
  }
  return hasil
}

// --- Cocokkan dan lepas ---

async function cocokTx(tx: Tx, k: Konteks, aktor: Aktor, id: number, mutasiId: number, journalLineIds: number[], sumber: string) {
  const r = await pastikanDraf(tx, id)
  const m = await tx.bankStatementLine.findUnique({ where: { id: mutasiId } })
  if (!m || m.bankReconcileId !== id) throw new GalatAturan('Baris mutasi tidak ada di rekonsiliasi ini.')
  if (m.matchStatus === 'Cocok') throw new GalatAturan('Baris mutasi ini sudah dicocokkan.')
  const ids = [...new Set(journalLineIds)]
  if (!ids.length) throw new GalatAturan('Pilih minimal satu baris jurnal.', 'jl')
  const calon = new Map((await calonJurnal(tx, r)).map((l) => [l.id, l]))
  const pilih = ids.map((x) => calon.get(x))
  if (pilih.some((x) => !x)) throw new GalatAturan('Baris jurnal yang dipilih tidak lagi tersedia untuk dicocokkan. Muat ulang halaman.', 'jl')
  const jumlah = pilih.reduce((n, l) => n + netJurnal(l!), 0n)
  if (jumlah !== netMutasi(m)) throw new GalatAturan(`Jumlah jurnal yang dipilih ${formatRupiah(jumlah)} tidak sama dengan mutasi ${formatRupiah(netMutasi(m))}.`, 'jl')
  for (const l of pilih) {
    await tx.bankReconcileMatch.create({ data: { bankStatementLineId: m.id, journalLineId: l!.id, amount: netJurnal(l!), matchedBy: aktor.id } })
    await tx.journalLine.update({ where: { id: l!.id }, data: { clearedAt: m.date } })
  }
  await tx.bankStatementLine.update({ where: { id: m.id }, data: { matchStatus: 'Cocok' } })
  await catatAudit(tx, k, {
    action: 'rekonsiliasi.cocok',
    docType: 'bank_reconcile',
    docId: id,
    summary: `Mencocokkan mutasi ${iso(m.date)} ${formatRupiah(netMutasi(m))} di ${r.no} dengan ${pilih.map((l) => l!.no).join(', ')}${sumber ? ` (${sumber})` : ''}`,
    after: { mutasiId: m.id, jurnal: pilih.map((l) => ({ lineId: l!.id, no: l!.no, docNo: l!.docNo, nilai: netJurnal(l!) })) },
  })
}

export async function cocokkan(db: Db, k: Konteks, aktor: Aktor, id: number, mutasiId: number, journalLineIds: number[]) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    await cocokTx(tx, k, aktor, id, mutasiId, journalLineIds, 'manual')
    await hitungRekonsiliasi(tx, id)
  })
}

export async function terapkanSaran(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    await pastikanDraf(tx, id)
    const s = await saranCocok(tx, id)
    for (const x of s) await cocokTx(tx, k, aktor, id, x.mutasiId, [x.journalLineId], `saran ${x.alasan}`)
    await hitungRekonsiliasi(tx, id)
    return s.length
  })
}

async function lepasTx(tx: Tx, mutasiId: number) {
  const m = await tx.bankReconcileMatch.findMany({ where: { bankStatementLineId: mutasiId } })
  if (m.length) {
    await tx.journalLine.updateMany({ where: { id: { in: m.map((x) => x.journalLineId) } }, data: { clearedAt: null } })
    await tx.bankReconcileMatch.deleteMany({ where: { bankStatementLineId: mutasiId } })
  }
  await tx.bankStatementLine.update({ where: { id: mutasiId }, data: { matchStatus: 'BelumCocok' } })
  return m
}

export async function lepasCocok(db: Db, k: Konteks, aktor: Aktor, id: number, mutasiId: number) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const r = await pastikanDraf(tx, id)
    const mu = await tx.bankStatementLine.findUnique({ where: { id: mutasiId } })
    if (!mu || mu.bankReconcileId !== id) throw new GalatAturan('Baris mutasi tidak ada di rekonsiliasi ini.')
    const m = await lepasTx(tx, mutasiId)
    await hitungRekonsiliasi(tx, id)
    await catatAudit(tx, k, { action: 'rekonsiliasi.lepas', docType: 'bank_reconcile', docId: id, summary: `Melepas pencocokan mutasi ${iso(mu.date)} ${formatRupiah(netMutasi(mu))} di ${r.no}`, before: { mutasiId, jurnalLine: m.map((x) => x.journalLineId) } })
  })
}

// --- Transaksi kas dari baris mutasi (biaya admin, bunga, pajak bunga) ---

export const skemaKasMutasi = z.object({
  accountId: z.string().regex(/^\d+$/, 'Pilih akun.').transform(Number),
  memo: z.string().trim().max(120, 'Keterangan paling panjang 120 huruf.').default(''),
})

export async function kasDariBarisMutasi(db: Db, k: Konteks, aktor: Aktor, id: number, mutasiId: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaKasMutasi.parse(masukan)
  return db.$transaction(async (tx) => {
    const r = await pastikanDraf(tx, id)
    const m = await tx.bankStatementLine.findUnique({ where: { id: mutasiId } })
    if (!m || m.bankReconcileId !== id) throw new GalatAturan('Baris mutasi tidak ada di rekonsiliasi ini.')
    if (m.matchStatus === 'Cocok') throw new GalatAturan('Baris mutasi ini sudah dicocokkan.')
    const keluar = m.debit > 0n
    const kas = await kasDariMutasi(tx, k, aktor, { kind: keluar ? 'keluar' : 'masuk', date: m.date, bankAccountId: r.bankAccountId, accountId: d.accountId, amount: keluar ? m.debit : m.credit, memo: d.memo || m.description })
    await cocokTx(tx, k, aktor, id, m.id, [kas.journalLineId], `dari ${kas.no}`)
    await hitungRekonsiliasi(tx, id)
    return kas
  })
}

// --- Posting, batal, hapus ---

export async function postingRekonsiliasi(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'P')
  return db.$transaction(async (tx) => {
    const r = await pastikanDraf(tx, id)
    const akhir = await rekonsiliasiTerakhir(tx, r.bankAccountId)
    if (akhir && iso(r.periodFrom) !== iso(tambahHari(akhir.periodTo, 1))) throw new GalatAturan(`Periode harus dimulai sehari sesudah ${akhir.no}.`)
    if (akhir && r.stmtOpening !== akhir.stmtClosing) throw new GalatAturan(`Saldo awal harus sama dengan saldo akhir ${akhir.no} (${formatRupiah(akhir.stmtClosing)}).`)
    const h = await hitungRekonsiliasi(tx, id)
    if (!h.jumlahMutasi) throw new GalatAturan('Belum ada baris mutasi di periode ini. Impor mutasinya dulu.')
    if (h.belumCocok) throw new GalatAturan(`Masih ada ${h.belumCocok} baris mutasi yang belum dicocokkan.`)
    if (h.selisihMutasi !== 0n) throw new GalatAturan(`Saldo awal ditambah mutasi tidak sama dengan saldo akhir rekening koran (beda ${formatRupiah(h.selisihMutasi)}). Periksa apakah ada mutasi yang belum diimpor.`)
    if (h.diff !== 0n) throw new GalatAturan(`Selisih rekonsiliasi ${formatRupiah(h.diff)}. Diposting hanya bila selisihnya 0.`)
    const sekarang = new Date()
    await tx.bankReconcile.update({ where: { id }, data: { status: 'Diposting', postedBy: aktor.id, postedAt: sekarang, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'rekonsiliasi.posting',
      docType: 'bank_reconcile',
      docId: id,
      summary: `Memposting rekonsiliasi ${r.no}: saldo rekening koran ${formatRupiah(r.stmtClosing)}, saldo buku ${formatRupiah(h.saldoBuku)}, belum cair ${formatRupiah(h.outstanding)}, ${h.jumlahMutasi} mutasi cocok`,
      before: { status: 'Draft' },
      after: { status: 'Diposting', stmtClosing: r.stmtClosing, bookClosing: h.saldoBuku, outstanding: h.outstanding, mutasi: h.jumlahMutasi },
    })
  })
}

// Melepas semua pencocokan dan baris mutasi dari rekonsiliasi (untuk batal dan hapus draf).
async function lepasSemua(tx: Tx, id: number) {
  const mutasi = await tx.bankStatementLine.findMany({ where: { bankReconcileId: id }, select: { id: true } })
  let n = 0
  for (const m of mutasi) n += (await lepasTx(tx, m.id)).length
  await tx.bankStatementLine.updateMany({ where: { bankReconcileId: id }, data: { bankReconcileId: null } })
  return { mutasi: mutasi.length, cocok: n }
}

export async function batalRekonsiliasi(db: Db, k: Konteks, aktor: Aktor, id: number, alasan: string) {
  const a = alasan.trim()
  if (a.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM bank_reconcile WHERE id = ${id} FOR UPDATE`
    const r = await tx.bankReconcile.findUnique({ where: { id } })
    if (!r) throw new GalatAturan('Rekonsiliasi tidak ditemukan.')
    if (r.status === 'Batal') throw new GalatAturan('Rekonsiliasi ini sudah Batal.')
    if (r.status === 'Diposting') {
      // Membuka kunci baris jurnal (RANCANGAN 7). Hanya rekonsiliasi terakhir rekening itu, supaya saldo awal
      // rekonsiliasi sesudahnya tetap benar.
      pastikanIzin(aktor, MENU, 'P')
      if (a.length < 5) throw new GalatAturan('Tulis alasan pembatalan, minimal 5 huruf.', 'alasan')
      const sesudah = await tx.bankReconcile.findFirst({ where: { bankAccountId: r.bankAccountId, status: { not: 'Batal' }, periodFrom: { gt: r.periodTo } } })
      if (sesudah) throw new GalatAturan(`Batalkan dulu rekonsiliasi sesudahnya (${sesudah.no}).`)
    } else pastikanIzin(aktor, MENU, 'U')
    const l = await lepasSemua(tx, id)
    await tx.bankReconcile.update({ where: { id }, data: { status: 'Batal', cancelledBy: aktor.id, cancelledAt: new Date(), cancelReason: a || null, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'rekonsiliasi.batal', docType: 'bank_reconcile', docId: id, summary: `Membatalkan rekonsiliasi ${r.no} (${r.status}), ${l.cocok} pencocokan dilepas${a ? `. Alasan: ${a}` : ''}`, before: { status: r.status }, after: { status: 'Batal', ...l } })
    return r.status
  })
}

export async function hapusRekonsiliasi(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'H')
  return db.$transaction(async (tx) => {
    const r = await pastikanDraf(tx, id)
    const l = await lepasSemua(tx, id)
    await tx.bankReconcile.delete({ where: { id } })
    await catatAudit(tx, k, { action: 'rekonsiliasi.hapus', docType: 'bank_reconcile', docId: id, summary: `Menghapus draf rekonsiliasi ${r.no}, ${l.cocok} pencocokan dilepas`, before: { no: r.no, status: r.status } })
  })
}

export async function muatUlangMutasi(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const r = await pastikanDraf(tx, id)
    const m = await muatMutasi(tx, r)
    await hitungRekonsiliasi(tx, id)
    if (m.dimuat || m.dilepas) await catatAudit(tx, k, { action: 'rekonsiliasi.ubah', docType: 'bank_reconcile', docId: id, summary: `Memuat ulang mutasi ${r.no}: ${m.dimuat} dimuat`, after: m })
    return m.dimuat
  })
}

// --- Daftar dan rincian ---

export async function daftarRekonsiliasi(db: Db, s: { rekening?: string; status?: string; hal?: string }) {
  const rek = s.rekening && /^\d+$/.test(s.rekening) ? Number(s.rekening) : undefined
  const status = ['Draft', 'Diposting', 'Batal'].includes(s.status ?? '') ? (s.status as DocStatus) : undefined
  const where = { ...(rek ? { bankAccountId: rek } : {}), ...(status ? { status } : {}) }
  const hal = sesuaiHalaman(s.hal)
  const [baris, total] = await Promise.all([
    db.bankReconcile.findMany({ where, include: { bankAccount: true, _count: { select: { bankStatementLines: true } } }, orderBy: [{ periodTo: 'desc' }, { id: 'desc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.bankReconcile.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

// Mutasi per rekening yang belum masuk rekonsiliasi, untuk halaman daftar.
export async function mutasiTerbuka(db: DbAtauTx) {
  const r = await db.bankStatementLine.groupBy({ by: ['bankAccountId'], where: { bankReconcileId: null }, _count: true, _min: { date: true }, _max: { date: true } })
  return r.map((x) => ({ bankAccountId: x.bankAccountId, jumlah: x._count, dari: x._min.date, sampai: x._max.date }))
}

export async function rincianRekonsiliasi(db: DbAtauTx, id: number) {
  const r = await db.bankReconcile.findUnique({ where: { id }, include: { bankAccount: true } })
  if (!r) return null
  const mutasi = await db.bankStatementLine.findMany({
    where: { bankReconcileId: id },
    include: { bankReconcileMatches: { include: { journalLine: { include: { journal: { select: { id: true, no: true, docNo: true, sourceType: true, sourceId: true, date: true } } } } } } },
    orderBy: [{ date: 'asc' }, { id: 'asc' }],
  })
  const h = await hitungRekonsiliasi(db, id, false)
  const draf = r.status === 'Draft'
  const calon = draf ? await calonJurnal(db, r) : []
  const saran = draf ? await saranCocok(db, id) : []
  return { r, mutasi, h, calon, saran }
}
