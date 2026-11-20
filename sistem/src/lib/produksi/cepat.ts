// Produksi Cepat (tahap 4B, RANCANGAN 5.4, setara Simple Manufacturing ESB). Satu dokumen pelaksana untuk BOM Assembly x
// qty: saat Diposting bahan keluar dari lokasi bahan dengan harga rata-rata dan hasil masuk ke lokasi hasil dengan nilai
// bahan + biaya tambahan, sekaligus lewat olahStok. Tanpa barang dalam proses. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, DbAtauTx, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { PER_HALAMAN, sesuaiHalaman, skemaTanggal } from '../master'
import { ambilNomor } from '../nomor'
import { Desimal, NOL, bacaAngka, des, formatNilai, formatQty, keRupiah, skemaQty, skemaQtyOpsional } from '../stok/angka'
import { DOK_STOK, aturanSetuju, hapusDraf, pastikanSalahSatu, periksaTanggal, saringDok, ubahStatusDok, type Aktor, type AksiStatus, type KaitDok, type KepalaDok, type SaringDok } from '../stok/dokumen'
import { olahStok } from '../stok/mesin'

const JENIS = 'quick_production' as const
const MENU = DOK_STOK[JENIS].menu

const idWajib = (label: string) => z.string().regex(/^\d+$/, `Pilih ${label}.`).transform(Number)

export const skemaCepat = z
  .object({
    bomId: idWajib('BOM assembly'),
    qty: skemaQty({ label: 'Jumlah batch' }),
    outputQty: skemaQtyOpsional({ label: 'Qty hasil' }),
    fromLocationId: idWajib('lokasi bahan'),
    toLocationId: idWajib('lokasi hasil'),
    date: skemaTanggal('Tanggal').transform((v, ctx) => {
      if (!v) {
        ctx.addIssue({ code: 'custom', message: 'Tanggal wajib diisi.' })
        return z.NEVER
      }
      return v
    }),
    note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
  })

const bulat3 = (x: Desimal) => x.toDecimalPlaces(3, Desimal.ROUND_HALF_UP)

async function bomSiap(tx: DbAtauTx, bomId: number) {
  const b = await tx.bom.findUnique({ where: { id: bomId }, include: { product: { include: { baseUnit: true } }, bomLines: { orderBy: { id: 'asc' }, include: { product: true } } } })
  if (!b || b.kind !== 'assembly' || !b.active) throw new GalatAturan('Pilih BOM assembly yang aktif.', 'bomId')
  if (!b.product || !b.product.active) throw new GalatAturan('Produk hasil BOM ini tidak ada atau nonaktif.', 'bomId')
  if (!b.bomLines.length) throw new GalatAturan('BOM ini belum punya bahan.', 'bomId')
  return b
}

async function duaLokasi(tx: DbAtauTx, dari: number, ke: number) {
  const [a, b] = await Promise.all([tx.location.findUnique({ where: { id: dari } }), tx.location.findUnique({ where: { id: ke } })])
  if (!a || !a.active) throw new GalatAturan('Lokasi bahan tidak ditemukan atau nonaktif.', 'fromLocationId')
  if (!b || !b.active) throw new GalatAturan('Lokasi hasil tidak ditemukan atau nonaktif.', 'toLocationId')
  return [a, b] as const
}

// Qty sistem per bahan = qty BOM x jumlah batch; qty aktual awalnya sama. Qty hasil bawaan = qty hasil BOM x jumlah batch.
function susun(b: Awaited<ReturnType<typeof bomSiap>>, batch: Desimal, outputQty: Desimal | null) {
  const baris = b.bomLines.map((l) => {
    const q = bulat3(des(l.qty).times(batch))
    if (!q.gt(0)) throw new GalatAturan(`Jumlah batch terlalu kecil: qty ${l.product.name} menjadi 0.`, 'qty')
    return { productId: l.productId, systemQty: q, qty: q }
  })
  const hasil = outputQty ?? bulat3(des(b.outputQty).times(batch))
  if (!hasil.gt(0)) throw new GalatAturan('Qty hasil harus lebih dari 0.', 'outputQty')
  return { baris, hasil, biaya: keRupiah(new Desimal(b.extraCost.toString()).times(batch)) }
}

export async function buatCepat(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaCepat.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const b = await bomSiap(tx, d.bomId)
    const [la, lb] = await duaLokasi(tx, d.fromLocationId, d.toLocationId)
    const s = susun(b, d.qty, d.outputQty)
    const no = await ambilNomor(tx, JENIS, DOK_STOK[JENIS].awalan, d.date)
    const dok = await tx.quickProduction.create({
      data: {
        no,
        bomId: b.id,
        qty: d.qty,
        outputQty: s.hasil,
        extraCost: s.biaya,
        fromLocationId: la.id,
        toLocationId: lb.id,
        date: d.date,
        note: d.note,
        createdBy: aktor.id,
        updatedBy: aktor.id,
        quickProductionLines: { create: s.baris },
      },
    })
    await catatAudit(tx, k, {
      action: 'produksi_cepat.tambah',
      docType: JENIS,
      docId: dok.id,
      summary: `Membuat draf produksi cepat ${no}: ${formatQty(d.qty)} batch ${b.code} menjadi ${formatQty(s.hasil)} ${b.product!.baseUnit.symbol} ${b.product!.name}`,
      after: { no, bom: b.code, versiBom: b.version, qty: d.qty, outputQty: s.hasil, extraCost: s.biaya, dari: la.name, ke: lb.name, date: d.date },
    })
    return dok
  })
}

async function muatDraf(tx: Tx, id: number) {
  await tx.$executeRaw`SELECT id FROM quick_production WHERE id = ${id} FOR UPDATE`
  const dok = await tx.quickProduction.findUnique({ where: { id }, include: { quickProductionLines: { include: { product: true }, orderBy: { id: 'asc' } } } })
  if (!dok) throw new GalatAturan('Produksi cepat tidak ditemukan.')
  if (dok.status !== 'Draft') throw new GalatAturan('Hanya draf yang bisa diubah.')
  return dok
}

// Ubah kepala draf. BOM atau jumlah batch yang berubah menyusun ulang baris bahan dari BOM.
export async function ubahKepalaCepat(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  const d = skemaCepat.parse(masukan)
  periksaTanggal(aktor, d.date)
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, id)
    const [la, lb] = await duaLokasi(tx, d.fromLocationId, d.toLocationId)
    const susunUlang = dok.bomId !== d.bomId || !des(dok.qty).eq(d.qty)
    const b = await bomSiap(tx, d.bomId)
    const s = susun(b, d.qty, susunUlang ? d.outputQty : (d.outputQty ?? des(dok.outputQty)))
    const sebelum = { bomId: dok.bomId, qty: des(dok.qty).toString(), outputQty: des(dok.outputQty).toString(), dari: dok.fromLocationId, ke: dok.toLocationId, date: dok.date.toISOString().slice(0, 10), note: dok.note }
    const sesudah = { bomId: d.bomId, qty: d.qty.toString(), outputQty: s.hasil.toString(), dari: la.id, ke: lb.id, date: d.date.toISOString().slice(0, 10), note: d.note }
    if (JSON.stringify(sebelum) === JSON.stringify(sesudah)) return 0
    if (susunUlang) {
      await tx.quickProductionLine.deleteMany({ where: { quickProductionId: id } })
      await tx.quickProductionLine.createMany({ data: s.baris.map((x) => ({ ...x, quickProductionId: id })) })
    }
    await tx.quickProduction.update({
      where: { id },
      data: { bomId: d.bomId, qty: d.qty, outputQty: s.hasil, extraCost: susunUlang ? s.biaya : dok.extraCost, fromLocationId: la.id, toLocationId: lb.id, date: d.date, note: d.note, updatedBy: aktor.id },
    })
    await catatAudit(tx, k, { action: 'produksi_cepat.ubah', docType: JENIS, docId: id, summary: `Mengubah draf produksi cepat ${dok.no}${susunUlang ? ', baris bahan disusun ulang dari BOM' : ''}`, before: sebelum, after: sesudah })
    return 1
  })
}

// Qty aktual per bahan dari formulir (qty_<id>). 0 berarti bahan itu tidak dipakai.
export async function ubahQtyCepat(db: Db, k: Konteks, aktor: Aktor, id: number, isian: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const dok = await muatDraf(tx, id)
    const ubah: { id: number; nama: string; lama: string; baru: Desimal }[] = []
    for (const b of dok.quickProductionLines) {
      const teks = String(isian[`qty_${b.id}`] ?? '').trim()
      const q = teks ? bacaAngka(teks) : NOL
      if (!q || q.isNeg() || q.decimalPlaces() > 3) throw new GalatAturan(`Qty ${b.product.name} harus angka 0 atau lebih, paling banyak 3 desimal.`, `qty_${b.id}`)
      if (!q.eq(des(b.qty))) ubah.push({ id: b.id, nama: b.product.name, lama: des(b.qty).toString(), baru: q })
    }
    if (!ubah.length) return 0
    for (const u of ubah) await tx.quickProductionLine.update({ where: { id: u.id }, data: { qty: u.baru } })
    await tx.quickProduction.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'produksi_cepat.baris_ubah',
      docType: JENIS,
      docId: id,
      summary: `Mengubah qty aktual ${ubah.length} bahan di ${dok.no}`,
      before: Object.fromEntries(ubah.map((u) => [u.nama, u.lama])),
      after: Object.fromEntries(ubah.map((u) => [u.nama, u.baru.toString()])),
    })
    return ubah.length
  })
}

// Bahan yang qty aktualnya menyimpang dari qty sistem lebih dari toleransi BOM (RANCANGAN 5.4).
export function menyimpang<T extends { systemQty: Desimal; qty: Desimal; tolPct: Desimal }>(baris: T[]) {
  return baris.filter((b) => {
    if (!b.systemQty.gt(0)) return b.qty.gt(0)
    return b.qty.minus(b.systemQty).abs().div(b.systemQty).times(100).gt(b.tolPct)
  })
}

type KepalaCepat = KepalaDok & { bomId: number; fromLocationId: number; toLocationId: number; outputQty: Desimal; extraCost: bigint; note: string }

export const KAIT_CEPAT: KaitDok<KepalaCepat> = {
  jenis: JENIS,
  muat: (tx, id) => tx.quickProduction.findUnique({ where: { id } }),
  simpan: (tx, id, data) => tx.quickProduction.update({ where: { id }, data }),
  butuhSetuju: (tx) => aturanSetuju(tx, JENIS),
  periksaAjukan: async (tx, d) => {
    if (!(await tx.quickProductionLine.count({ where: { quickProductionId: d.id, qty: { gt: 0 } } }))) throw new GalatAturan('Isi qty aktual minimal satu bahan dulu.')
  },
  posting: async (tx, d, asal) => {
    const b = await tx.bom.findUnique({ where: { id: d.bomId }, include: { product: { include: { baseUnit: true } }, bomLines: true } })
    if (!b?.product || !b.product.active) throw new GalatAturan('Produk hasil BOM ini tidak ada atau nonaktif.')
    const toleransi = new Map(b.bomLines.map((l) => [l.productId, des(l.tolPct)]))
    const semua = await tx.quickProductionLine.findMany({ where: { quickProductionId: d.id }, include: { product: true }, orderBy: { id: 'asc' } })
    const baris = semua.filter((x) => des(x.qty).gt(0))
    if (!baris.length) throw new GalatAturan('Isi qty aktual minimal satu bahan dulu.')
    for (const x of baris) if (!x.product.active) throw new GalatAturan(`Bahan ${x.product.name} sudah nonaktif.`)
    const lewat = menyimpang(semua.map((x) => ({ ...x, systemQty: des(x.systemQty), qty: des(x.qty), tolPct: toleransi.get(x.productId) ?? new Desimal(0) })))
    if (lewat.length && d.note.trim().length < 5) {
      throw new GalatAturan(`Qty aktual ${lewat.map((x) => x.product.name).join(', ')} menyimpang dari BOM lebih dari toleransinya. Tulis alasannya di catatan (minimal 5 huruf), lalu posting lagi.`)
    }
    const hasil = await olahStok(
      tx,
      asal,
      baris.map((x) => ({ productId: x.productId, locationId: d.fromLocationId, qty: des(x.qty).neg(), lineId: x.id })),
      { productId: b.product.id, locationId: d.toLocationId, qty: d.outputQty, biayaTambahan: d.extraCost },
    )
    const masuk = hasil.at(-1)!
    for (const h of hasil.slice(0, -1)) await tx.quickProductionLine.update({ where: { id: h.lineId! }, data: { unitCost: h.hargaSatuan } })
    await tx.quickProduction.update({ where: { id: d.id }, data: { unitCost: masuk.hargaSatuan, value: masuk.nilai } })
    const nilaiBahan = masuk.nilai - d.extraCost
    return {
      ringkas: `${baris.length} bahan senilai ${formatNilai(nilaiBahan)} menjadi ${formatQty(d.outputQty)} ${b.product.baseUnit.symbol} ${b.product.name} senilai ${formatNilai(masuk.nilai)}${lewat.length ? ' (qty menyimpang, ada catatan)' : ''}`,
      sesudah: { bahan: baris.length, nilaiBahan, biayaTambahan: d.extraCost, nilaiHasil: masuk.nilai, menyimpang: lewat.map((x) => x.product.name) },
    }
  },
}

export const ubahStatusCepat = (db: Db, k: Konteks, aktor: Aktor, id: number, aksi: AksiStatus, opsi: { alasan?: string } = {}) => ubahStatusDok(db, k, aktor, KAIT_CEPAT, id, aksi, opsi)

export const hapusCepat = (db: Db, k: Konteks, aktor: Aktor, id: number) =>
  hapusDraf(db, k, aktor, JENIS, id, async (tx) => {
    const d = await tx.quickProduction.findUnique({ where: { id } })
    if (!d || d.status !== 'Draft') return null
    await tx.quickProduction.delete({ where: { id } })
    return d
  })

export const muatCepat = (db: Db, id: number) =>
  db.quickProduction.findUnique({
    where: { id },
    include: {
      fromLocation: true,
      toLocation: true,
      bom: { include: { product: { include: { baseUnit: true } }, bomLines: { select: { productId: true, tolPct: true } } } },
      quickProductionLines: { include: { product: { include: { baseUnit: true } } }, orderBy: { id: 'asc' } },
    },
  })

export async function daftarCepat(db: Db, s: SaringDok) {
  const hal = sesuaiHalaman(s.hal)
  const { where: dasar, lokasi } = saringDok(s)
  const where = { ...dasar, ...(lokasi ? { OR: [{ fromLocationId: lokasi }, { toLocationId: lokasi }] } : {}) }
  const [baris, total] = await Promise.all([
    db.quickProduction.findMany({
      where,
      include: { fromLocation: true, toLocation: true, bom: { select: { code: true, product: { select: { name: true, baseUnit: { select: { symbol: true } } } } } } },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
      skip: (hal - 1) * PER_HALAMAN,
      take: PER_HALAMAN,
    }),
    db.quickProduction.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}
