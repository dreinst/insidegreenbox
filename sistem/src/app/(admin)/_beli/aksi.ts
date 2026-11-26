'use server'
// Aksi server modul pembelian tahap 4C. Tipis: cek sesi dan izin awal lewat jalankanAksi, lalu fungsi modul di
// src/lib/beli yang memeriksa izin rinci, saklar, dan aturan di dalam transaksinya sendiri.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { GalatAturan, type HasilAksi } from '@/lib/aksi'
import { DOK_BELI, type AksiBeli, type JenisBeli } from '@/lib/beli/dokumen'
import { buatFaktur, hapusBarisFaktur, hapusFaktur, simpanBarisFaktur, tambahBiayaFaktur, tarikPenerimaan, ubahKepalaFaktur, ubahStatusFaktur } from '@/lib/beli/faktur'
import { buatLangsung, hapusBarisLangsung, hapusLangsung, tambahBarisLangsung, ubahKepalaLangsung, ubahStatusLangsung } from '@/lib/beli/langsung'
import { tambahPemasok, ubahPemasok, ubahStatusPemasok } from '@/lib/beli/pemasok'
import { buatPembayaran, hapusPembayaran, simpanAlokasi, ubahKepalaPembayaran, ubahStatusPembayaran } from '@/lib/beli/pembayaran'
import { buatPenerimaan, hapusPenerimaan, simpanBarisPenerimaan, ubahKepalaPenerimaan, ubahStatusPenerimaan } from '@/lib/beli/penerimaan'
import { buatPermintaan, hapusBarisPermintaan, hapusPermintaan, tambahBarisPermintaan, ubahKepalaPermintaan, ubahStatusPermintaan } from '@/lib/beli/permintaan'
import { buatPesanan, hapusBarisPesanan, hapusPesanan, simpanBarisPesanan, tambahBarisPesanan, ubahKepalaPesanan, ubahStatusPesanan } from '@/lib/beli/pesanan'
import { buatRetur, hapusRetur, simpanBarisRetur, ubahKepalaRetur, ubahStatusRetur } from '@/lib/beli/retur'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import type { Pengguna } from '@/lib/izin-inti'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([kunci]) => !kunci.startsWith('$')).map(([kunci, v]) => [kunci, typeof v === 'string' ? v : '']))

type Fn = (p: Pengguna, fd: FormData) => Promise<unknown>

// Jalankan isi aksi lalu alihkan ke rincian dokumen dengan kode pesan.
function aksiDok(jenis: JenisBeli, huruf: 'L' | 'T' | 'U' | 'H' | 'P', isi: Fn, tujuan: (hasil: unknown) => string) {
  return async (sebelum: HasilAksi, fd: FormData) =>
    jalankanAksi(sebelum, fd, DOK_BELI[jenis].menu, huruf, async (p) => {
      const h = await isi(p, fd)
      revalidatePath(DOK_BELI[jenis].jalur)
      redirect(tujuan(h))
    })
}

const k = async (p: Pengguna) => konteksPermintaan(p)
const ke = (jenis: JenisBeli, id: number, pesan: string) => `${DOK_BELI[jenis].jalur}/${id}?pesan=${pesan}`

// ===== Pemasok =====
export async function tambahPemasokAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'beli.pemasok', 'T', async (p) => {
    const s = await tambahPemasok(db, await k(p), p, data(fd))
    revalidatePath('/pemasok')
    redirect(`/pemasok/${s.id}?pesan=dibuat`)
  })
}
export async function ubahPemasokAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'beli.pemasok', 'U', async (p) => {
    const n = await ubahPemasok(db, await k(p), p, id, data(fd))
    revalidatePath('/pemasok')
    redirect(`/pemasok/${id}?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}
export async function statusPemasokAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'beli.pemasok', 'U', async (p) => {
    await ubahStatusPemasok(db, await k(p), p, id, aktif)
    revalidatePath('/pemasok')
    redirect(`/pemasok/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

// ===== Status dan hapus draf, semua dokumen =====
const UBAH_STATUS: Record<JenisBeli, (p: Pengguna, id: number, aksi: AksiBeli, alasan: string) => Promise<unknown>> = {
  purchase_request: async (p, id, a, alasan) => ubahStatusPermintaan(db, await k(p), p, id, a, { alasan }),
  purchase_order: async (p, id, a, alasan) => ubahStatusPesanan(db, await k(p), p, id, a, { alasan }),
  goods_receipt: async (p, id, a, alasan) => ubahStatusPenerimaan(db, await k(p), p, id, a, { alasan }),
  purchase_invoice: async (p, id, a, alasan) => ubahStatusFaktur(db, await k(p), p, id, a, { alasan }),
  purchase_return: async (p, id, a, alasan) => ubahStatusRetur(db, await k(p), p, id, a, { alasan }),
  direct_purchase: async (p, id, a, alasan) => ubahStatusLangsung(db, await k(p), p, id, a, { alasan }),
  purchase_payment: async (p, id, a, alasan) => ubahStatusPembayaran(db, await k(p), p, id, a, { alasan }),
}

const HAPUS: Record<JenisBeli, (p: Pengguna, id: number) => Promise<unknown>> = {
  purchase_request: async (p, id) => hapusPermintaan(db, await k(p), p, id),
  purchase_order: async (p, id) => hapusPesanan(db, await k(p), p, id),
  goods_receipt: async (p, id) => hapusPenerimaan(db, await k(p), p, id),
  purchase_invoice: async (p, id) => hapusFaktur(db, await k(p), p, id),
  purchase_return: async (p, id) => hapusRetur(db, await k(p), p, id),
  direct_purchase: async (p, id) => hapusLangsung(db, await k(p), p, id),
  purchase_payment: async (p, id) => hapusPembayaran(db, await k(p), p, id),
}

export async function statusBeliAksi(jenis: JenisBeli, id: number, aksi: AksiBeli, sebelum: HasilAksi, fd: FormData) {
  if (!(jenis in DOK_BELI)) throw new Error('Jenis dokumen tidak dikenal.')
  return jalankanAksi(sebelum, fd, DOK_BELI[jenis].menu, aksi === 'posting' ? 'P' : 'L', async (p) => {
    const lama = aksi === 'batal' ? await statusSaatIni(jenis, id) : null
    await UBAH_STATUS[jenis](p, id, aksi, String(fd.get('alasan') ?? ''))
    revalidatePath(DOK_BELI[jenis].jalur)
    redirect(ke(jenis, id, aksi === 'batal' && lama === 'Diposting' ? 'batal_posting' : aksi))
  })
}

async function statusSaatIni(jenis: JenisBeli, id: number) {
  const pilih = { where: { id }, select: { status: true } } as const
  const d =
    jenis === 'goods_receipt'
      ? await db.goodsReceipt.findUnique(pilih)
      : jenis === 'purchase_invoice'
        ? await db.purchaseInvoice.findUnique(pilih)
        : jenis === 'purchase_return'
          ? await db.purchaseReturn.findUnique(pilih)
          : jenis === 'direct_purchase'
            ? await db.directPurchase.findUnique(pilih)
            : jenis === 'purchase_payment'
              ? await db.purchasePayment.findUnique(pilih)
              : null
  return d?.status ?? null
}

export async function hapusBeliAksi(jenis: JenisBeli, id: number, sebelum: HasilAksi, fd: FormData) {
  if (!(jenis in DOK_BELI)) throw new Error('Jenis dokumen tidak dikenal.')
  return jalankanAksi(sebelum, fd, DOK_BELI[jenis].menu, 'H', async (p) => {
    await HAPUS[jenis](p, id)
    revalidatePath(DOK_BELI[jenis].jalur)
    redirect(`${DOK_BELI[jenis].jalur}?pesan=dihapus`)
  })
}

// ===== Permintaan =====
export async function buatPermintaanAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_request', 'T', async (p, fd) => buatPermintaan(db, await k(p), p, data(fd)), (h) => ke('purchase_request', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaPermintaanAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_request', 'L', async (p) => ubahKepalaPermintaan(db, await k(p), p, id, data(fd)), (n) => ke('purchase_request', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function tambahBarisPermintaanAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_request', 'L', async (p) => tambahBarisPermintaan(db, await k(p), p, id, data(fd)), () => ke('purchase_request', id, 'baris'))(s, fd)
}
export async function hapusBarisPermintaanAksi(id: number, baris: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_request', 'L', async (p) => hapusBarisPermintaan(db, await k(p), p, id, baris), () => ke('purchase_request', id, 'baris_hapus'))(s, fd)
}
// Pesanan dari permintaan: dibuat oleh pemegang Tambah di beli.pesanan.
export async function pesanDariPermintaanAksi(prId: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_order', 'T', async (p) => buatPesanan(db, await k(p), p, data(fd), prId), (h) => ke('purchase_order', (h as { id: number }).id, 'draf'))(s, fd)
}

// ===== Pesanan =====
export async function buatPesananAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_order', 'T', async (p, fd) => buatPesanan(db, await k(p), p, data(fd)), (h) => ke('purchase_order', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaPesananAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_order', 'L', async (p) => ubahKepalaPesanan(db, await k(p), p, id, data(fd)), (n) => ke('purchase_order', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function tambahBarisPesananAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_order', 'L', async (p) => tambahBarisPesanan(db, await k(p), p, id, data(fd)), () => ke('purchase_order', id, 'baris'))(s, fd)
}
export async function simpanBarisPesananAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_order', 'L', async (p) => simpanBarisPesanan(db, await k(p), p, id, data(fd)), (n) => ke('purchase_order', id, n ? 'baris' : 'tetap'))(s, fd)
}
export async function hapusBarisPesananAksi(id: number, baris: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_order', 'L', async (p) => hapusBarisPesanan(db, await k(p), p, id, baris), () => ke('purchase_order', id, 'baris_hapus'))(s, fd)
}

// ===== Penerimaan =====
export async function buatPenerimaanAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('goods_receipt', 'T', async (p, fd) => buatPenerimaan(db, await k(p), p, data(fd)), (h) => ke('goods_receipt', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaPenerimaanAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('goods_receipt', 'L', async (p) => ubahKepalaPenerimaan(db, await k(p), p, id, data(fd)), (n) => ke('goods_receipt', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function simpanBarisPenerimaanAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('goods_receipt', 'L', async (p) => simpanBarisPenerimaan(db, await k(p), p, id, data(fd)), (n) => ke('goods_receipt', id, n ? 'baris' : 'tetap'))(s, fd)
}

// ===== Faktur =====
export async function buatFakturAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_invoice', 'T', async (p, fd) => buatFaktur(db, await k(p), p, data(fd)), (h) => ke('purchase_invoice', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaFakturAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_invoice', 'L', async (p) => ubahKepalaFaktur(db, await k(p), p, id, data(fd)), (n) => ke('purchase_invoice', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function tarikPenerimaanAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok(
    'purchase_invoice',
    'L',
    async (p) => {
      const gr = String(fd.get('goodsReceiptId') ?? '')
      if (!/^\d+$/.test(gr)) throw new GalatAturan('Pilih penerimaan barang.', 'goodsReceiptId')
      return tarikPenerimaan(db, await k(p), p, id, Number(gr))
    },
    () => ke('purchase_invoice', id, 'tarik'),
  )(s, fd)
}
export async function tambahBiayaFakturAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_invoice', 'L', async (p) => tambahBiayaFaktur(db, await k(p), p, id, data(fd)), () => ke('purchase_invoice', id, 'baris'))(s, fd)
}
export async function simpanBarisFakturAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_invoice', 'L', async (p) => simpanBarisFaktur(db, await k(p), p, id, data(fd)), (n) => ke('purchase_invoice', id, n ? 'baris' : 'tetap'))(s, fd)
}
export async function hapusBarisFakturAksi(id: number, baris: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_invoice', 'L', async (p) => hapusBarisFaktur(db, await k(p), p, id, baris), () => ke('purchase_invoice', id, 'baris_hapus'))(s, fd)
}

// ===== Retur =====
export async function buatReturAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_return', 'T', async (p, fd) => buatRetur(db, await k(p), p, data(fd)), (h) => ke('purchase_return', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaReturAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_return', 'L', async (p) => ubahKepalaRetur(db, await k(p), p, id, data(fd)), (n) => ke('purchase_return', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function simpanBarisReturAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_return', 'L', async (p) => simpanBarisRetur(db, await k(p), p, id, data(fd)), (n) => ke('purchase_return', id, n ? 'baris' : 'tetap'))(s, fd)
}

// ===== Pembelian langsung =====
export async function buatLangsungAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('direct_purchase', 'T', async (p, fd) => buatLangsung(db, await k(p), p, data(fd)), (h) => ke('direct_purchase', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaLangsungAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('direct_purchase', 'L', async (p) => ubahKepalaLangsung(db, await k(p), p, id, data(fd)), (n) => ke('direct_purchase', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function tambahBarisLangsungAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('direct_purchase', 'L', async (p) => tambahBarisLangsung(db, await k(p), p, id, data(fd)), () => ke('direct_purchase', id, 'baris'))(s, fd)
}
export async function hapusBarisLangsungAksi(id: number, baris: number, s: HasilAksi, fd: FormData) {
  return aksiDok('direct_purchase', 'L', async (p) => hapusBarisLangsung(db, await k(p), p, id, baris), () => ke('direct_purchase', id, 'baris_hapus'))(s, fd)
}

// ===== Pembayaran =====
export async function buatPembayaranAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_payment', 'T', async (p, fd) => buatPembayaran(db, await k(p), p, data(fd)), (h) => ke('purchase_payment', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaPembayaranAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_payment', 'L', async (p) => ubahKepalaPembayaran(db, await k(p), p, id, data(fd)), (n) => ke('purchase_payment', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function simpanAlokasiAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('purchase_payment', 'L', async (p) => simpanAlokasi(db, await k(p), p, id, data(fd)), () => ke('purchase_payment', id, 'alokasi'))(s, fd)
}
