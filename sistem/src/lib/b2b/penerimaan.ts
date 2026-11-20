// Penerimaan Pelanggan B2B (tahap 6A). Uang masuk dari satu pelanggan ke kas atau rekening bank (bank_account),
// dialokasikan ke faktur penjualan Diposting yang belum lunas. Nota kredit retur penjualan yang belum terpakai menjadi
// pengurang. Status bayar faktur diperbarui saat Diposting dan dikembalikan saat penerimaan dibatalkan. Pola mengikuti
// Pembayaran Pembelian, tetapi tanpa langkah Setujui (dokumen pelaksana biasa). Tanpa impor Next.
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
  periksaTanggal,
  skemaTanggalWajib,
  statusBayar,
  ubahStatusBeli,
  type AksiBeli,
  type Aktor,
  type KaitBeli,
  type KepalaBeli,
} from '../beli/dokumen'
import { pelangganAktif, saringJual, type SaringJual } from './umum'

const JENIS = 'customer_payment' as const
const INFO = DOK_BELI[JENIS]
const MENU = INFO.menu

export const skemaKepalaTerima = z.object({
  customerId: idSkema('pelanggan'),
  date: skemaTanggalWajib('Tanggal terima'),
  tujuan: z.string().regex(/^(kas|\d+)$/, 'Pilih kas atau rekening bank.'),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

async function rekening(tx: Tx, tujuan: string) {
  if (tujuan === 'kas') return null
  const r = await tx.bankAccount.findUnique({ where: { id: Number(tujuan) } })
  if (!r || !r.active) throw new GalatAturan('Rekening bank tidak ditemukan atau nonaktif.', 'tujuan')
  return r.id
}

export async function buatTerima(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaKepalaTerima.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const c = await pelangganAktif(tx, d.customerId)
    const bankAccountId = await rekening(tx, d.tujuan)
    const no = await ambilNomor(tx, JENIS, INFO.awalan, d.date)
    const t = await tx.customerPayment.create({ data: { customerId: c.id, date: d.date, note: d.note, bankAccountId, no, createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'terima_pelanggan.tambah', docType: JENIS, docId: t.id, summary: `Membuat draf penerimaan pelanggan ${no} dari ${c.name}`, after: { no, pelanggan: c.name, date: d.date, tujuan: bankAccountId ?? 'kas', note: d.note } })
    return t
  })
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, JENIS, id)
  const t = await tx.customerPayment.findUnique({ where: { id }, include: { customer: true } })
  if (!t) throw new GalatAturan('Penerimaan pelanggan tidak ditemukan.')
  if (t.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return t
}

export async function ubahKepalaTerima(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaTerima.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const t = await muatDraf(tx, id)
    if (d.customerId !== t.customerId && (await tx.customerPaymentAlloc.count({ where: { customerPaymentId: id } }))) throw new GalatAturan('Pelanggan tidak bisa diganti karena alokasi sudah diisi. Kosongkan alokasinya dulu.', 'customerId')
    const c = await pelangganAktif(tx, d.customerId)
    const bankAccountId = await rekening(tx, d.tujuan)
    const sebelum = { pelanggan: t.customer.name, date: t.date.toISOString().slice(0, 10), tujuan: t.bankAccountId ?? 'kas', note: t.note }
    const sesudah = { pelanggan: c.name, date: d.date.toISOString().slice(0, 10), tujuan: bankAccountId ?? 'kas', note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.customerPayment.update({ where: { id }, data: { customerId: c.id, date: d.date, note: d.note, bankAccountId, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'terima_pelanggan.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala penerimaan pelanggan ${t.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

export type PiutangTerbuka = { kunci: string; jenis: 'faktur' | 'retur'; id: number; no: string; ref: string; date: Date; dueDate: Date | null; total: bigint; sisa: bigint }

// Faktur pelanggan yang belum lunas dan nota kredit retur yang belum terpakai. sisa tidak memperhitungkan penerimaan yang
// belum Diposting.
export async function piutangTerbuka(db: Db | Tx, customerId: number): Promise<PiutangTerbuka[]> {
  const [faktur, retur] = await Promise.all([
    db.salesInvoice.findMany({ where: { customerId, status: 'Diposting', payStatus: { not: 'Lunas' } }, orderBy: [{ dueDate: 'asc' }, { id: 'asc' }], take: 500 }),
    db.salesReturn.findMany({ where: { customerId, status: 'Diposting', total: { gt: 0 } }, orderBy: [{ date: 'asc' }, { id: 'asc' }], take: 500 }),
  ])
  return [
    ...faktur.map((f) => ({ kunci: `f${f.id}`, jenis: 'faktur' as const, id: f.id, no: f.no, ref: f.customerRef, date: f.date, dueDate: f.dueDate, total: f.total, sisa: f.total - f.paidAmount })),
    ...retur.map((r) => ({ kunci: `r${r.id}`, jenis: 'retur' as const, id: r.id, no: r.no, ref: r.reason, date: r.date, dueDate: null, total: r.total, sisa: r.total - r.creditUsed })),
  ].filter((t) => t.sisa > 0n)
}

const kunciAlok = (a: { salesInvoiceId: number | null; salesReturnId: number | null }) => (a.salesInvoiceId ? `f${a.salesInvoiceId}` : `r${a.salesReturnId}`)

// Simpan alokasi (isian terima_<kunci>, misalnya terima_f12 atau terima_r5). Kosong atau 0 berarti tidak dialokasikan.
// Jumlah diterima = alokasi faktur - nota kredit yang dipakai.
export async function simpanAlokasiTerima(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const t = await muatDraf(tx, id)
    const terbuka = await piutangTerbuka(tx, t.customerId)
    const lama = await tx.customerPaymentAlloc.findMany({ where: { customerPaymentId: id } })
    const baru: { p: PiutangTerbuka; jumlah: bigint }[] = []
    for (const p of terbuka) {
      const v = skemaUang({ label: `Jumlah ${p.no}`, min: 0n, wajib: false, max: 10_000_000_000n }).safeParse(String(masukan[`terima_${p.kunci}`] ?? ''))
      if (!v.success) throw new GalatAturan(v.error.issues[0].message, `terima_${p.kunci}`)
      if (v.data > p.sisa) throw new GalatAturan(`Jumlah ${p.no} melebihi sisanya (${formatRupiah(p.sisa)}).`, `terima_${p.kunci}`)
      if (v.data > 0n) baru.push({ p, jumlah: v.data })
    }
    const tagihan = baru.filter((x) => x.p.jenis === 'faktur').reduce((n, x) => n + x.jumlah, 0n)
    const kredit = baru.filter((x) => x.p.jenis === 'retur').reduce((n, x) => n + x.jumlah, 0n)
    if (kredit > tagihan) throw new GalatAturan('Nota kredit yang dipakai tidak boleh lebih besar dari faktur yang dilunasi.')
    await tx.customerPaymentAlloc.deleteMany({ where: { customerPaymentId: id } })
    for (const x of baru) {
      await tx.customerPaymentAlloc.create({ data: { customerPaymentId: id, amount: x.jumlah, salesInvoiceId: x.p.jenis === 'faktur' ? x.p.id : null, salesReturnId: x.p.jenis === 'retur' ? x.p.id : null } })
    }
    const amount = tagihan - kredit
    await tx.customerPayment.update({ where: { id }, data: { amount, unallocated: 0n, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'terima_pelanggan.alokasi',
      docType: JENIS,
      docId: id,
      summary: `Mengisi alokasi ${t.no}: ${baru.length} dokumen, faktur ${formatRupiah(tagihan)}, nota kredit ${formatRupiah(kredit)}, diterima ${formatRupiah(amount)}`,
      before: { jumlah: t.amount, alokasi: lama.map((a) => ({ dok: kunciAlok(a), amount: a.amount })) },
      after: { jumlah: amount, alokasi: baru.map((x) => ({ dok: x.p.no, amount: x.jumlah })) },
    })
    return baru.length
  })
}

type KepalaTerima = KepalaBeli & { customerId: number; amount: bigint; bankAccountId: number | null }

// Kunci dokumen yang dialokasikan dengan urutan tetap, lalu periksa sisa terbaru. tanda: 0 periksa saja, +1 posting
// (paid_amount dan credit_used bertambah), -1 batal (dikembalikan).
async function prosesAlokasi(tx: Tx, d: KepalaTerima, tanda: 0 | 1 | -1) {
  const alok = await tx.customerPaymentAlloc.findMany({ where: { customerPaymentId: d.id } })
  if (!alok.length) throw new GalatAturan('Isi alokasi penerimaan dulu.')
  const urut = [...alok].sort((a, b) => kunciAlok(a).localeCompare(kunciAlok(b)))
  let tagihan = 0n
  let kredit = 0n
  for (const a of urut) {
    if (a.salesInvoiceId) {
      await kunciBaris(tx, 'sales_invoice', a.salesInvoiceId)
      const f = await tx.salesInvoice.findUniqueOrThrow({ where: { id: a.salesInvoiceId } })
      if (f.customerId !== d.customerId) throw new GalatAturan(`Faktur ${f.no} milik pelanggan lain.`)
      if (tanda >= 0) {
        if (f.status !== 'Diposting') throw new GalatAturan(`Faktur ${f.no} berstatus ${f.status}, jadi tidak bisa dilunasi.`)
        if (a.amount > f.total - f.paidAmount) throw new GalatAturan(`Alokasi ${f.no} melebihi sisa piutangnya (${formatRupiah(f.total - f.paidAmount)}). Perbarui alokasi.`)
      }
      if (tanda !== 0) {
        const dibayar = f.paidAmount + BigInt(tanda) * a.amount
        await tx.salesInvoice.update({ where: { id: f.id }, data: { paidAmount: dibayar, payStatus: statusBayar(f.total, dibayar) } })
      }
      tagihan += a.amount
    } else {
      await kunciBaris(tx, 'sales_return', a.salesReturnId!)
      const r = await tx.salesReturn.findUniqueOrThrow({ where: { id: a.salesReturnId! } })
      if (r.customerId !== d.customerId) throw new GalatAturan(`Retur ${r.no} milik pelanggan lain.`)
      if (tanda >= 0) {
        if (r.status !== 'Diposting') throw new GalatAturan(`Retur ${r.no} berstatus ${r.status}, jadi nota kreditnya tidak bisa dipakai.`)
        if (a.amount > r.total - r.creditUsed) throw new GalatAturan(`Pemakaian nota kredit ${r.no} melebihi sisanya (${formatRupiah(r.total - r.creditUsed)}). Perbarui alokasi.`)
      }
      if (tanda !== 0) await tx.salesReturn.update({ where: { id: r.id }, data: { creditUsed: r.creditUsed + BigInt(tanda) * a.amount } })
      kredit += a.amount
    }
  }
  if (tagihan - kredit !== d.amount) throw new GalatAturan('Jumlah diterima tidak sama dengan alokasinya. Simpan ulang alokasi.')
  if (tagihan <= 0n) throw new GalatAturan('Alokasikan minimal satu faktur.')
  // Jumlah 0 hanya boleh bila faktur dilunasi seluruhnya dengan nota kredit (saling hapus tanpa uang masuk).
  if (d.amount < 0n || (d.amount === 0n && kredit === 0n)) throw new GalatAturan('Jumlah diterima harus lebih dari 0.')
  return { dokumen: alok.length, tagihan, kredit }
}

export const KAIT_TERIMA: KaitBeli<KepalaTerima> = {
  jenis: JENIS,
  muat: (tx, id) => tx.customerPayment.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.customerPayment.update({ where: { id }, data: dataPelaksana(data) }),
  butuhSetuju: async () => false,
  periksaIsi: async (tx, d) => {
    await pelangganAktif(tx, d.customerId)
    await prosesAlokasi(tx, d, 0)
    if (d.bankAccountId) {
      const r = await tx.bankAccount.findUnique({ where: { id: d.bankAccountId } })
      if (!r || !r.active) throw new GalatAturan('Rekening tujuan sudah nonaktif. Pilih kas atau rekening lain.')
    }
  },
  posting: async (tx, d) => {
    const h = await prosesAlokasi(tx, d, 1)
    return { ringkas: `${h.dokumen} dokumen, diterima ${formatRupiah(d.amount)}${h.kredit ? ` sesudah nota kredit ${formatRupiah(h.kredit)}` : ''}`, sesudah: { jumlah: d.amount, faktur: h.tagihan, notaKredit: h.kredit } }
  },
  batal: async (tx, d, _a, dari) => {
    if (dari !== 'Diposting') return
    const h = await prosesAlokasi(tx, d, -1)
    return { sesudah: { dikembalikan: h.tagihan, notaKreditDikembalikan: h.kredit } }
  },
}

export const ubahStatusTerima = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiBeli, opsi: { alasan?: string } = {}) => ubahStatusBeli(db, k, aktor, KAIT_TERIMA, id, aksi, opsi)

export const hapusTerima = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDrafBeli(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.customerPayment.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.customerPayment.delete({ where: { id } })
    return d
  })

export const muatTerima = (db: Db, id: number) =>
  db.customerPayment.findUnique({
    where: { id },
    include: {
      customer: true,
      customerPaymentAllocs: {
        include: {
          salesInvoice: { select: { id: true, no: true, customerRef: true, total: true, paidAmount: true, payStatus: true, dueDate: true } },
          salesReturn: { select: { id: true, no: true, total: true, creditUsed: true } },
        },
        orderBy: { id: 'asc' },
      },
    },
  })

export async function daftarTerima(db: Db, s: SaringJual) {
  const { where, hal, per } = saringJual(s)
  const [baris, total] = await Promise.all([
    db.customerPayment.findMany({ where, include: { customer: true, _count: { select: { customerPaymentAllocs: true } } }, orderBy: [{ date: 'desc' }, { id: 'desc' }], skip: (hal - 1) * per, take: per }),
    db.customerPayment.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: jumlahHal(total) }
}
