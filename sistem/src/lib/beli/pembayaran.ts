// Pembayaran Pembelian (tahap 4C, RANCANGAN 3.7). Membayar satu pemasok dari kas atau rekening bank (bank_account),
// dialokasikan ke faktur pembelian dan pembelian langsung kredit yang belum lunas. Nota debit retur yang belum terpakai
// menjadi pengurang. Alurnya Draft, Diajukan, Disetujui (Owner), lalu Diposting saat uang keluar. Status bayar dokumen
// yang dibayar diperbarui saat Diposting dan dikembalikan saat pembayaran dibatalkan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { formatRupiah, skemaUang } from '../master'
import { ambilNomor } from '../nomor'
import {
  DOK_BELI,
  dataPelaksana,
  hapusDrafBeli,
  idSkema,
  jumlahHal,
  kunciBaris,
  pastikanSalahSatu,
  pemasokAktif,
  periksaTanggal,
  saringBeli,
  skemaTanggalWajib,
  statusBayar,
  ubahStatusBeli,
  type AksiBeli,
  type Aktor,
  type KaitBeli,
  type KepalaBeli,
  type SaringBeli,
} from './dokumen'

const JENIS = 'purchase_payment' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const skemaKepalaPembayaran = z.object({
  supplierId: idSkema('pemasok'),
  date: skemaTanggalWajib('Tanggal bayar'),
  sumber: z.string().regex(/^(kas|\d+)$/, 'Pilih kas atau rekening bank.'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

async function rekening(tx: Tx, sumber: string) {
  if (sumber === 'kas') return null
  const r = await tx.bankAccount.findUnique({ where: { id: Number(sumber) } })
  if (!r || !r.active) throw new GalatAturan('Rekening bank tidak ditemukan atau nonaktif.', 'sumber')
  return r.id
}

export async function buatPembayaran(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaPembayaran.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const s = await pemasokAktif(tx, d.supplierId)
    const bankAccountId = await rekening(tx, d.sumber)
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const b = await tx.purchasePayment.create({ data: { supplierId: s.id, date: d.date, note: d.note, bankAccountId, no, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pembayaran.tambah', docType: JENIS, docId: b.id, summary: `Membuat draf pembayaran pembelian ${no} ke ${s.name}`, after: { no, pemasok: s.name, date: d.date, sumber: bankAccountId ?? 'kas', note: d.note } })
    return b
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const b = await tx.purchasePayment.findUnique({ where: { id }, include: { supplier: true } })
  if (!b) throw new GalatAturan('Pembayaran pembelian tidak ditemukan.')
  if (b.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return b
}

export async function ubahKepalaPembayaran(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaPembayaran.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const b = await muatDraf(tx, id)
    if (d.supplierId !== b.supplierId && (await tx.purchasePaymentAlloc.count({ where: { purchasePaymentId: id } }))) throw new GalatAturan('Pemasok tidak bisa diganti karena alokasi sudah diisi. Kosongkan alokasinya dulu.', 'supplierId')
    const s = await pemasokAktif(tx, d.supplierId)
    const bankAccountId = await rekening(tx, d.sumber)
    const sebelum = { pemasok: b.supplier.name, date: b.date.toISOString().slice(0, 10), sumber: b.bankAccountId ?? 'kas', note: b.note }
    const sesudah = { pemasok: s.name, date: d.date.toISOString().slice(0, 10), sumber: bankAccountId ?? 'kas', note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.purchasePayment.update({ where: { id }, data: { supplierId: s.id, date: d.date, note: d.note, bankAccountId, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pembayaran.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala pembayaran pembelian ${b.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

export type TagihanTerbuka = { kunci: string; jenis: 'faktur' | 'langsung' | 'retur'; id: number; no: string; ref: string; date: Date; dueDate: Date | null; total: bigint; sisa: bigint }

// Tagihan pemasok yang belum lunas (faktur Diposting dan pembelian langsung kredit Diposting) dan nota debit retur yang
// belum terpakai. sisa tidak memperhitungkan pembayaran yang belum Diposting.
export async function tagihanTerbuka(db: Db | Tx, supplierId: number): Promise<TagihanTerbuka[]> {
  const [faktur, langsung, retur] = await Promise.all([
    db.purchaseInvoice.findMany({ where: { supplierId, status: 'Diposting', payStatus: { not: 'Lunas' } }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] }),
    db.directPurchase.findMany({ where: { supplierId, status: 'Diposting', payMode: 'kredit', payStatus: { not: 'Lunas' } }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }] }),
    db.purchaseReturn.findMany({ where: { supplierId, status: 'Diposting', debitNoteAmount: { gt: 0 } }, orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
  ])
  return [
    ...faktur.map((f) => ({ kunci: `f${f.id}`, jenis: 'faktur' as const, id: f.id, no: f.no, ref: f.supplierInvoiceNo, date: f.date, dueDate: f.dueDate, total: f.total, sisa: f.total - f.paidAmount })),
    ...langsung.map((f) => ({ kunci: `b${f.id}`, jenis: 'langsung' as const, id: f.id, no: f.no, ref: f.supplierInvoiceNo, date: f.date, dueDate: f.dueDate, total: f.total, sisa: f.total - f.paidAmount })),
    ...retur.filter((r) => r.debitNoteAmount > r.debitNoteUsed).map((r) => ({ kunci: `r${r.id}`, jenis: 'retur' as const, id: r.id, no: r.no, ref: r.reason, date: r.date, dueDate: null, total: r.debitNoteAmount, sisa: r.debitNoteAmount - r.debitNoteUsed })),
  ].filter((t) => t.sisa > 0n)
}

const kunciAlok = (a: { purchaseInvoiceId: number | null; directPurchaseId: number | null; purchaseReturnId: number | null }) =>
  a.purchaseInvoiceId ? `f${a.purchaseInvoiceId}` : a.directPurchaseId ? `b${a.directPurchaseId}` : `r${a.purchaseReturnId}`

// Simpan alokasi (isian bayar_<kunci>, misalnya bayar_f12, bayar_b3, bayar_r5). Kosong atau 0 berarti tidak dialokasikan.
// Jumlah pembayaran = jumlah alokasi tagihan - jumlah nota debit yang dipakai.
export async function simpanAlokasi(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const b = await muatDraf(tx, id)
    const terbuka = await tagihanTerbuka(tx, b.supplierId)
    const lama = await tx.purchasePaymentAlloc.findMany({ where: { purchasePaymentId: id } })
    const baru: { t: TagihanTerbuka; jumlah: bigint }[] = []
    for (const t of terbuka) {
      const v = skemaUang({ label: `Jumlah ${t.no}`, min: 0n, wajib: false, max: 10_000_000_000n }).safeParse(String(masukan[`bayar_${t.kunci}`] ?? ''))
      if (!v.success) throw new GalatAturan(v.error.issues[0].message, `bayar_${t.kunci}`)
      if (v.data > t.sisa) throw new GalatAturan(`Jumlah ${t.no} melebihi sisanya (${formatRupiah(t.sisa)}).`, `bayar_${t.kunci}`)
      if (v.data > 0n) baru.push({ t, jumlah: v.data })
    }
    const tagihan = baru.filter((x) => x.t.jenis !== 'retur').reduce((n, x) => n + x.jumlah, 0n)
    const nota = baru.filter((x) => x.t.jenis === 'retur').reduce((n, x) => n + x.jumlah, 0n)
    if (nota > tagihan) throw new GalatAturan('Nota debit yang dipakai tidak boleh lebih besar dari tagihan yang dibayar.')
    await tx.purchasePaymentAlloc.deleteMany({ where: { purchasePaymentId: id } })
    for (const x of baru) {
      await tx.purchasePaymentAlloc.create({
        data: {
          purchasePaymentId: id,
          amount: x.jumlah,
          purchaseInvoiceId: x.t.jenis === 'faktur' ? x.t.id : null,
          directPurchaseId: x.t.jenis === 'langsung' ? x.t.id : null,
          purchaseReturnId: x.t.jenis === 'retur' ? x.t.id : null,
        },
      })
    }
    const amount = tagihan - nota
    await tx.purchasePayment.update({ where: { id }, data: { amount, unallocated: 0n, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'pembayaran.alokasi',
      docType: JENIS,
      docId: id,
      summary: `Mengisi alokasi ${b.no}: ${baru.length} dokumen, tagihan ${formatRupiah(tagihan)}, nota debit ${formatRupiah(nota)}, dibayar ${formatRupiah(amount)}`,
      before: { jumlah: b.amount, alokasi: lama.map((a) => ({ dok: kunciAlok(a), amount: a.amount })) },
      after: { jumlah: amount, alokasi: baru.map((x) => ({ dok: x.t.no, amount: x.jumlah })) },
    })
    return baru.length
  })
}

type KepalaPembayaran = KepalaBeli & { supplierId: number; amount: bigint; bankAccountId: number | null }

// Kunci dokumen yang dialokasikan dengan urutan tetap, lalu periksa sisa terbaru. terapkan: ubah paid_amount atau
// debit_note_used dengan tanda (+1 saat posting, -1 saat batal).
async function prosesAlokasi(tx: Tx, d: KepalaPembayaran, tanda: 0 | 1 | -1) {
  const alok = await tx.purchasePaymentAlloc.findMany({ where: { purchasePaymentId: d.id } })
  if (!alok.length) throw new GalatAturan('Isi alokasi pembayaran dulu.')
  const urut = [...alok].sort((a, b) => kunciAlok(a).localeCompare(kunciAlok(b)))
  let tagihan = 0n
  let nota = 0n
  for (const a of urut) {
    if (a.purchaseInvoiceId) {
      await kunciBaris(tx, 'purchase_invoice', a.purchaseInvoiceId)
      const f = await tx.purchaseInvoice.findUniqueOrThrow({ where: { id: a.purchaseInvoiceId } })
      if (f.supplierId !== d.supplierId) throw new GalatAturan(`Faktur ${f.no} milik pemasok lain.`)
      if (tanda >= 0) {
        if (f.status !== 'Diposting') throw new GalatAturan(`Faktur ${f.no} berstatus ${f.status}, jadi tidak bisa dibayar.`)
        if (a.amount > f.total - f.paidAmount) throw new GalatAturan(`Alokasi ${f.no} melebihi sisa tagihannya (${formatRupiah(f.total - f.paidAmount)}). Perbarui alokasi.`)
      }
      if (tanda !== 0) {
        const dibayar = f.paidAmount + BigInt(tanda) * a.amount
        await tx.purchaseInvoice.update({ where: { id: f.id }, data: { paidAmount: dibayar, payStatus: statusBayar(f.total, dibayar) } })
      }
      tagihan += a.amount
    } else if (a.directPurchaseId) {
      await kunciBaris(tx, 'direct_purchase', a.directPurchaseId)
      const f = await tx.directPurchase.findUniqueOrThrow({ where: { id: a.directPurchaseId } })
      if (f.supplierId !== d.supplierId) throw new GalatAturan(`Pembelian ${f.no} milik pemasok lain.`)
      if (tanda >= 0) {
        if (f.status !== 'Diposting' || f.payMode !== 'kredit') throw new GalatAturan(`Pembelian langsung ${f.no} bukan tagihan kredit yang Diposting.`)
        if (a.amount > f.total - f.paidAmount) throw new GalatAturan(`Alokasi ${f.no} melebihi sisa tagihannya (${formatRupiah(f.total - f.paidAmount)}). Perbarui alokasi.`)
      }
      if (tanda !== 0) {
        const dibayar = f.paidAmount + BigInt(tanda) * a.amount
        await tx.directPurchase.update({ where: { id: f.id }, data: { paidAmount: dibayar, payStatus: statusBayar(f.total, dibayar) } })
      }
      tagihan += a.amount
    } else {
      await kunciBaris(tx, 'purchase_return', a.purchaseReturnId!)
      const r = await tx.purchaseReturn.findUniqueOrThrow({ where: { id: a.purchaseReturnId! } })
      if (r.supplierId !== d.supplierId) throw new GalatAturan(`Retur ${r.no} milik pemasok lain.`)
      if (tanda >= 0) {
        if (r.status !== 'Diposting') throw new GalatAturan(`Retur ${r.no} berstatus ${r.status}, jadi nota debitnya tidak bisa dipakai.`)
        if (a.amount > r.debitNoteAmount - r.debitNoteUsed) throw new GalatAturan(`Pemakaian nota debit ${r.no} melebihi sisanya (${formatRupiah(r.debitNoteAmount - r.debitNoteUsed)}). Perbarui alokasi.`)
      }
      if (tanda !== 0) await tx.purchaseReturn.update({ where: { id: r.id }, data: { debitNoteUsed: r.debitNoteUsed + BigInt(tanda) * a.amount } })
      nota += a.amount
    }
  }
  if (tagihan - nota !== d.amount) throw new GalatAturan('Jumlah pembayaran tidak sama dengan alokasinya. Simpan ulang alokasi.')
  if (d.amount <= 0n) throw new GalatAturan('Jumlah yang dibayar harus lebih dari 0.')
  return { dokumen: alok.length, tagihan, nota }
}

export const KAIT_PEMBAYARAN: KaitBeli<KepalaPembayaran> = {
  jenis: JENIS,
  muat: (tx, id) => tx.purchasePayment.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.purchasePayment.update({ where: { id }, data: dataPelaksana(data) }),
  // Semua pembayaran pembelian disetujui dulu (golongan pelaksana_setuju).
  butuhSetuju: async () => true,
  periksaIsi: async (tx, d) => {
    await pemasokAktif(tx, d.supplierId)
    await prosesAlokasi(tx, d, 0)
    if (d.bankAccountId) {
      const r = await tx.bankAccount.findUnique({ where: { id: d.bankAccountId } })
      if (!r || !r.active) throw new GalatAturan('Rekening sumber sudah nonaktif. Pilih kas atau rekening lain.')
    }
  },
  setujui: async (_tx, d) => ({ ringkas: `dibayar ${formatRupiah(d.amount)}`, sesudah: { jumlah: d.amount } }),
  posting: async (tx, d) => {
    const h = await prosesAlokasi(tx, d, 1)
    return { ringkas: `${h.dokumen} dokumen, dibayar ${formatRupiah(d.amount)}${h.nota ? ` sesudah nota debit ${formatRupiah(h.nota)}` : ''}`, sesudah: { jumlah: d.amount, tagihan: h.tagihan, notaDebit: h.nota } }
  },
  batal: async (tx, d, _a, dari) => {
    if (dari !== 'Diposting') return
    // Status bayar dokumen yang dibayar dikembalikan.
    const h = await prosesAlokasi(tx, d, -1)
    return { sesudah: { dikembalikan: h.tagihan, notaDebitDikembalikan: h.nota } }
  },
}

export const ubahStatusPembayaran = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_PEMBAYARAN, id, aksi, opsi)

export const hapusPembayaran = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.purchasePayment.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.purchasePayment.delete({ where: { id } })
    return d
  })

export const muatPembayaran = (db: Db, id: number) =>
  db.purchasePayment.findUnique({
    where: { id },
    include: {
      supplier: true,
      purchasePaymentAllocs: {
        include: {
          purchaseInvoice: { select: { id: true, no: true, supplierInvoiceNo: true, total: true, paidAmount: true, payStatus: true, dueDate: true } },
          directPurchase: { select: { id: true, no: true, supplierInvoiceNo: true, total: true, paidAmount: true, payStatus: true, dueDate: true } },
          purchaseReturn: { select: { id: true, no: true, debitNoteAmount: true, debitNoteUsed: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  })

export async function daftarPembayaran(db: Db, s: SaringBeli) {
  const { where: dasar, pemasok, hal, per } = saringBeli(s)
  const where = { ...dasar, ...(pemasok ? { supplierId: pemasok } : {}) }
  const [baris, total] = await Promise.all([
    db.purchasePayment.findMany({ where, include: { supplier: true, _count: { select: { purchasePaymentAllocs: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.purchasePayment.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}
