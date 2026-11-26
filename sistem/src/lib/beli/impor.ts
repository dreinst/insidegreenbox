// Impor pemasok dan pesanan pembelian dari admin lama (tahap 4C, KONTRAK 11). Sumbernya data contoh admin lama di
// src/admin/contoh.ts (localStorage), disalin ke sini karena berkas itu tidak bisa diimpor dari Node. Idempoten:
// pemasok yang kodenya sudah ada dan pesanan yang legacy_no-nya sudah ada dilewati.
// PO lama berstatus "diterima" masuk sebagai riwayat: pesanan Selesai dengan qty diterima penuh tetapi tanpa Penerimaan
// Barang dan tanpa gerak stok, karena barangnya sudah termasuk saldo awal yang diimpor di tahap 4A. PO "dipesan" menjadi
// pesanan Disetujui yang masih bisa diterima, dan PO "draf" menjadi Draft. Butuh impor:stok lebih dulu (produk BHN-*).
import { catatAudit, type Konteks } from '../audit'
import type { Db } from '../db'
import { ambilNomor } from '../nomor'
import { hariIni } from '../stok/dokumen'
import { kodeBahan } from '../stok/impor'
import { nilaiBaris } from './dokumen'

// [id lama, kode baru, nama, kontak, catatan]
export const PEMASOK_LAMA: [string, string, string, string, string][] = [
  ['sp1', 'SUP-SP1', 'CV Sumber Biji Malang', '0341 555 0101', 'Kopi, cup, gula. Kirim Selasa dan Jumat.'],
  ['sp2', 'SUP-SP2', 'Pasar Besar dan Toko Segar', '0812 5550 0202', 'Susu, telur, ayam, sayur. Pesan sehari sebelumnya.'],
]

type PoLama = { no: string; pemasok: string; status: 'draf' | 'dipesan' | 'diterima'; mundur: number; note: string; lines: [string, number, number][] }

// Tanggal admin lama relatif terhadap hari dibuatnya data contoh, jadi disimpan sebagai jumlah hari mundur dari hari impor.
export const PO_LAMA: PoLama[] = [
  { no: 'PO-001', pemasok: 'sp1', status: 'diterima', mundur: 4, note: 'Stok kopi dan susu mingguan', lines: [['kopi', 1500, 340], ['susu', 10000, 17], ['cup', 100, 720]] },
  { no: 'PO-002', pemasok: 'sp2', status: 'dipesan', mundur: 1, note: 'Ayam, telur, sayur untuk akhir pekan', lines: [['ayam', 4000, 43], ['telur', 60, 2500], ['sayur', 2000, 31]] },
  { no: 'PO-003', pemasok: 'sp2', status: 'draf', mundur: 0, note: 'Roast beef dan roti, bahan Beef-Sando habis', lines: [['beef', 1500, 150], ['roti', 40, 3500]] },
]

const KONTEKS_IMPOR: Konteks = { userId: null, actorName: 'impor', ip: 'lokal', userAgent: 'impor-beli' }
export const CATATAN_RIWAYAT = 'Riwayat admin lama: barang sudah diterima dan termasuk saldo awal impor stok, jadi tidak ada penerimaan dan gerak stok.'

export async function imporBeli(db: Db, opsi: { konteks?: Konteks } = {}) {
  const k = opsi.konteks ?? KONTEKS_IMPOR
  const hasil = { pemasokBaru: 0, pesananBaru: 0, dilewati: [] as string[] }
  const idPemasok = new Map<string, number>()
  for (const [lama, code, name, phone, note] of PEMASOK_LAMA) {
    const ada = await db.supplier.findUnique({ where: { code } })
    if (ada) {
      idPemasok.set(lama, ada.id)
      continue
    }
    const s = await db.$transaction(async (tx) => {
      const s = await tx.supplier.create({ data: { code, name, phone, note } })
      await catatAudit(tx, k, { action: 'pemasok.tambah', docType: 'supplier', docId: s.id, summary: `Impor pemasok admin lama ${code} ${name}`, after: { code, name, phone, note } })
      return s
    })
    idPemasok.set(lama, s.id)
    hasil.pemasokBaru++
  }
  const lokasi = (await db.location.findUnique({ where: { code: 'OUTLET' } })) ?? (await db.location.findFirst({ where: { active: true }, orderBy: { id: 'asc' } }))
  if (!lokasi) throw new Error('Belum ada lokasi. Jalankan seed dulu.')
  const hari = hariIni()
  for (const po of PO_LAMA) {
    if (await db.purchaseOrder.findUnique({ where: { legacyNo: po.no } })) continue
    const produk = await db.product.findMany({ where: { code: { in: po.lines.map(([id]) => kodeBahan(id)) } } })
    const peta = new Map(produk.map((p) => [p.code, p]))
    const kurang = po.lines.filter(([id]) => !peta.has(kodeBahan(id))).map(([id]) => kodeBahan(id))
    if (kurang.length) {
      hasil.dilewati.push(`${po.no}: produk ${kurang.join(', ')} belum ada (jalankan impor:stok dulu)`)
      continue
    }
    const tanggal = new Date(hari.getTime() - po.mundur * 86_400_000)
    const status = po.status === 'diterima' ? 'Selesai' : po.status === 'dipesan' ? 'Disetujui' : 'Draft'
    await db.$transaction(async (tx) => {
      const no = await ambilNomor(tx, 'purchase_order', 'PO', tanggal)
      const baris = po.lines.map(([id, qty, price]) => {
        const p = peta.get(kodeBahan(id))!
        return { productId: p.id, unitId: p.baseUnitId, qty, price: BigInt(price), factor: 1, qtyReceived: po.status === 'diterima' ? qty : 0 }
      })
      const total = baris.reduce((n, b) => n + nilaiBaris(b.qty, b.price), 0n)
      const sekarang = new Date()
      const dok = await tx.purchaseOrder.create({
        data: {
          no,
          legacyNo: po.no,
          supplierId: idPemasok.get(po.pemasok)!,
          locationId: lokasi.id,
          date: tanggal,
          note: po.note,
          subtotal: total,
          total,
          status,
          receiveProgress: po.status === 'diterima' ? 'Penuh' : 'Belum',
          ...(status !== 'Draft' ? { approvedAt: sekarang, submittedAt: sekarang } : {}),
          ...(status === 'Selesai' ? { closedAt: sekarang, closeReason: CATATAN_RIWAYAT } : {}),
          purchaseOrderLines: { create: baris },
        },
      })
      await catatAudit(tx, k, {
        action: 'impor.beli',
        docType: 'purchase_order',
        docId: dok.id,
        summary: `Impor pesanan admin lama ${po.no} menjadi ${no} (${status})${status === 'Selesai' ? ' sebagai riwayat tanpa gerak stok' : ''}`,
        after: { no, legacyNo: po.no, status, total, baris: baris.length },
      })
    })
    hasil.pesananBaru++
  }
  return hasil
}
