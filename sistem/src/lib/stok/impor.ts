// Impor bahan dan stok awal dari admin lama (tahap 4A, KONTRAK 11). Sumbernya tabel ING di src/admin/contoh.ts
// (data contoh admin lama di localStorage) yang disalin ke sini karena berkas itu tidak bisa diimpor dari Node.
// Idempoten: produk yang kodenya sudah ada dilewati, dan saldo awal hanya dibuat untuk produk yang belum punya gerak
// di lokasi tujuan. Saldo awal masuk lewat satu Penyesuaian Stok berasalan "Saldo awal" yang langsung Diposting.
import { jurnalDokStok } from '../akuntansi/dokumen'
import { catatAudit, type Konteks } from '../audit'
import type { Db } from '../db'
import { ambilNomor } from '../nomor'
import { des, formatNilai } from './angka'
import { KODE_SALDO_AWAL, isiBawaanStok } from './bawaan'
import { hariIni } from './dokumen'
import { catatGerak } from './mesin'

// [id, nama, satuan, stok akhir, stok minimum, harga rata-rata per satuan] dari admin lama.
export const BAHAN_LAMA: [string, string, string, number, number, number][] = [
  ['kopi', 'Biji kopi', 'gram', 2400, 1000, 320],
  ['susu', 'Susu segar', 'ml', 14500, 6000, 18],
  ['gula', 'Gula pasir', 'gram', 3800, 1500, 16],
  ['es', 'Es batu', 'gram', 22000, 8000, 3],
  ['cup', 'Cup dan tutup', 'pcs', 260, 100, 750],
  ['madu', 'Sirup madu', 'ml', 900, 500, 55],
  ['lemon', 'Lemon', 'iris', 34, 40, 500],
  ['teh', 'Teh hitam', 'gram', 450, 200, 160],
  ['matcha', 'Bubuk matcha', 'gram', 260, 150, 700],
  ['whip', 'Whipping cream', 'ml', 480, 500, 62],
  ['nasi', 'Nasi matang', 'gram', 9000, 4000, 14],
  ['ayam', 'Dada ayam', 'gram', 3600, 2000, 42],
  ['telur', 'Telur', 'butir', 46, 30, 2400],
  ['kentang', 'Kentang', 'gram', 5200, 3000, 22],
  ['roti', 'Roti sando', 'pcs', 22, 12, 3500],
  ['beef', 'Roast beef', 'gram', 60, 400, 150],
  ['sayur', 'Sayur salad', 'gram', 1900, 1000, 30],
  ['berry', 'Sirup mixed berries', 'ml', 1100, 500, 70],
  ['cokelat', 'Bubuk cokelat 70%', 'gram', 700, 300, 280],
  ['oolong', 'Teh oolong', 'gram', 300, 150, 200],
  ['pecan', 'Pecan praline', 'gram', 400, 150, 220],
  ['soda', 'Soda dan air mineral', 'ml', 6000, 2000, 5],
  ['kaleng', 'Kaleng RTD kosong', 'pcs', 120, 40, 1800],
  ['pasta', 'Pasta kering', 'gram', 4000, 1500, 25],
  ['wijen', 'Saus wijen', 'ml', 1200, 400, 60],
  ['tepung', 'Tepung bumbu dan terigu', 'gram', 3000, 1000, 20],
  ['enoki', 'Jamur enoki', 'gram', 1500, 600, 70],
  ['biskuit', 'Biskuit remah', 'gram', 800, 300, 45],
]

const SATUAN_LAMA: Record<string, string> = { gram: 'gram', ml: 'mililiter', pcs: 'pcs', iris: 'iris', butir: 'butir' }

const KATEGORI_LAMA: Record<string, string[]> = {
  'Bahan minuman': ['kopi', 'susu', 'gula', 'es', 'madu', 'lemon', 'teh', 'matcha', 'whip', 'berry', 'cokelat', 'oolong', 'pecan', 'soda'],
  'Bahan makanan': ['nasi', 'ayam', 'telur', 'kentang', 'roti', 'beef', 'sayur', 'pasta', 'wijen', 'tepung', 'enoki', 'biskuit'],
  Kemasan: ['cup', 'kaleng'],
}

export const kodeBahan = (id: string) => `BHN-${id.toUpperCase()}`
export const CATATAN_IMPOR = 'Saldo awal dari admin lama (impor).'

const KONTEKS_IMPOR: Konteks = { userId: null, actorName: 'impor', ip: 'lokal', userAgent: 'impor-stok' }

export async function imporStok(db: Db, opsi: { lokasi?: string; konteks?: Konteks } = {}) {
  const k = opsi.konteks ?? KONTEKS_IMPOR
  await isiBawaanStok(db)
  const lokasi = await db.location.findUniqueOrThrow({ where: { code: opsi.lokasi ?? 'OUTLET' } })
  const alasan = await db.stockReason.findUniqueOrThrow({ where: { code: KODE_SALDO_AWAL } })
  const satuan = new Map((await db.unit.findMany()).map((u) => [u.name, u.id]))

  let kategoriBaru = 0
  const idKategori = new Map<string, number>()
  for (const nama of Object.keys(KATEGORI_LAMA)) {
    const ada = await db.productCategory.findFirst({ where: { name: { equals: nama, mode: 'insensitive' } } })
    if (ada) idKategori.set(nama, ada.id)
    else {
      idKategori.set(nama, (await db.productCategory.create({ data: { name: nama, kind: 'bahan' } })).id)
      kategoriBaru++
    }
  }
  const kategoriDari = (id: string) => idKategori.get(Object.entries(KATEGORI_LAMA).find(([, isi]) => isi.includes(id))?.[0] ?? 'Bahan minuman')!

  let produkBaru = 0
  for (const [id, nama, sat, , min, rata] of BAHAN_LAMA) {
    if (await db.product.findUnique({ where: { code: kodeBahan(id) } })) continue
    await db.product.create({
      data: { code: kodeBahan(id), name: nama, kind: 'bahan', categoryId: kategoriDari(id), baseUnitId: satuan.get(SATUAN_LAMA[sat])!, minStock: min, lastCost: rata, purchasable: true },
    })
    produkBaru++
  }

  // Saldo awal hanya untuk bahan yang belum punya gerak di lokasi tujuan.
  const produk = await db.product.findMany({ where: { code: { in: BAHAN_LAMA.map(([id]) => kodeBahan(id)) } } })
  const sudahBergerak = new Set(
    (await db.stockLedger.findMany({ where: { locationId: lokasi.id, productId: { in: produk.map((p) => p.id) } }, distinct: ['productId'], select: { productId: true } })).map((g) => g.productId),
  )
  const perKode = new Map(produk.map((p) => [p.code, p]))
  const baris = BAHAN_LAMA.filter(([id, , , stok]) => stok > 0 && !sudahBergerak.has(perKode.get(kodeBahan(id))!.id))

  let dokumen: { no: string; nilai: bigint } | null = null
  if (baris.length) {
    dokumen = await db.$transaction(async (tx) => {
      const tanggal = hariIni()
      const no = await ambilNomor(tx, 'stock_adjustment', 'PS', tanggal)
      const sekarang = new Date()
      const dok = await tx.stockAdjustment.create({
        data: {
          no,
          locationId: lokasi.id,
          date: tanggal,
          note: CATATAN_IMPOR,
          stockAdjustmentLines: {
            create: baris.map(([id, , , stok, , rata]) => ({ productId: perKode.get(kodeBahan(id))!.id, reasonId: alasan.id, direction: 'tambah', qty: stok, unitCost: rata })),
          },
        },
        include: { stockAdjustmentLines: true },
      })
      const hasil = await catatGerak(
        tx,
        { docType: 'stock_adjustment', docId: dok.id, docNo: no, tanggal, oleh: null },
        dok.stockAdjustmentLines.map((b) => ({ productId: b.productId, locationId: lokasi.id, qty: des(b.qty), hargaSatuan: b.unitCost, lineId: b.id })),
      )
      await tx.stockAdjustment.update({ where: { id: dok.id }, data: { status: 'Diposting', postedAt: sekarang } })
      // tahap 5B: saldo awal dijurnal debit Persediaan kredit Ekuitas Saldo Awal (alasan saldo_awal).
      await jurnalDokStok(tx, 'stock_adjustment', dok.id, null)
      const nilai = hasil.reduce((n, h) => n + h.nilai, 0n)
      await catatAudit(tx, k, {
        action: 'penyesuaian.posting',
        docType: 'stock_adjustment',
        docId: dok.id,
        summary: `Impor memposting saldo awal ${no} di ${lokasi.name}: ${hasil.length} bahan, nilai ${formatNilai(nilai)}`,
        before: { status: 'Draft' },
        after: { status: 'Diposting', baris: hasil.length, nilaiBersih: nilai },
      })
      return { no, nilai }
    })
  }

  if (kategoriBaru || produkBaru || dokumen) {
    await catatAudit(db, k, {
      action: 'impor.stok',
      docType: 'product',
      summary: `Impor bahan admin lama: ${kategoriBaru} kategori, ${produkBaru} produk baru${dokumen ? `, saldo awal ${dokumen.no} senilai ${formatNilai(dokumen.nilai)}` : ''}`,
      after: { kategoriBaru, produkBaru, saldoAwal: dokumen?.no ?? null, baris: baris.length },
    })
  }
  return { kategoriBaru, produkBaru, saldoAwal: dokumen, baris: baris.length }
}
