// Hasil Produksi (tahap 4B, RANCANGAN 5.3). Dokumen pelaksana. Saat Diposting, produk hasil BOM masuk ke lokasi hasil
// dengan nilai dari barang dalam proses perintahnya: wip_value x qty hasil / sisa qty rencana, dan pada hasil terakhir
// seluruh sisa nilai. Perintah menjadi Selesai otomatis saat qty dihasilkan mencapai qty rencana. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin, punyaIzin } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman, skemaTanggal } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, des, formatNilai, formatQty, keRupiah, skemaQty, skemaQtyOpsional } from '../stok/angka'
import { DOK_STOK, aturanSetuju, hapusDraf, pastikanSalahSatu, periksaTanggal, saringDok, ubahStatusDok, type Aktor, type AksiStatus, type KaitDok, type KepalaDok, type SaringDok } from '../stok/dokumen'
import { catatGerak } from '../stok/mesin'

const JENIS = 'production_result' as const
const MENU = DOK_STOK[JENIS].menu

// Hasil kumulatif boleh melebihi rencana sampai 10 persen; lebih dari itu butuh izin Setujui (Owner) (RANCANGAN 5.3).
export const LEBIH_HASIL_PERSEN = 10

const idWajib = (label: string) => z.string().regex(/^\d+$/, `Pilih ${label}.`).transform(Number)

const kepala = {
  locationId: idWajib('lokasi hasil'),
  date: skemaTanggal('Tanggal').transform((v, ctx) => {
    if (!v) {
      ctx.addIssue({ code: 'custom', message: 'Tanggal wajib diisi.' })
      return z.NEVER
    }
    return v
  }),
  qty: skemaQty({ label: 'Qty hasil' }),
  wasteQty: skemaQtyOpsional({ label: 'Qty susut', boleh0: true }).transform((v) => v ?? new Desimal(0)),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
}

export const skemaHasil = z.object({ productionOrderId: idWajib('perintah produksi'), ...kepala })
export const skemaKepalaHasil = z.object(kepala)

async function perintahDisetujui(tx: Tx, id: number) {
  await tx.$executeRaw`SELECT id FROM production_order WHERE id = ${id} FOR UPDATE`
  const po = await tx.productionOrder.findUnique({ where: { id }, include: { bom: { include: { product: { include: { baseUnit: true } } } } } })
  if (!po) throw new GalatAturan('Perintah produksi tidak ditemukan.', 'productionOrderId')
  if (po.status !== 'Disetujui') throw new GalatAturan(`Perintah produksi ${po.no} berstatus ${po.status}. Hasil produksi hanya untuk perintah yang Disetujui.`, 'productionOrderId')
  if (!po.bom.product) throw new GalatAturan('BOM perintah ini tidak punya produk hasil.')
  return po
}

async function lokasiAktif(tx: Tx, id: number) {
  const l = await tx.location.findUnique({ where: { id } })
  if (!l || !l.active) throw new GalatAturan('Lokasi tidak ditemukan atau nonaktif.', 'locationId')
  return l
}

export async function buatHasil(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaHasil.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const po = await perintahDisetujui(tx, d.productionOrderId)
    const l = await lokasiAktif(tx, d.locationId)
    const no = await ambilNomor(tx, JENIS, DOK_STOK[JENIS].awalan, d.date)
    const dok = await tx.productionResult.create({
      data: { no, productionOrderId: po.id, locationId: l.id, date: d.date, qty: d.qty, wasteQty: d.wasteQty, note: d.note, createdBy: aktor.id, updatedBy: aktor.id },
    })
    await catatAudit(tx, k, {
      action: 'hasil.tambah',
      docType: JENIS,
      docId: dok.id,
      summary: `Membuat draf hasil produksi ${no}: ${formatQty(d.qty)} ${po.bom.product!.baseUnit.symbol} ${po.bom.product!.name} untuk ${po.no}`,
      after: { no, perintah: po.no, lokasi: l.name, date: d.date, qty: d.qty, wasteQty: d.wasteQty },
    })
    return dok
  })
}

export async function ubahKepalaHasil(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaHasil.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM production_result WHERE id = ${id} FOR UPDATE`
    const dok = await tx.productionResult.findUnique({ where: { id }, include: { location: true } })
    if (!dok) throw new GalatAturan('Hasil produksi tidak ditemukan.')
    if (dok.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
    const l = await lokasiAktif(tx, d.locationId)
    const sebelum = { lokasi: dok.location.name, date: dok.date.toISOString().slice(0, 10), qty: des(dok.qty).toString(), wasteQty: des(dok.wasteQty).toString(), note: dok.note }
    const sesudah = { lokasi: l.name, date: d.date.toISOString().slice(0, 10), qty: d.qty.toString(), wasteQty: d.wasteQty.toString(), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.productionResult.update({ where: { id }, data: { locationId: l.id, date: d.date, qty: d.qty, wasteQty: d.wasteQty, note: d.note, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'hasil.ubah', docType: JENIS, docId: id, summary: `Mengubah draf hasil produksi ${dok.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Nilai hasil dari barang dalam proses: bagian sebanding dengan qty hasil atas sisa rencana, atau seluruhnya bila terakhir.
export function nilaiHasil(wip: bigint, qty: Desimal, dihasilkan: Desimal, rencana: Desimal) {
  const sisa = rencana.minus(dihasilkan)
  const terakhir = dihasilkan.plus(qty).gte(rencana)
  return { terakhir, nilai: terakhir || !sisa.gt(0) ? wip : keRupiah(new Desimal(wip.toString()).times(qty).div(sisa)) }
}

type KepalaHasil = KepalaDok & { productionOrderId: number; locationId: number; qty: Desimal }

export function kaitHasil(aktor: Aktor, k: Konteks): KaitDok<KepalaHasil> {
  return {
    jenis: JENIS,
    muat: (tx, id) => tx.productionResult.findUnique({ where: { id } }),
    simpan: (tx, id, data) => tx.productionResult.update({ where: { id }, data }),
    butuhSetuju: (tx) => aturanSetuju(tx, JENIS),
    posting: async (tx, d, asal) => {
      const po = await perintahDisetujui(tx, d.productionOrderId)
      const produk = po.bom.product!
      if (!produk.active) throw new GalatAturan(`Produk hasil ${produk.name} sudah nonaktif.`)
      if (!(await tx.materialIssue.count({ where: { productionOrderId: po.id, kind: 'keluar', status: 'Diposting' } }))) {
        throw new GalatAturan(`Perintah ${po.no} belum punya pengeluaran bahan yang Diposting.`)
      }
      const qty = des(d.qty)
      const dihasilkan = des(po.producedQty)
      const rencana = des(po.plannedQty)
      const batas = rencana.times(1 + LEBIH_HASIL_PERSEN / 100)
      if (dihasilkan.plus(qty).gt(batas) && !punyaIzin(aktor.izin, MENU, 'S')) {
        throw new GalatAturan(`Total hasil ${formatQty(dihasilkan.plus(qty))} melebihi rencana ${formatQty(rencana)} lebih dari ${LEBIH_HASIL_PERSEN}%. Minta Owner memposting.`)
      }
      const { terakhir, nilai } = nilaiHasil(po.wipValue, qty, dihasilkan, rencana)
      const [h] = await catatGerak(tx, asal, [{ productId: produk.id, locationId: d.locationId, qty, nilai }])
      await tx.productionResult.update({ where: { id: d.id }, data: { unitCost: h.hargaSatuan, value: nilai } })
      const selesai = new Date()
      await tx.productionOrder.update({
        where: { id: po.id },
        data: {
          producedQty: { increment: qty },
          wipValue: { decrement: nilai },
          ...(terakhir ? { status: 'Selesai', closedAt: selesai, closedBy: aktor.id, updatedBy: aktor.id } : {}),
        },
      })
      if (terakhir) {
        await catatAudit(tx, k, {
          action: 'perintah.selesai',
          docType: 'production_order',
          docId: po.id,
          summary: `Perintah produksi ${po.no} Selesai otomatis: ${formatQty(dihasilkan.plus(qty))} dari ${formatQty(rencana)} dihasilkan lewat ${d.no}`,
          before: { status: po.status },
          after: { status: 'Selesai', producedQty: dihasilkan.plus(qty).toString() },
        })
      }
      return {
        ringkas: `${formatQty(qty)} ${produk.baseUnit.symbol} ${produk.name} masuk dengan nilai ${formatNilai(nilai)}${terakhir ? `, ${po.no} Selesai` : ''}`,
        sesudah: { qty: qty.toString(), nilai, perintahSelesai: terakhir },
      }
    },
    periksaBatalPosting: async (tx, d) => {
      await tx.$executeRaw`SELECT id FROM production_order WHERE id = ${d.productionOrderId} FOR UPDATE`
      const po = await tx.productionOrder.findUniqueOrThrow({ where: { id: d.productionOrderId } })
      if (po.status !== 'Disetujui') throw new GalatAturan(`Perintah produksi ${po.no} sudah ${po.status}, jadi hasil produksinya tidak bisa dibatalkan lagi.`)
    },
    sesudahBatalPosting: async (tx, d, balik) => {
      // Gerak balik hasil bernilai minus (produk keluar lagi), dan nilainya kembali menjadi barang dalam proses.
      const nilai = -balik.reduce((n, g) => n + g.nilai, 0n)
      const po = await tx.productionOrder.update({ where: { id: d.productionOrderId }, data: { producedQty: { decrement: d.qty }, wipValue: { increment: nilai } } })
      return { nilaiKembaliKeProses: nilai, wipSesudah: po.wipValue }
    },
  }
}

export const ubahStatusHasil = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiStatus, opsi: { alasan?: string } = {}) =>
  ubahStatusDok(db, k, aktor, kaitHasil(aktor, k), id, aksi, opsi)

export const hapusHasil = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDraf(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.productionResult.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.productionResult.delete({ where: { id } })
    return d
  })

export const muatHasil = (db: Db, id: number) =>
  db.productionResult.findUnique({ where: { id }, include: { location: true, productionOrder: { include: { bom: { include: { product: { include: { baseUnit: true } } } } } } } })

export async function daftarHasil(db: Db, s: SaringDok) {
  const hal = sesuaiHalaman(s.hal)
  const { where: dasar, lokasi } = saringDok(s)
  const where = { ...dasar, ...(lokasi ? { locationId: lokasi } : {}) }
  const [baris, total] = await Promise.all([
    db.productionResult.findMany({
      where,
      include: { location: true, productionOrder: { select: { no: true, bom: { select: { product: { select: { name: true, baseUnit: { select: { symbol: true } } } } } } } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (hal - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    db.productionResult.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}
