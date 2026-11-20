// Perintah Produksi (tahap 4B, RANCANGAN 5.1). Dokumen rencana: tidak menggerakkan stok. Baris bahan disalin dari BOM
// Assembly dikali qty rencana saat draf dibuat, jadi perubahan BOM sesudahnya tidak mengubah perintah yang berjalan.
// Alur: Draft -> (Diajukan ->) Disetujui -> Selesai, Draft | Diajukan | Disetujui -> Batal (KONTRAK 3.2). Nilai barang dalam
// proses (wip_value) bertambah oleh Pengeluaran Bahan dan berkurang oleh Hasil Produksi (KONTRAK 13). Tanpa impor Next.
import { z } from 'zod'
import type { DocStatus, Prisma } from '@/generated/prisma/client'
import { GalatAturan, GalatIzin } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, DbAtauTx, Tx } from '../db'
import { pastikanIzin, punyaIzin } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman, skemaTanggal } from '../master'
import { ambilNomor } from '../nomor'
import { transisiSah } from '../status'
import { Desimal, NOL, des, formatNilai, formatQty, skemaQty } from '../stok/angka'
import { pastikanSalahSatu, periksaTanggal, type Aktor, type SaringDok } from '../stok/dokumen'

export const MENU_PERINTAH = 'produksi.perintah'
const JENIS = 'production_order'

const idWajib = (label: string) => z.string().regex(/^\d+$/, `Pilih ${label}.`).transform(Number)
const tanggalWajib = skemaTanggal('Tanggal').transform((v, ctx) => {
  if (!v) {
    ctx.addIssue({ code: 'custom', message: 'Tanggal wajib diisi.' })
    return z.NEVER
  }
  return v
})

export const skemaPerintah = z.object({
  bomId: idWajib('BOM assembly'),
  plannedQty: skemaQty({ label: 'Qty rencana' }),
  materialLocationId: idWajib('lokasi bahan'),
  outputLocationId: idWajib('lokasi hasil'),
  date: tanggalWajib,
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

// Kebutuhan bahan = qty BOM x qty rencana / qty hasil BOM, dibulatkan 3 desimal.
export const kebutuhan = (qtyBom: Prisma.Decimal | string, rencana: Desimal, hasilBom: Prisma.Decimal | string) =>
  des(qtyBom).times(rencana).div(des(hasilBom)).toDecimalPlaces(3, Desimal.ROUND_HALF_UP)

async function bomSiap(tx: DbAtauTx, bomId: number) {
  const b = await tx.bom.findUnique({ where: { id: bomId }, include: { product: true, bomLines: { orderBy: { id: 'asc' }, include: { product: true } } } })
  if (!b || b.kind !== 'assembly' || !b.active) throw new GalatAturan('Pilih BOM assembly yang aktif.', 'bomId')
  if (!b.product || !b.product.active) throw new GalatAturan('Produk hasil BOM ini tidak ada atau nonaktif.', 'bomId')
  if (!b.bomLines.length) throw new GalatAturan('BOM ini belum punya bahan.', 'bomId')
  return b
}

async function duaLokasi(tx: DbAtauTx, bahan: number, hasil: number) {
  const [a, b] = await Promise.all([tx.location.findUnique({ where: { id: bahan } }), tx.location.findUnique({ where: { id: hasil } })])
  if (!a || !a.active) throw new GalatAturan('Lokasi bahan tidak ditemukan atau nonaktif.', 'materialLocationId')
  if (!b || !b.active) throw new GalatAturan('Lokasi hasil tidak ditemukan atau nonaktif.', 'outputLocationId')
  return [a, b] as const
}

function barisDariBom(b: Awaited<ReturnType<typeof bomSiap>>, rencana: Desimal) {
  return b.bomLines.map((l) => {
    const q = kebutuhan(l.qty, rencana, b.outputQty)
    if (!q.gt(0)) throw new GalatAturan(`Qty rencana terlalu kecil: kebutuhan ${l.product.name} menjadi 0.`, 'plannedQty')
    return { productId: l.productId, requiredQty: q, tolPct: l.tolPct }
  })
}

export async function buatPerintah(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU_PERINTAH, 'T')
  const d = skemaPerintah.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const b = await bomSiap(tx, d.bomId)
    const [la, lb] = await duaLokasi(tx, d.materialLocationId, d.outputLocationId)
    const baris = barisDariBom(b, d.plannedQty)
    const no = await ambilNomor(tx, JENIS, 'PP', d.date)
    const po = await tx.productionOrder.create({
      data: {
        no,
        bomId: b.id,
        plannedQty: d.plannedQty,
        materialLocationId: la.id,
        outputLocationId: lb.id,
        date: d.date,
        note: d.note,
        createdBy: aktor.id,
        updatedBy: aktor.id,
        productionOrderLines: { create: baris },
      },
    })
    await catatAudit(tx, k, {
      action: 'perintah.tambah',
      docType: JENIS,
      docId: po.id,
      summary: `Membuat draf perintah produksi ${no}: ${formatQty(d.plannedQty)} ${b.product!.name} dari ${b.code}`,
      after: { no, bom: b.code, versiBom: b.version, plannedQty: d.plannedQty, lokasiBahan: la.name, lokasiHasil: lb.name, date: d.date, baris: baris.length },
    })
    return po
  })
}

async function kunci(tx: Tx, id: number) {
  await tx.$executeRaw`SELECT id FROM production_order WHERE id = ${id} FOR UPDATE`
  const po = await tx.productionOrder.findUnique({ where: { id }, include: { bom: { include: { product: true } } } })
  if (!po) throw new GalatAturan('Perintah produksi tidak ditemukan.')
  return po
}

// Ubah draf. Bila BOM atau qty rencana berubah, baris bahan disalin ulang dari BOM.
export async function ubahPerintah(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU_PERINTAH, ['T', 'U'])
  const d = skemaPerintah.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const po = await kunci(tx, id)
    if (po.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
    const [la, lb] = await duaLokasi(tx, d.materialLocationId, d.outputLocationId)
    const sebelum = { bomId: po.bomId, plannedQty: des(po.plannedQty).toString(), lokasiBahan: po.materialLocationId, lokasiHasil: po.outputLocationId, date: po.date.toISOString().slice(0, 10), note: po.note }
    const sesudah = { bomId: d.bomId, plannedQty: d.plannedQty.toString(), lokasiBahan: la.id, lokasiHasil: lb.id, date: d.date.toISOString().slice(0, 10), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    const salinUlang = sebelum.bomId !== sesudah.bomId || sebelum.plannedQty !== sesudah.plannedQty
    if (salinUlang) {
      const b = await bomSiap(tx, d.bomId)
      const baris = barisDariBom(b, d.plannedQty)
      await tx.productionOrderLine.deleteMany({ where: { productionOrderId: id } })
      await tx.productionOrderLine.createMany({ data: baris.map((x) => ({ ...x, productionOrderId: id })) })
    }
    await tx.productionOrder.update({ where: { id }, data: { bomId: d.bomId, plannedQty: d.plannedQty, materialLocationId: la.id, outputLocationId: lb.id, date: d.date, note: d.note, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'perintah.ubah', docType: JENIS, docId: id, summary: `Mengubah draf perintah produksi ${po.no}${salinUlang ? ', baris bahan disalin ulang dari BOM' : ''}`, before: sebelum, after: sesudah })
    return 1
  })
}

export async function hapusPerintah(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU_PERINTAH, 'H')
  return db.$transaction(async (tx) => {
    const po = await kunci(tx, id)
    if (po.status !== 'Draft') throw new GalatAturan('Perintah produksi tidak ditemukan atau bukan Draft.')
    if (await tx.materialIssue.count({ where: { productionOrderId: id } })) throw new GalatAturan('Perintah ini sudah punya pengeluaran bahan.')
    await tx.productionOrder.delete({ where: { id } })
    await catatAudit(tx, k, { action: 'perintah.hapus', docType: JENIS, docId: id, summary: `Menghapus draf perintah produksi ${po.no}`, before: { no: po.no, status: po.status } })
  })
}

export type AksiPerintah = 'ajukan' | 'kembalikan' | 'setujui' | 'batal' | 'tutup'

const NAMA: Record<AksiPerintah, string> = { ajukan: 'mengajukan', kembalikan: 'mengembalikan ke draf', setujui: 'menyetujui', batal: 'membatalkan', tutup: 'menutup' }

// Dokumen turunan yang belum Batal (pengeluaran bahan dan hasil produksi).
async function turunanHidup(tx: Tx, id: number) {
  const [keluar, hasil] = await Promise.all([
    tx.materialIssue.groupBy({ by: ['status'], where: { productionOrderId: id, status: { not: 'Batal' } }, _count: { _all: true } }),
    tx.productionResult.groupBy({ by: ['status'], where: { productionOrderId: id, status: { not: 'Batal' } }, _count: { _all: true } }),
  ])
  const n = (g: { status: DocStatus; _count: { _all: number } }[], s?: DocStatus[]) => g.filter((x) => !s || s.includes(x.status)).reduce((a, x) => a + x._count._all, 0)
  return { semua: n(keluar) + n(hasil), diposting: n(keluar, ['Diposting']) + n(hasil, ['Diposting']), terbuka: n(keluar, ['Draft', 'Diajukan']) + n(hasil, ['Draft', 'Diajukan']) }
}

// Satu pintu perubahan status perintah produksi, termasuk izin, transisi, dokumen turunan, dan audit.
export async function ubahStatusPerintah(db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiPerintah, opsi: { alasan?: string } = {}) {
  pastikanIzin(aktor, MENU_PERINTAH, 'L')
  return db.$transaction(async (tx) => {
    const po = await kunci(tx, id)
    const setuju = await butuhSetujuPerintah(tx)
    const sekarang = new Date()
    const alasan = (opsi.alasan ?? '').trim()
    if (alasan.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
    const tolak = () => {
      throw new GalatAturan(`Perintah produksi berstatus ${po.status} tidak bisa ${NAMA[aksi]}.`)
    }
    let data: Prisma.ProductionOrderUpdateInput
    let ringkas = `${NAMA[aksi][0].toUpperCase()}${NAMA[aksi].slice(1)} perintah produksi ${po.no}`
    let sesudah: Record<string, unknown> = {}
    if (aksi === 'ajukan') {
      pastikanSalahSatu(aktor, MENU_PERINTAH, ['T', 'U'])
      if (!transisiSah('rencana', po.status, 'Diajukan')) tolak()
      data = { status: 'Diajukan', submittedBy: aktor.id, submittedAt: sekarang }
    } else if (aksi === 'kembalikan') {
      if (!transisiSah('rencana', po.status, 'Draft')) tolak()
      if (!punyaIzin(aktor.izin, MENU_PERINTAH, 'S') && po.submittedBy !== aktor.id) throw new GalatIzin(MENU_PERINTAH, 'S')
      data = { status: 'Draft', submittedBy: null, submittedAt: null }
    } else if (aksi === 'setujui') {
      pastikanIzin(aktor, MENU_PERINTAH, 'S')
      if (!transisiSah('rencana', po.status, 'Disetujui', { butuhSetuju: setuju })) {
        if (setuju && po.status === 'Draft') throw new GalatAturan('Perintah produksi perlu diajukan dulu sebelum disetujui.')
        tolak()
      }
      periksaTanggal(aktor, po.date)
      if (!(await tx.productionOrderLine.count({ where: { productionOrderId: id } }))) throw new GalatAturan('Perintah ini belum punya baris bahan.')
      data = { status: 'Disetujui', approvedBy: aktor.id, approvedAt: sekarang }
    } else if (aksi === 'batal') {
      pastikanIzin(aktor, MENU_PERINTAH, 'U')
      if (!transisiSah('rencana', po.status, 'Batal')) tolak()
      // RANCANGAN 2.3 butir 2: perintah yang punya dokumen turunan dibatalkan sesudah turunannya dibatalkan.
      const t = await turunanHidup(tx, id)
      if (t.semua) throw new GalatAturan('Perintah ini masih punya pengeluaran bahan atau hasil produksi yang belum Batal. Batalkan dokumen itu dulu.')
      data = { status: 'Batal', cancelledBy: aktor.id, cancelledAt: sekarang, cancelReason: alasan || null }
      if (alasan) ringkas += `. Alasan: ${alasan}`
    } else {
      // Tutup manual: sisa qty tidak diproduksi lagi dan sisa nilai barang dalam proses dibuang ke Selisih Produksi.
      pastikanIzin(aktor, MENU_PERINTAH, 'S')
      if (!transisiSah('rencana', po.status, 'Selesai')) tolak()
      if (alasan.length < 5) throw new GalatAturan('Tulis alasan penutupan, minimal 5 huruf.', 'alasan')
      const t = await turunanHidup(tx, id)
      if (t.terbuka) throw new GalatAturan('Masih ada pengeluaran bahan atau hasil produksi berstatus Draft atau Diajukan. Posting atau batalkan dulu.')
      data = { status: 'Selesai', closedBy: aktor.id, closedAt: sekarang, closeReason: alasan, wipValue: 0n, wipWriteOff: po.wipValue }
      ringkas = `Menutup perintah produksi ${po.no} (${formatQty(po.producedQty)} dari ${formatQty(po.plannedQty)} dihasilkan), sisa nilai dalam proses ${formatNilai(po.wipValue)} ke Selisih Produksi. Alasan: ${alasan}`
      sesudah = { producedQty: po.producedQty, wipWriteOff: po.wipValue, closeReason: alasan }
    }
    await tx.productionOrder.update({ where: { id }, data: { ...data, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: `perintah.${aksi}`, docType: JENIS, docId: id, summary: ringkas, before: { status: po.status }, after: { status: data.status, ...sesudah } })
    return data.status as DocStatus
  })
}

// Perintah produksi wajib lewat Diajukan bila approval_rule production_order meminta persetujuan (bawaan: tidak).
export const butuhSetujuPerintah = async (db: DbAtauTx) => !!(await db.approvalRule.findUnique({ where: { docType: JENIS } }))?.requiresApproval

// Tombol yang ditawarkan di layar rincian. Server memeriksa ulang di ubahStatusPerintah.
export function tombolPerintah(aktor: Aktor, status: DocStatus, butuhSetuju: boolean, submittedBy: number | null) {
  const izin = (a: 'T' | 'U' | 'H' | 'S') => punyaIzin(aktor.izin, MENU_PERINTAH, a)
  return {
    ubah: status === 'Draft' && (izin('T') || izin('U')),
    hapus: status === 'Draft' && izin('H'),
    ajukan: status === 'Draft' && (izin('T') || izin('U')),
    kembalikan: status === 'Diajukan' && (izin('S') || submittedBy === aktor.id),
    setujui: ((status === 'Draft' && !butuhSetuju) || status === 'Diajukan') && izin('S'),
    batal: ['Draft', 'Diajukan', 'Disetujui'].includes(status) && izin('U'),
    tutup: status === 'Disetujui' && izin('S'),
  }
}

// Progres produksi turunan (RANCANGAN 2.1): Belum, Sebagian, Penuh dari qty dihasilkan lawan qty rencana.
export const progres = (dihasilkan: Prisma.Decimal | string, rencana: Prisma.Decimal | string) => {
  const a = des(dihasilkan)
  return a.lte(0) ? 'Belum' : a.gte(des(rencana)) ? 'Penuh' : 'Sebagian'
}

export const STATUS_PERINTAH = ['Draft', 'Diajukan', 'Disetujui', 'Selesai', 'Batal'] as const

export async function daftarPerintah(db: Db, s: SaringDok) {
  const hal = sesuaiHalaman(s.hal)
  const status = (STATUS_PERINTAH as readonly string[]).includes(s.status ?? '') ? (s.status as DocStatus) : undefined
  const lokasi = s.lokasi && /^\d+$/.test(s.lokasi) ? Number(s.lokasi) : undefined
  const tgl = (t?: string) => (t && /^\d{4}-\d{2}-\d{2}$/.test(t) && !Number.isNaN(new Date(`${t}T00:00:00Z`).getTime()) ? new Date(`${t}T00:00:00Z`) : undefined)
  const dari = tgl(s.dari)
  const sampai = tgl(s.sampai)
  const q = s.q?.trim().slice(0, 30)
  const where: Prisma.ProductionOrderWhereInput = {
    ...(status ? { status } : {}),
    ...(lokasi ? { OR: [{ materialLocationId: lokasi }, { outputLocationId: lokasi }] } : {}),
    ...(dari || sampai ? { date: { ...(dari ? { gte: dari } : {}), ...(sampai ? { lte: sampai } : {}) } } : {}),
    ...(q ? { no: { contains: q.toUpperCase() } } : {}),
  }
  const [baris, total] = await Promise.all([
    db.productionOrder.findMany({
      where,
      include: { bom: { include: { product: { include: { baseUnit: true } } } }, materialLocation: true, outputLocation: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (hal - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    db.productionOrder.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export const muatPerintah = (db: DbAtauTx, id: number) =>
  db.productionOrder.findUnique({
    where: { id },
    include: {
      bom: { include: { product: { include: { baseUnit: true } } } },
      materialLocation: true,
      outputLocation: true,
      productionOrderLines: { include: { product: { include: { baseUnit: true } } }, orderBy: { id: 'asc' } },
      materialIssues: { orderBy: { id: 'asc' }, include: { location: true } },
      productionResults: { orderBy: { id: 'asc' }, include: { location: true } },
    },
  })

// Perintah yang boleh diberi pengeluaran bahan atau hasil produksi.
export const perintahBerjalan = (db: DbAtauTx) =>
  db.productionOrder.findMany({ where: { status: 'Disetujui' }, include: { bom: { include: { product: { include: { baseUnit: true } } } } }, orderBy: { id: 'desc' }, take: 200 })

// Qty bersih yang sudah keluar ke proses per baris perintah.
export const bersihKeluar = (l: { issuedQty: Prisma.Decimal; returnedQty: Prisma.Decimal }) => des(l.issuedQty).minus(des(l.returnedQty))
export const batasKeluar = (l: { requiredQty: Prisma.Decimal; tolPct: Prisma.Decimal }) => des(l.requiredQty).times(des(l.tolPct).div(100).plus(1)).toDecimalPlaces(3, Desimal.ROUND_HALF_UP)
export { NOL }
