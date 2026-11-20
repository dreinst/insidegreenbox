// Setoran POS (tahap 5A, RANCANGAN 6.2): satu dokumen per tanggal per metode bayar, berisi shift yang sudah ditutup
// dan belum disetor untuk metode itu. Dokumen pelaksana: Draft -> Diposting, atau Draft -> Diajukan -> Diposting bila
// butuh Owner. Jurnal belum dibuat (tahap 5 akuntansi, KONTRAK 11); dibentuk ulang dari dokumen Diposting.
// Tanggal shift = tanggal WIB saat shift dibuka. Tanpa Next, dipanggil aksi server dan tes.
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { GalatAturan } from './aksi'
import { catatAudit, type Konteks } from './audit'
import type { Db, DbAtauTx, Tx } from './db'
import { perluPersetujuan, persen, rupiah } from './hitung-kasir'
import { pastikanIzin, punyaIzin, saklarNyala, type Pengguna } from './izin-inti'
import { PER_HALAMAN, sesuaiHalaman } from './master'
import { ambilNomor } from './nomor'
import { transisiSah, type StatusDokumen } from './status'
import { akhirHari, awalHari, tanggalIso } from './waktu'

type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar' | 'peran'>
const MENU = 'kasir.setoran'
const BATAS_UANG = 1_000_000_000

// Shift yang dianggap sudah ditutup untuk setoran. "Perlu persetujuan" boleh masuk, tetapi setorannya butuh Owner.
const STATUS_TUTUP = ['Tutup', 'PerluPersetujuan'] as const

const tanggalSah = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s
// Kolom date disimpan sebagai tengah malam UTC.
export const keKolomTanggal = (iso: string) => new Date(`${iso}T00:00:00Z`)
export const dariKolomTanggal = (d: Date) => d.toISOString().slice(0, 10)

export const skemaBuat = z.object({
  tanggal: z
    .string()
    .trim()
    .refine(tanggalSah, 'Pilih tanggal yang sah.')
    .refine((t) => t <= tanggalIso(new Date()), 'Tanggal setoran tidak boleh di masa depan.'),
})

// Metode tunai yang memegang setoran laci: metode berjenis tunai dengan id terkecil (yang aktif lebih dulu).
// Uang laci satu wadah, jadi setoran tunai hanya dibuat untuk satu metode ini.
export async function metodeTunaiUtama(db: DbAtauTx) {
  return (
    (await db.paymentMethod.findFirst({ where: { kind: 'tunai', active: true }, orderBy: { id: 'asc' } })) ??
    (await db.paymentMethod.findFirst({ where: { kind: 'tunai' }, orderBy: { id: 'asc' } }))
  )
}

// Shift yang dibuka pada tanggal WIB tertentu.
export const syaratShiftTanggal = (iso: string): Prisma.ShiftWhereInput => ({ openedAt: { gte: awalHari(iso), lte: akhirHari(iso) } })

type ShiftNilai = { id: number; openCash: bigint; countedCash: bigint | null; status: string }

// Nilai menurut sistem per shift untuk satu metode. Tunai: kas dihitung dikurangi modal yang ditinggal di laci untuk
// shift berikutnya (RANCANGAN 6.2 dan 11.2 butir 4). Non tunai: jumlah sale_payment metode itu dari penjualan
// yang tidak void.
export async function nilaiSistem(db: DbAtauTx, shifts: ShiftNilai[], metode: { id: number; kind: string }) {
  const hasil = new Map<number, number>()
  if (!shifts.length) return hasil
  if (metode.kind === 'tunai') {
    for (const s of shifts) hasil.set(s.id, Number(s.countedCash ?? 0) - Number(s.openCash))
    return hasil
  }
  const per = await db.salePayment.groupBy({
    by: ['saleId'],
    _sum: { amount: true },
    where: { paymentMethodId: metode.id, sale: { status: 'Selesai', shiftId: { in: shifts.map((s) => s.id) } } },
  })
  // groupBy per saleId lalu dijumlah per shift, karena groupBy Prisma tidak bisa mengelompokkan lewat relasi.
  const jual = await db.sale.findMany({ where: { id: { in: per.map((p) => p.saleId) } }, select: { id: true, shiftId: true } })
  const shiftDari = new Map(jual.map((j) => [j.id, j.shiftId]))
  for (const p of per) {
    const sid = shiftDari.get(p.saleId)!
    hasil.set(sid, (hasil.get(sid) ?? 0) + Number(p._sum.amount ?? 0))
  }
  return hasil
}

// Shift tanggal itu yang sudah ditutup, belum masuk setoran aktif untuk metode itu (selain setoran kecuali), beserta
// nilainya. Non tunai hanya shift yang punya penjualan metode itu.
export async function calonBaris(db: DbAtauTx, iso: string, metode: { id: number; kind: string }, kecuali?: number) {
  const shifts = await db.shift.findMany({
    where: {
      ...syaratShiftTanggal(iso),
      status: { in: [...STATUS_TUTUP] },
      posSettlementLines: { none: { paymentMethodId: metode.id, cancelled: false, ...(kecuali ? { NOT: { posSettlementId: kecuali } } : {}) } },
    },
    orderBy: { id: 'asc' },
    select: { id: true, openCash: true, countedCash: true, status: true },
  })
  const nilai = await nilaiSistem(db, shifts, metode)
  return shifts.filter((s) => metode.kind === 'tunai' || (nilai.get(s.id) ?? 0) !== 0).map((s) => ({ shiftId: s.id, expected: nilai.get(s.id) ?? 0 }))
}

// MDR bawaan per baris: persen MDR metode dikali nilai sistem, dibulatkan ke rupiah. Tunai selalu 0.
const mdrBaris = (expected: number, mdrPct: number) => (expected > 0 ? persen(expected, mdrPct) : 0)

type Kepala = { id: number; mdrFee: bigint }

// Menghitung ulang total kepala dari baris. Selisih = disetor + MDR - sistem (RANCANGAN 6.2: dana kurang di luar MDR).
async function hitungUlang(tx: Tx, setoranId: number, mdrFee: bigint) {
  const t = await tx.posSettlementLine.aggregate({ where: { posSettlementId: setoranId }, _sum: { expected: true, actual: true } })
  const expectedTotal = t._sum.expected ?? 0n
  const actualTotal = t._sum.actual ?? 0n
  return tx.posSettlement.update({ where: { id: setoranId }, data: { expectedTotal, actualTotal, mdrFee, diff: actualTotal + mdrFee - expectedTotal } })
}

// Menambah baris shift yang belum ada dan memperbarui nilai sistem baris yang sudah ada (nilai disetor tidak diubah).
// MDR kepala ikut ditambah sebesar MDR bawaan baris baru.
async function segarkanBaris(tx: Tx, st: Kepala & { date: Date; paymentMethod: { id: number; kind: string; mdrPct: Prisma.Decimal } }) {
  const iso = dariKolomTanggal(st.date)
  const pct = Number(st.paymentMethod.mdrPct)
  const calon = await calonBaris(tx, iso, st.paymentMethod, st.id)
  const lama = await tx.posSettlementLine.findMany({ where: { posSettlementId: st.id } })
  const perShift = new Map(lama.map((l) => [l.shiftId, l]))
  let tambahMdr = 0
  const baru: number[] = []
  const berubah: number[] = []
  for (const c of calon) {
    const ada = perShift.get(c.shiftId)
    if (ada) {
      if (Number(ada.expected) !== c.expected) {
        await tx.posSettlementLine.update({ where: { id: ada.id }, data: { expected: BigInt(c.expected), diff: ada.actual - BigInt(c.expected) } })
        berubah.push(c.shiftId)
      }
      continue
    }
    const mdr = mdrBaris(c.expected, pct)
    tambahMdr += mdr
    const actual = c.expected - mdr
    await tx.posSettlementLine.create({ data: { posSettlementId: st.id, shiftId: c.shiftId, paymentMethodId: st.paymentMethod.id, expected: BigInt(c.expected), actual: BigInt(actual), diff: BigInt(actual - c.expected) } })
    baru.push(c.shiftId)
  }
  const kepala = await hitungUlang(tx, st.id, st.mdrFee + BigInt(tambahMdr))
  return { kepala, baru, berubah }
}

const kunciTanggal = (tx: Tx, iso: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`setoran:${iso}`}))`

// Rekening bawaan: rekening setoran terakhir metode itu yang masih aktif, lalu rekening aktif pertama untuk non tunai.
// Tunai boleh tanpa rekening (disimpan di Kas Besar). Kolom akun tujuan di metode bayar menunjuk COA yang baru ada
// di modul akuntansi, jadi belum dipakai (KONTRAK 11).
async function rekeningBawaan(tx: Tx, metode: { id: number; kind: string }) {
  const lalu = await tx.posSettlement.findFirst({ where: { paymentMethodId: metode.id, bankAccountId: { not: null }, bankAccount: { active: true } }, orderBy: { id: 'desc' }, select: { bankAccountId: true } })
  if (lalu) return lalu.bankAccountId
  if (metode.kind === 'tunai') return null
  return (await tx.bankAccount.findFirst({ where: { active: true }, orderBy: { id: 'asc' }, select: { id: true } }))?.id ?? null
}

export type HasilBuat = { dibuat: { id: number; no: string; metode: string }[]; diperbarui: { id: number; no: string; metode: string; baru: number }[]; dilewati: { no: string; metode: string; status: string }[] }

// Tombol "Buat setoran hari ini": untuk tiap metode yang punya shift ditutup dan belum disetor pada tanggal itu,
// membuat Draft baru, atau menambah baris ke Draft yang sudah ada. Setoran yang sudah diajukan atau diposting
// dilewati dan dilaporkan.
export async function buatSetoranHarian(db: Db, k: Konteks, aktor: Aktor, masukan: unknown): Promise<HasilBuat> {
  pastikanIzin(aktor, MENU, 'T')
  const { tanggal } = skemaBuat.parse(masukan)
  return db.$transaction(async (tx) => {
    await kunciTanggal(tx, tanggal)
    const tunai = await metodeTunaiUtama(tx)
    const nonTunai = await tx.paymentMethod.findMany({ where: { kind: { not: 'tunai' } }, orderBy: { id: 'asc' } })
    const daftar = [...(tunai ? [tunai] : []), ...nonTunai]
    const hasil: HasilBuat = { dibuat: [], diperbarui: [], dilewati: [] }
    for (const m of daftar) {
      const ada = await tx.posSettlement.findFirst({ where: { date: keKolomTanggal(tanggal), paymentMethodId: m.id, status: { not: 'Batal' } } })
      if (ada) {
        if (ada.status !== 'Draft') {
          if ((await calonBaris(tx, tanggal, m, ada.id)).length) hasil.dilewati.push({ no: ada.no, metode: m.name, status: ada.status })
          continue
        }
        const s = await segarkanBaris(tx, { ...ada, paymentMethod: m })
        if (s.baru.length || s.berubah.length) {
          await tx.posSettlement.update({ where: { id: ada.id }, data: { updatedBy: aktor.id } })
          await catatAudit(tx, k, {
            action: 'setoran.ubah',
            docType: 'pos_settlement',
            docId: ada.id,
            summary: `Memuat ulang baris setoran ${ada.no}: ${s.baru.length} shift baru`,
            before: { expectedTotal: ada.expectedTotal, actualTotal: ada.actualTotal, mdrFee: ada.mdrFee },
            after: { expectedTotal: s.kepala.expectedTotal, actualTotal: s.kepala.actualTotal, mdrFee: s.kepala.mdrFee, shiftBaru: s.baru, shiftBerubah: s.berubah },
          })
          hasil.diperbarui.push({ id: ada.id, no: ada.no, metode: m.name, baru: s.baru.length })
        }
        continue
      }
      const calon = await calonBaris(tx, tanggal, m)
      if (!calon.length) continue
      const no = await ambilNomor(tx, 'pos_settlement', 'ST', awalHari(tanggal))
      const st = await tx.posSettlement.create({
        data: { no, date: keKolomTanggal(tanggal), paymentMethodId: m.id, bankAccountId: await rekeningBawaan(tx, m), createdBy: aktor.id, updatedBy: aktor.id },
      })
      const s = await segarkanBaris(tx, { ...st, paymentMethod: m })
      await catatAudit(tx, k, {
        action: 'setoran.tambah',
        docType: 'pos_settlement',
        docId: st.id,
        summary: `Membuat setoran ${no} ${m.name} tanggal ${tanggal}: ${s.baru.length} shift, sistem ${rupiah(s.kepala.expectedTotal)}`,
        after: { no, date: tanggal, paymentMethodId: m.id, bankAccountId: st.bankAccountId, shift: s.baru, expectedTotal: s.kepala.expectedTotal, actualTotal: s.kepala.actualTotal, mdrFee: s.kepala.mdrFee },
      })
      hasil.dibuat.push({ id: st.id, no, metode: m.name })
    }
    if (!hasil.dibuat.length && !hasil.diperbarui.length) {
      throw new GalatAturan(
        hasil.dilewati.length
          ? `Ada shift ditutup yang belum disetor, tetapi setoran ${hasil.dilewati.map((d) => `${d.no} (${d.metode})`).join(', ')} sudah ${hasil.dilewati[0].status === 'Diposting' ? 'diposting' : 'diajukan'}. Kembalikan atau batalkan dulu setoran itu.`
          : `Tidak ada shift ditutup yang belum disetor pada tanggal ${tanggal}.`,
        'tanggal',
      )
    }
    return hasil
  })
}

// Mengunci baris kepala setoran sampai transaksi selesai, lalu memuatnya bersama metode dan barisnya.
async function kunciSetoran(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM pos_settlement WHERE id = ${id} FOR UPDATE`
  const st = await tx.posSettlement.findUnique({ where: { id }, include: { paymentMethod: true, posSettlementLines: { include: { shift: { select: { id: true, status: true } } }, orderBy: { shiftId: 'asc' } } } })
  if (!st) throw new GalatAturan('Setoran tidak ditemukan.')
  return st
}

const uangIsian = (pesan: string, opsi: { negatif?: boolean } = {}) =>
  z.preprocess(
    (v) => String(v ?? '').trim(),
    z
      .string()
      .min(1, pesan)
      .transform((t, ctx) => {
        const minus = opsi.negatif && t.startsWith('-')
        const angka = t.replace(/[^\d]/g, '')
        if (!angka) {
          ctx.addIssue({ code: 'custom', message: pesan })
          return z.NEVER
        }
        const n = Number(angka) * (minus ? -1 : 1)
        if (Math.abs(n) > BATAS_UANG) {
          ctx.addIssue({ code: 'custom', message: 'Nilai terlalu besar.' })
          return z.NEVER
        }
        return n
      }),
  )

export const skemaUbah = z.object({
  bankAccountId: z.preprocess((v) => (v === '' || v === undefined || v === null ? null : v), z.coerce.number().int().positive().nullable()),
  mdrFee: uangIsian('Isi biaya MDR, boleh 0.'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

// Nilai disetor dan catatan per baris dibaca dari isian actual_<id baris> dan catatan_<id baris>.
function bacaBaris(masukan: Record<string, unknown>, ids: number[]) {
  const galat: Record<string, string> = {}
  const hasil = new Map<number, { actual: number; note: string }>()
  for (const id of ids) {
    const a = uangIsian('Isi nilai disetor.', { negatif: true }).safeParse(masukan[`actual_${id}`])
    const c = z.string().trim().max(120, 'Catatan baris paling panjang 120 huruf.').safeParse(String(masukan[`catatan_${id}`] ?? ''))
    if (!a.success) galat[`actual_${id}`] = a.error.issues[0].message
    if (!c.success) galat[`catatan_${id}`] = c.error.issues[0].message
    if (a.success && c.success) hasil.set(id, { actual: a.data, note: c.data })
  }
  const kunci = Object.keys(galat)
  if (kunci.length) throw new GalatAturan(galat[kunci[0]], kunci[0])
  return hasil
}

// Ubah kepala dan baris setoran Draft. bukti: undefined artinya tidak berubah, null artinya dihapus.
export async function ubahSetoran(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>, bukti?: string | null) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaUbah.parse(masukan)
  return db.$transaction(async (tx) => {
    const st = await kunciSetoran(tx, id)
    if (st.status !== 'Draft') throw new GalatAturan('Setoran hanya bisa diubah saat masih Draft.')
    if (d.bankAccountId !== null && d.bankAccountId !== st.bankAccountId) {
      const r = await tx.bankAccount.findUnique({ where: { id: d.bankAccountId } })
      if (!r || !r.active) throw new GalatAturan('Rekening tujuan tidak ditemukan atau sudah nonaktif.', 'bankAccountId')
    }
    const baris = bacaBaris(masukan, st.posSettlementLines.map((l) => l.id))
    const sebelum: Record<string, unknown> = {}
    const sesudah: Record<string, unknown> = {}
    for (const l of st.posSettlementLines) {
      const b = baris.get(l.id)!
      if (Number(l.actual) === b.actual && l.note === b.note) continue
      await tx.posSettlementLine.update({ where: { id: l.id }, data: { actual: BigInt(b.actual), diff: BigInt(b.actual) - l.expected, note: b.note } })
      sebelum[`shift_${l.shiftId}`] = { actual: l.actual, note: l.note }
      sesudah[`shift_${l.shiftId}`] = { actual: b.actual, note: b.note }
    }
    const kepala: Prisma.PosSettlementUpdateInput = {}
    if (d.bankAccountId !== st.bankAccountId) {
      kepala.bankAccount = d.bankAccountId ? { connect: { id: d.bankAccountId } } : { disconnect: true }
      sebelum.bankAccountId = st.bankAccountId
      sesudah.bankAccountId = d.bankAccountId
    }
    if (d.note !== st.note) {
      kepala.note = d.note
      sebelum.note = st.note
      sesudah.note = d.note
    }
    if (bukti !== undefined && bukti !== st.proofFile) {
      kepala.proofFile = bukti
      sebelum.proofFile = st.proofFile
      sesudah.proofFile = bukti
    }
    if (BigInt(d.mdrFee) !== st.mdrFee) {
      sebelum.mdrFee = st.mdrFee
      sesudah.mdrFee = d.mdrFee
    }
    if (!Object.keys(sesudah).length) return { st, berubah: 0, buktiLama: null }
    await tx.posSettlement.update({ where: { id }, data: { ...kepala, updatedBy: aktor.id } })
    const baru = await hitungUlang(tx, id, BigInt(d.mdrFee))
    sesudah.diff = baru.diff
    await catatAudit(tx, k, { action: 'setoran.ubah', docType: 'pos_settlement', docId: id, summary: `Mengubah setoran ${st.no}: disetor ${rupiah(baru.actualTotal)}, MDR ${rupiah(baru.mdrFee)}, selisih ${rupiah(baru.diff)}`, before: sebelum, after: sesudah })
    return { st: baru, berubah: Object.keys(sesudah).length, buktiLama: bukti !== undefined && bukti !== st.proofFile ? st.proofFile : null }
  })
}

export async function muatUlangSetoran(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const st = await kunciSetoran(tx, id)
    if (st.status !== 'Draft') throw new GalatAturan('Baris hanya bisa dimuat ulang saat setoran masih Draft.')
    await kunciTanggal(tx, dariKolomTanggal(st.date))
    const s = await segarkanBaris(tx, st)
    if (!s.baru.length && !s.berubah.length) return { baru: 0 }
    await tx.posSettlement.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'setoran.ubah',
      docType: 'pos_settlement',
      docId: id,
      summary: `Memuat ulang baris setoran ${st.no}: ${s.baru.length} shift baru`,
      before: { expectedTotal: st.expectedTotal, actualTotal: st.actualTotal, mdrFee: st.mdrFee },
      after: { expectedTotal: s.kepala.expectedTotal, actualTotal: s.kepala.actualTotal, mdrFee: s.kepala.mdrFee, shiftBaru: s.baru, shiftBerubah: s.berubah },
    })
    return { baru: s.baru.length }
  })
}

type SetoranTerkunci = Awaited<ReturnType<typeof kunciSetoran>>

// Alasan setoran butuh Owner: selisih di atas batas saklar pos.batas_selisih_kas milik peran pelaku (aturan sama
// dengan tutup shift), atau ada shift yang masih "Perlu persetujuan".
export function alasanButuhOwner(st: Pick<SetoranTerkunci, 'diff'> & { posSettlementLines: { shift: { id: number; status: string } }[] }, aktor: Pick<Pengguna, 'saklar'>) {
  const alasan: string[] = []
  const diff = Number(st.diff)
  if (perluPersetujuan(diff, aktor.saklar['pos.batas_selisih_kas'])) alasan.push(`selisih ${diff < 0 ? '-' : '+'}${rupiah(Math.abs(diff))} melewati batas`)
  const tunggu = st.posSettlementLines.filter((l) => l.shift.status === 'PerluPersetujuan').map((l) => `#${l.shift.id}`)
  if (tunggu.length) alasan.push(`shift ${tunggu.join(', ')} masih perlu persetujuan`)
  return alasan
}

// Syarat posting yang tidak bergantung pada pelaku.
async function periksaPosting(tx: Tx, st: SetoranTerkunci) {
  const iso = dariKolomTanggal(st.date)
  if (!st.posSettlementLines.length) throw new GalatAturan('Setoran belum punya baris shift.')
  if (st.paymentMethod.kind === 'tunai') {
    const buka = await tx.shift.findMany({ where: { ...syaratShiftTanggal(iso), status: 'Buka' }, select: { id: true } })
    if (buka.length) throw new GalatAturan(`Setoran tunai tanggal ${iso} baru bisa diposting sesudah semua shift tanggal itu ditutup. Masih buka: ${buka.map((b) => `#${b.id}`).join(', ')}.`)
  } else if (!st.bankAccountId) {
    throw new GalatAturan('Pilih rekening tujuan dulu. Bila belum ada, minta Owner menambahnya di menu Rekening Bank.', 'bankAccountId')
  }
  if (st.bankAccountId) {
    const r = await tx.bankAccount.findUnique({ where: { id: st.bankAccountId }, select: { active: true } })
    if (!r?.active) throw new GalatAturan('Rekening tujuan sudah nonaktif. Pilih rekening lain.', 'bankAccountId')
  }
  const sisa = await calonBaris(tx, iso, st.paymentMethod, st.id)
  const kurang = sisa.filter((c) => !st.posSettlementLines.some((l) => l.shiftId === c.shiftId))
  if (kurang.length) throw new GalatAturan(`Shift ${kurang.map((c) => `#${c.shiftId}`).join(', ')} sudah ditutup tetapi belum masuk setoran ini. ${st.status === 'Draft' ? 'Tekan Muat ulang baris dulu.' : 'Kembalikan ke Draft lalu muat ulang baris.'}`)
  const berubah = sisa.filter((c) => st.posSettlementLines.some((l) => l.shiftId === c.shiftId && Number(l.expected) !== c.expected))
  if (berubah.length) throw new GalatAturan(`Nilai sistem shift ${berubah.map((c) => `#${c.shiftId}`).join(', ')} berubah sesudah setoran dibuat (ada void). ${st.status === 'Draft' ? 'Tekan Muat ulang baris dulu.' : 'Kembalikan ke Draft lalu muat ulang baris.'}`)
}

const jejak = (st: { status: string }) => ({ status: st.status })

export async function ajukanSetoran(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const st = await kunciSetoran(tx, id)
    if (!transisiSah('pelaksana', st.status as StatusDokumen, 'Diajukan')) throw new GalatAturan('Setoran ini tidak bisa diajukan dari status sekarang.')
    if (!st.posSettlementLines.length) throw new GalatAturan('Setoran belum punya baris shift.')
    const b = await tx.posSettlement.update({ where: { id }, data: { status: 'Diajukan', submittedBy: aktor.id, submittedAt: new Date(), updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'setoran.ajukan', docType: 'pos_settlement', docId: id, summary: `Mengajukan setoran ${st.no} ke Owner`, before: jejak(st), after: jejak(b) })
    return b
  })
}

export const skemaCatatan = z.object({ catatan: z.string().trim().max(200, 'Catatan paling panjang 200 huruf.').default('') })

// Dikembalikan ke Draft oleh penyetuju atau oleh pengajunya sendiri (RANCANGAN 2.1).
export async function kembalikanSetoran(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  const d = skemaCatatan.parse(masukan)
  return db.$transaction(async (tx) => {
    const st = await kunciSetoran(tx, id)
    if (!punyaIzin(aktor.izin, MENU, 'S') && !(st.submittedBy === aktor.id && punyaIzin(aktor.izin, MENU, 'U'))) pastikanIzin(aktor, MENU, 'S')
    if (!transisiSah('pelaksana', st.status as StatusDokumen, 'Draft')) throw new GalatAturan('Hanya setoran Diajukan yang bisa dikembalikan ke Draft.')
    const b = await tx.posSettlement.update({ where: { id }, data: { status: 'Draft', submittedBy: null, submittedAt: null, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'setoran.kembalikan', docType: 'pos_settlement', docId: id, summary: `Mengembalikan setoran ${st.no} ke Draft${d.catatan ? `: ${d.catatan}` : ''}`, before: jejak(st), after: { ...jejak(b), catatan: d.catatan } })
    return b
  })
}

// Posting. Bila butuh Owner, pelaku wajib memegang Setujui; dari Draft langsung lewat Diajukan dalam transaksi yang
// sama ("Setujui dan posting", RANCANGAN 2.2). Jurnal dibentuk di modul akuntansi dari dokumen Diposting.
export async function postingSetoran(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'P')
  return db.$transaction(async (tx) => {
    const st = await kunciSetoran(tx, id)
    const dari = st.status as StatusDokumen
    if (!transisiSah('pelaksana', dari, 'Diposting')) throw new GalatAturan('Setoran ini tidak bisa diposting dari status sekarang.')
    await periksaPosting(tx, st)
    const alasan = alasanButuhOwner(st, aktor)
    const butuhSetuju = alasan.length > 0
    const sekarang = new Date()
    const data: Prisma.PosSettlementUpdateInput = { status: 'Diposting', postedBy: aktor.id, postedAt: sekarang, updatedBy: aktor.id }
    if (butuhSetuju) {
      if (!punyaIzin(aktor.izin, MENU, 'S')) throw new GalatAturan(`Setoran ini butuh persetujuan Owner karena ${alasan.join(' dan ')}. ${dari === 'Draft' ? 'Ajukan dulu ke Owner.' : 'Tunggu Owner menyetujui.'}`)
      if (dari === 'Draft') {
        data.submittedBy = aktor.id
        data.submittedAt = sekarang
      }
      data.approvedBy = aktor.id
      data.approvedAt = sekarang
    }
    const b = await tx.posSettlement.update({ where: { id }, data })
    if (butuhSetuju) {
      await catatAudit(tx, k, { action: 'setoran.setujui', docType: 'pos_settlement', docId: id, summary: `Menyetujui setoran ${st.no}: ${alasan.join(', ')}`, before: jejak(st), after: { approvedBy: aktor.id, alasan } })
    }
    await catatAudit(tx, k, {
      action: 'setoran.posting',
      docType: 'pos_settlement',
      docId: id,
      summary: `Memposting setoran ${st.no} ${st.paymentMethod.name}: disetor ${rupiah(st.actualTotal)}, MDR ${rupiah(st.mdrFee)}, selisih ${rupiah(st.diff)}`,
      before: jejak(st),
      after: { status: b.status, expectedTotal: st.expectedTotal, actualTotal: st.actualTotal, mdrFee: st.mdrFee, diff: st.diff, shift: st.posSettlementLines.map((l) => l.shiftId) },
    })
    return b
  })
}

export const skemaBatal = z.object({ alasan: z.string().trim().min(3, 'Alasan pembatalan minimal 3 huruf.').max(200, 'Alasan paling panjang 200 huruf.') })

// Batal dari Draft, Diajukan, atau Disetujui butuh Ubah. Batal dari Diposting butuh Posting dan saklar
// dok.batal_posting (RANCANGAN 2.2, 8.3). Baris ikut ditandai batal sehingga shift-nya bisa disetor ulang.
export async function batalSetoran(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaBatal.parse(masukan)
  return db.$transaction(async (tx) => {
    const st = await kunciSetoran(tx, id)
    if (!transisiSah('pelaksana', st.status as StatusDokumen, 'Batal')) throw new GalatAturan('Setoran ini sudah Batal.')
    if (st.status === 'Diposting') {
      pastikanIzin(aktor, MENU, 'P')
      if (!saklarNyala(aktor, 'dok.batal_posting')) throw new GalatAturan('Membatalkan setoran yang sudah diposting butuh saklar Batalkan dokumen diposting. Minta Owner.')
    }
    const b = await tx.posSettlement.update({ where: { id }, data: { status: 'Batal', cancelledBy: aktor.id, cancelledAt: new Date(), cancelReason: d.alasan, updatedBy: aktor.id } })
    await tx.posSettlementLine.updateMany({ where: { posSettlementId: id }, data: { cancelled: true } })
    await catatAudit(tx, k, { action: 'setoran.batal', docType: 'pos_settlement', docId: id, summary: `Membatalkan setoran ${st.no} (${st.status}): ${d.alasan}`, before: jejak(st), after: { status: 'Batal', cancelReason: d.alasan } })
    return b
  })
}

// Hapus hanya untuk Draft. Nomor yang sudah keluar tidak dipakai ulang (KONTRAK 3.3).
export async function hapusSetoran(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU, 'H')
  return db.$transaction(async (tx) => {
    const st = await kunciSetoran(tx, id)
    if (st.status !== 'Draft') throw new GalatAturan('Hanya setoran Draft yang bisa dihapus. Setoran lain dibatalkan.')
    await tx.posSettlement.delete({ where: { id } })
    await catatAudit(tx, k, {
      action: 'setoran.hapus',
      docType: 'pos_settlement',
      docId: id,
      summary: `Menghapus draf setoran ${st.no}`,
      before: { no: st.no, date: dariKolomTanggal(st.date), paymentMethodId: st.paymentMethodId, shift: st.posSettlementLines.map((l) => l.shiftId), expectedTotal: st.expectedTotal, actualTotal: st.actualTotal },
    })
    return st
  })
}

export const NAMA_STATUS_SETORAN: Record<string, string> = { Draft: 'Draft', Diajukan: 'Diajukan', Disetujui: 'Disetujui', Diposting: 'Diposting', Batal: 'Batal' }

export type SaringSetoran = { dari?: string; sampai?: string; metode?: string; status?: string; hal?: string }

export async function daftarSetoran(db: Db, s: SaringSetoran) {
  const hal = sesuaiHalaman(s.hal)
  const where: Prisma.PosSettlementWhereInput = {}
  const dari = s.dari && tanggalSah(s.dari) ? s.dari : undefined
  const sampai = s.sampai && tanggalSah(s.sampai) ? s.sampai : undefined
  if (dari || sampai) where.date = { ...(dari ? { gte: keKolomTanggal(dari) } : {}), ...(sampai ? { lte: keKolomTanggal(sampai) } : {}) }
  if (Number(s.metode) > 0) where.paymentMethodId = Number(s.metode)
  if (s.status && s.status in NAMA_STATUS_SETORAN) where.status = s.status as StatusDokumen
  const [baris, total] = await Promise.all([
    db.posSettlement.findMany({
      where,
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (hal - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
      include: { paymentMethod: { select: { name: true, kind: true } }, bankAccount: { select: { bankName: true, accountNo: true } }, _count: { select: { posSettlementLines: true } } },
    }),
    db.posSettlement.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export async function ambilSetoran(db: Db, id: number) {
  const st = await db.posSettlement.findUnique({
    where: { id },
    include: {
      paymentMethod: true,
      bankAccount: true,
      posSettlementLines: { orderBy: { shiftId: 'asc' }, include: { shift: { select: { id: true, status: true, openedAt: true, closedAt: true, openCash: true, countedCash: true, cashDiff: true, user: { select: { name: true } } } } } },
    },
  })
  if (!st) return null
  const ids = [st.createdBy, st.submittedBy, st.approvedBy, st.postedBy, st.cancelledBy].filter((x): x is number => !!x)
  const orang = new Map((await db.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  const nama = (x: number | null) => (x ? (orang.get(x) ?? `#${x}`) : null)
  return { ...st, oleh: { dibuat: nama(st.createdBy), diajukan: nama(st.submittedBy), disetujui: nama(st.approvedBy), diposting: nama(st.postedBy), dibatalkan: nama(st.cancelledBy) } }
}
