// Pengeluaran Bahan (tahap 4B, RANCANGAN 5.2, setara Material Delivery dan Production Return ESB). Dokumen pelaksana.
// Jenis keluar: bahan keluar dari lokasi bahan dengan harga rata-rata dan nilainya menjadi barang dalam proses perintah
// (production_order.wip_value). Jenis kembali: bahan kembali ke lokasi dengan harga keluar terakhir perintah itu dan
// nilainya keluar dari barang dalam proses. Barang dalam proses tidak punya lokasi stok (KONTRAK 13). Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman, skemaTanggal } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, NOL, bacaAngka, des, formatNilai, formatQty, keRupiah } from '../stok/angka'
import { DOK_STOK, aturanSetuju, hapusDraf, pastikanSalahSatu, periksaTanggal, saringDok, ubahStatusDok, type Aktor, type AksiStatus, type KaitDok, type KepalaDok, type SaringDok } from '../stok/dokumen'
import { catatGerak } from '../stok/mesin'
import { batasKeluar, bersihKeluar } from './perintah'

const JENIS = 'material_issue' as const
const MENU = DOK_STOK[JENIS].menu

export const JENIS_KELUAR = { keluar: 'Keluar ke proses', kembali: 'Kembali dari proses' } as const

const idWajib = (label: string) => z.string().regex(/^\d+$/, `Pilih ${label}.`).transform(Number)

export const skemaPengeluaran = z.object({
  productionOrderId: idWajib('perintah produksi'),
  kind: z.enum(['keluar', 'kembali'], { message: 'Pilih keluar atau kembali.' }),
  locationId: idWajib('lokasi bahan'),
  date: skemaTanggal('Tanggal').transform((v, ctx) => {
    if (!v) {
      ctx.addIssue({ code: 'custom', message: 'Tanggal wajib diisi.' })
      return z.NEVER
    }
    return v
  }),
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export const skemaKepalaPengeluaran = skemaPengeluaran.pick({ locationId: true, date: true, note: true })

async function perintahDisetujui(tx: Tx, id: number) {
  await tx.$executeRaw`SELECT id FROM production_order WHERE id = ${id} FOR UPDATE`
  const po = await tx.productionOrder.findUnique({ where: { id }, include: { productionOrderLines: { include: { product: true }, orderBy: { id: 'asc' } } } })
  if (!po) throw new GalatAturan('Perintah produksi tidak ditemukan.', 'productionOrderId')
  if (po.status !== 'Disetujui') throw new GalatAturan(`Perintah produksi ${po.no} berstatus ${po.status}. Pengeluaran bahan hanya untuk perintah yang Disetujui.`, 'productionOrderId')
  return po
}

async function lokasiAktif(tx: Tx, id: number) {
  const l = await tx.location.findUnique({ where: { id } })
  if (!l || !l.active) throw new GalatAturan('Lokasi tidak ditemukan atau nonaktif.', 'locationId')
  return l
}

// Draf dibuat dengan baris dari perintah: jenis keluar berisi sisa kebutuhan, jenis kembali berisi 0 (diisi pengguna).
export async function buatPengeluaran(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaPengeluaran.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const po = await perintahDisetujui(tx, d.productionOrderId)
    const l = await lokasiAktif(tx, d.locationId)
    const baris = po.productionOrderLines.map((b) => {
      const sisa = des(b.requiredQty).minus(bersihKeluar(b))
      return { productionOrderLineId: b.id, productId: b.productId, qty: d.kind === 'keluar' && sisa.gt(0) ? sisa : NOL }
    })
    const no = await ambilNomor(tx, JENIS, DOK_STOK[JENIS].awalan, d.date)
    const dok = await tx.materialIssue.create({
      data: { no, productionOrderId: po.id, locationId: l.id, kind: d.kind, date: d.date, note: d.note, createdBy: aktor.id, updatedBy: aktor.id, materialIssueLines: { create: baris } },
    })
    await catatAudit(tx, k, {
      action: 'pengeluaran.tambah',
      docType: JENIS,
      docId: dok.id,
      summary: `Membuat draf pengeluaran bahan ${no} (${JENIS_KELUAR[d.kind].toLowerCase()}) untuk ${po.no} di ${l.name}`,
      after: { no, perintah: po.no, kind: d.kind, lokasi: l.name, date: d.date, baris: baris.length },
    })
    return dok
  })
}

async function muatDraf(tx: Tx, id: number) {
  await tx.$executeRaw`SELECT id FROM material_issue WHERE id = ${id} FOR UPDATE`
  const dok = await tx.materialIssue.findUnique({ where: { id }, include: { location: true, materialIssueLines: { include: { product: true } } } })
  if (!dok) throw new GalatAturan('Pengeluaran bahan tidak ditemukan.')
  if (dok.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return dok
}

export async function ubahKepalaPengeluaran(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaKepalaPengeluaran.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, id)
    const l = await lokasiAktif(tx, d.locationId)
    const sebelum = { lokasi: dok.location.name, date: dok.date.toISOString().slice(0, 10), note: dok.note }
    const sesudah = { lokasi: l.name, date: d.date.toISOString().slice(0, 10), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    await tx.materialIssue.update({ where: { id }, data: { locationId: l.id, date: d.date, note: d.note, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'pengeluaran.ubah', docType: JENIS, docId: id, summary: `Mengubah kepala pengeluaran bahan ${dok.no}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Qty per baris dari formulir (qty_<id>). 0 berarti bahan itu tidak ikut dikeluarkan atau dikembalikan.
export async function ubahQtyPengeluaran(db: Db, k: Konteks, aktor: Aktor, id: number, isian: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, id)
    const galat: Record<string, string> = {}
    const ubah: { id: number; nama: string; lama: string; baru: Desimal }[] = []
    for (const b of dok.materialIssueLines) {
      const teks = String(isian[`qty_${b.id}`] ?? '').trim()
      const q = teks ? bacaAngka(teks) : NOL
      if (!q || q.isNeg() || q.decimalPlaces() > 3) {
        galat[`qty_${b.id}`] = `Qty ${b.product.name} harus angka 0 atau lebih, paling banyak 3 desimal.`
        continue
      }
      if (!q.eq(des(b.qty))) ubah.push({ id: b.id, nama: b.product.name, lama: des(b.qty).toString(), baru: q })
    }
    const kunci = Object.keys(galat)
    if (kunci.length) throw new GalatAturan(Object.values(galat)[0], kunci[0])
    if (!ubah.length) return 0
    for (const u of ubah) await tx.materialIssueLine.update({ where: { id: u.id }, data: { qty: u.baru } })
    await tx.materialIssue.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'pengeluaran.baris_ubah',
      docType: JENIS,
      docId: id,
      summary: `Mengubah qty ${ubah.length} bahan di ${dok.no}`,
      before: Object.fromEntries(ubah.map((u) => [u.nama, u.lama])),
      after: Object.fromEntries(ubah.map((u) => [u.nama, u.baru.toString()])),
    })
    return ubah.length
  })
}

type KepalaPengeluaran = KepalaDok & { productionOrderId: number; locationId: number; kind: string }

// Harga keluar terakhir per baris perintah, dipakai pengembalian bahan (RANCANGAN 5.2).
async function hargaKeluarTerakhir(tx: Tx, productionOrderId: number) {
  const baris = await tx.materialIssueLine.findMany({
    where: { materialIssue: { productionOrderId, kind: 'keluar', status: 'Diposting' }, qty: { gt: 0 } },
    orderBy: [{ materialIssue: { postedAt: 'desc' } }, { id: 'desc' }],
    select: { productionOrderLineId: true, unitCost: true },
  })
  const peta = new Map<number, Desimal>()
  for (const b of baris) if (!peta.has(b.productionOrderLineId)) peta.set(b.productionOrderLineId, des(b.unitCost))
  return peta
}

export const KAIT_PENGELUARAN: KaitDok<KepalaPengeluaran> = {
  jenis: JENIS,
  muat: (tx, id) => tx.materialIssue.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.materialIssue.update({ where: { id }, data }),
  butuhSetuju: (tx) => aturanSetuju(tx, JENIS),
  periksaAjukan: async (tx, d) => {
    if (!(await tx.materialIssueLine.count({ where: { materialIssueId: d.id, qty: { gt: 0 } } }))) throw new GalatAturan('Isi qty minimal satu bahan dulu.')
  },
  posting: async (tx, d, asal) => {
    const po = await perintahDisetujui(tx, d.productionOrderId)
    const perBaris = new Map(po.productionOrderLines.map((b) => [b.id, b]))
    const baris = (await tx.materialIssueLine.findMany({ where: { materialIssueId: d.id }, include: { product: { include: { baseUnit: true } } }, orderBy: { id: 'asc' } })).filter((b) => des(b.qty).gt(0))
    if (!baris.length) throw new GalatAturan('Isi qty minimal satu bahan dulu.')
    for (const b of baris) {
      const l = perBaris.get(b.productionOrderLineId)
      if (!l) throw new GalatAturan(`Baris ${b.product.name} tidak ada di perintah produksi.`)
      if (!b.product.active) throw new GalatAturan(`Produk ${b.product.name} sudah nonaktif.`)
      const bersih = bersihKeluar(l)
      if (d.kind === 'keluar') {
        const batas = batasKeluar(l)
        if (bersih.plus(des(b.qty)).gt(batas)) {
          throw new GalatAturan(`${b.product.name}: total keluar ${formatQty(bersih.plus(des(b.qty)))} ${b.product.baseUnit.symbol} melebihi kebutuhan ${formatQty(l.requiredQty)} ditambah toleransi ${formatQty(l.tolPct)}%.`)
        }
      } else if (des(b.qty).gt(bersih)) {
        throw new GalatAturan(`${b.product.name}: qty kembali ${formatQty(b.qty)} melebihi qty bersih yang sudah keluar (${formatQty(bersih)}).`)
      }
    }
    let nilai = 0n
    if (d.kind === 'keluar') {
      const hasil = await catatGerak(
        tx,
        asal,
        baris.map((b) => ({ productId: b.productId, locationId: d.locationId, qty: des(b.qty).neg(), lineId: b.id })),
      )
      for (const h of hasil) await tx.materialIssueLine.update({ where: { id: h.lineId! }, data: { unitCost: h.hargaSatuan } })
      nilai = hasil.reduce((n, h) => n - h.nilai, 0n)
      for (const b of baris) await tx.productionOrderLine.update({ where: { id: b.productionOrderLineId }, data: { issuedQty: { increment: b.qty } } })
    } else {
      const harga = await hargaKeluarTerakhir(tx, d.productionOrderId)
      const gerak = baris.map((b) => {
        const h = harga.get(b.productionOrderLineId) ?? NOL
        return { productId: b.productId, locationId: d.locationId, qty: des(b.qty), nilai: keRupiah(des(b.qty).times(h)), lineId: b.id }
      })
      nilai = -gerak.reduce((n, g) => n + g.nilai, 0n)
      if (po.wipValue + nilai < 0n) throw new GalatAturan(`Nilai bahan kembali ${formatNilai(-nilai)} melebihi nilai barang dalam proses ${po.no} (${formatNilai(po.wipValue)}).`)
      const hasil = await catatGerak(tx, asal, gerak)
      for (const h of hasil) await tx.materialIssueLine.update({ where: { id: h.lineId! }, data: { unitCost: h.hargaSatuan } })
      for (const b of baris) await tx.productionOrderLine.update({ where: { id: b.productionOrderLineId }, data: { returnedQty: { increment: b.qty } } })
    }
    await tx.productionOrder.update({ where: { id: po.id }, data: { wipValue: { increment: nilai } } })
    return {
      ringkas: `${baris.length} bahan ${d.kind === 'keluar' ? 'keluar ke' : 'kembali dari'} proses ${po.no}, nilai ${formatNilai(nilai < 0n ? -nilai : nilai)}`,
      sesudah: { baris: baris.length, nilaiProses: nilai, wipSesudah: po.wipValue + nilai },
    }
  },
  periksaBatalPosting: async (tx, d) => {
    await tx.$executeRaw`SELECT id FROM production_order WHERE id = ${d.productionOrderId} FOR UPDATE`
    const po = await tx.productionOrder.findUniqueOrThrow({ where: { id: d.productionOrderId }, include: { productionOrderLines: true } })
    if (po.status !== 'Disetujui') throw new GalatAturan(`Perintah produksi ${po.no} sudah ${po.status}, jadi pengeluaran bahannya tidak bisa dibatalkan lagi.`)
    if (d.kind === 'keluar') {
      if (await tx.productionResult.count({ where: { productionOrderId: po.id, status: 'Diposting' } })) {
        throw new GalatAturan(`Perintah ${po.no} sudah punya hasil produksi Diposting. Batalkan hasil produksinya dulu.`)
      }
      const baris = await tx.materialIssueLine.findMany({ where: { materialIssueId: d.id, qty: { gt: 0 } }, include: { product: true } })
      const perBaris = new Map(po.productionOrderLines.map((b) => [b.id, b]))
      for (const b of baris) {
        const l = perBaris.get(b.productionOrderLineId)!
        if (bersihKeluar(l).minus(des(b.qty)).isNeg()) throw new GalatAturan(`${b.product.name} sudah dikembalikan dari proses. Batalkan pengembaliannya dulu.`)
      }
    }
  },
  sesudahBatalPosting: async (tx, d, balik) => {
    // Gerak balik keluar bernilai plus (bahan kembali ke lokasi), jadi nilai dalam proses berkurang sebesar itu.
    const nilai = balik.reduce((n, g) => n + g.nilai, 0n)
    const baris = await tx.materialIssueLine.findMany({ where: { materialIssueId: d.id, qty: { gt: 0 } } })
    for (const b of baris) {
      await tx.productionOrderLine.update({ where: { id: b.productionOrderLineId }, data: d.kind === 'keluar' ? { issuedQty: { decrement: b.qty } } : { returnedQty: { decrement: b.qty } } })
    }
    const po = await tx.productionOrder.update({ where: { id: d.productionOrderId }, data: { wipValue: { decrement: nilai } } })
    return { nilaiProses: -nilai, wipSesudah: po.wipValue }
  },
}

export const ubahStatusPengeluaran = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiStatus, opsi: { alasan?: string } = {}) =>
  ubahStatusDok(db, k, aktor, KAIT_PENGELUARAN, id, aksi, opsi)

export const hapusPengeluaran = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDraf(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.materialIssue.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.materialIssue.delete({ where: { id } })
    return d
  })

export const muatPengeluaran = (db: Db, id: number) =>
  db.materialIssue.findUnique({
    where: { id },
    include: {
      location: true,
      productionOrder: { include: { bom: { include: { product: true } } } },
      materialIssueLines: { include: { product: { include: { baseUnit: true } }, productionOrderLine: true }, orderBy: { id: 'asc' } },
    },
  })

export async function daftarPengeluaran(db: Db, s: SaringDok) {
  const hal = sesuaiHalaman(s.hal)
  const { where: dasar, lokasi } = saringDok(s)
  const where = { ...dasar, ...(lokasi ? { locationId: lokasi } : {}) }
  const [baris, total] = await Promise.all([
    db.materialIssue.findMany({
      where,
      include: { location: true, productionOrder: { select: { no: true } }, _count: { select: { materialIssueLines: { where: { qty: { gt: 0 } } } } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (hal - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    db.materialIssue.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}
