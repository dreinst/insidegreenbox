'use server'
// Aksi server penjualan B2B tahap 6A. Tipis: cek sesi dan izin awal lewat jalankanAksi, lalu fungsi modul di src/lib/b2b
// yang memeriksa izin rinci, saklar, dan aturan di dalam transaksinya sendiri. Pola sama dengan _beli/aksi.ts.
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { buatFakturJual, hapusBarisFakturJual, hapusFakturJual, simpanBarisFakturJual, tambahBarisFakturJual, ubahKepalaFakturJual, ubahStatusFakturJual } from '@/lib/b2b/faktur'
import { hapusHargaPelanggan, simpanHargaPelanggan, tambahPelanggan, ubahPelanggan, ubahStatusPelanggan } from '@/lib/b2b/pelanggan'
import { buatTerima, hapusTerima, simpanAlokasiTerima, ubahKepalaTerima, ubahStatusTerima } from '@/lib/b2b/penerimaan'
import { buatPesananJual, hapusBarisPesananJual, hapusPesananJual, simpanBarisPesananJual, tambahBarisPesananJual, ubahKepalaPesananJual, ubahStatusPesananJual } from '@/lib/b2b/pesanan'
import { buatReturJual, hapusReturJual, simpanBarisReturJual, ubahKepalaReturJual, ubahStatusReturJual } from '@/lib/b2b/retur'
import { DOK_BELI, type AksiBeli, type JenisJual } from '@/lib/beli/dokumen'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import type { Pengguna } from '@/lib/izin-inti'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([kunci]) => !kunci.startsWith('$')).map(([kunci, v]) => [kunci, typeof v === 'string' ? v : '']))

type Fn = (p: Pengguna, fd: FormData) => Promise<unknown>

function aksiDok(jenis: JenisJual, huruf: 'L' | 'T' | 'U' | 'H' | 'P', isi: Fn, tujuan: (hasil: unknown) => string) {
  return async (sebelum: HasilAksi, fd: FormData) =>
    jalankanAksi(sebelum, fd, DOK_BELI[jenis].menu, huruf, async (p) => {
      const h = await isi(p, fd)
      revalidatePath(DOK_BELI[jenis].jalur)
      redirect(tujuan(h))
    })
}

const k = async (p: Pengguna) => konteksPermintaan(p)
const ke = (jenis: JenisJual, id: number, pesan: string) => `${DOK_BELI[jenis].jalur}/${id}?pesan=${pesan}`
const JUAL: JenisJual[] = ['sales_order', 'sales_invoice', 'customer_payment', 'sales_return']

// ===== Pelanggan =====
export async function tambahPelangganAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'b2b.pelanggan', 'T', async (p) => {
    const c = await tambahPelanggan(db, await k(p), p, data(fd))
    revalidatePath('/pelanggan')
    redirect(`/pelanggan/${c.id}?pesan=dibuat`)
  })
}
export async function ubahPelangganAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'b2b.pelanggan', 'U', async (p) => {
    const n = await ubahPelanggan(db, await k(p), p, id, data(fd))
    revalidatePath('/pelanggan')
    redirect(`/pelanggan/${id}?pesan=${n ? 'tersimpan' : 'tetap'}`)
  })
}
export async function statusPelangganAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'b2b.pelanggan', 'U', async (p) => {
    await ubahStatusPelanggan(db, await k(p), p, id, aktif)
    revalidatePath('/pelanggan')
    redirect(`/pelanggan/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}
export async function simpanHargaPelangganAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'b2b.pelanggan', 'U', async (p) => {
    const n = await simpanHargaPelanggan(db, await k(p), p, id, data(fd))
    revalidatePath(`/pelanggan/${id}`)
    redirect(`/pelanggan/${id}?pesan=${n ? 'harga' : 'tetap'}`)
  })
}
export async function hapusHargaPelangganAksi(id: number, hargaId: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'b2b.pelanggan', 'U', async (p) => {
    await hapusHargaPelanggan(db, await k(p), p, id, hargaId)
    revalidatePath(`/pelanggan/${id}`)
    redirect(`/pelanggan/${id}?pesan=harga_hapus`)
  })
}

// ===== Status dan hapus draf, semua dokumen =====
const UBAH_STATUS: Record<JenisJual, (p: Pengguna, id: number, aksi: AksiBeli, alasan: string) => Promise<unknown>> = {
  sales_order: async (p, id, a, alasan) => ubahStatusPesananJual(db, await k(p), p, id, a, { alasan }),
  sales_invoice: async (p, id, a, alasan) => ubahStatusFakturJual(db, await k(p), p, id, a, { alasan }),
  customer_payment: async (p, id, a, alasan) => ubahStatusTerima(db, await k(p), p, id, a, { alasan }),
  sales_return: async (p, id, a, alasan) => ubahStatusReturJual(db, await k(p), p, id, a, { alasan }),
}

const HAPUS: Record<JenisJual, (p: Pengguna, id: number) => Promise<unknown>> = {
  sales_order: async (p, id) => hapusPesananJual(db, await k(p), p, id),
  sales_invoice: async (p, id) => hapusFakturJual(db, await k(p), p, id),
  customer_payment: async (p, id) => hapusTerima(db, await k(p), p, id),
  sales_return: async (p, id) => hapusReturJual(db, await k(p), p, id),
}

async function statusSaatIni(jenis: JenisJual, id: number) {
  const pilih = { where: { id }, select: { status: true } } as const
  const d =
    jenis === 'sales_invoice'
      ? await db.salesInvoice.findUnique(pilih)
      : jenis === 'customer_payment'
        ? await db.customerPayment.findUnique(pilih)
        : jenis === 'sales_return'
          ? await db.salesReturn.findUnique(pilih)
          : null
  return d?.status ?? null
}

export async function statusJualAksi(jenis: JenisJual, id: number, aksi: AksiBeli, sebelum: HasilAksi, fd: FormData) {
  if (!JUAL.includes(jenis)) throw new Error('Jenis dokumen tidak dikenal.')
  return jalankanAksi(sebelum, fd, DOK_BELI[jenis].menu, aksi === 'posting' ? 'P' : 'L', async (p) => {
    const lama = aksi === 'batal' ? await statusSaatIni(jenis, id) : null
    await UBAH_STATUS[jenis](p, id, aksi, String(fd.get('alasan') ?? ''))
    revalidatePath(DOK_BELI[jenis].jalur)
    redirect(ke(jenis, id, aksi === 'batal' && lama === 'Diposting' ? 'batal_posting' : aksi))
  })
}

export async function hapusJualAksi(jenis: JenisJual, id: number, sebelum: HasilAksi, fd: FormData) {
  if (!JUAL.includes(jenis)) throw new Error('Jenis dokumen tidak dikenal.')
  return jalankanAksi(sebelum, fd, DOK_BELI[jenis].menu, 'H', async (p) => {
    await HAPUS[jenis](p, id)
    revalidatePath(DOK_BELI[jenis].jalur)
    redirect(`${DOK_BELI[jenis].jalur}?pesan=dihapus`)
  })
}

// ===== Pesanan penjualan =====
export async function buatPesananJualAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('sales_order', 'T', async (p, fd) => buatPesananJual(db, await k(p), p, data(fd)), (h) => ke('sales_order', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaPesananJualAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_order', 'L', async (p) => ubahKepalaPesananJual(db, await k(p), p, id, data(fd)), (n) => ke('sales_order', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function tambahBarisPesananJualAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_order', 'L', async (p) => tambahBarisPesananJual(db, await k(p), p, id, data(fd)), () => ke('sales_order', id, 'baris'))(s, fd)
}
export async function simpanBarisPesananJualAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_order', 'L', async (p) => simpanBarisPesananJual(db, await k(p), p, id, data(fd)), (n) => ke('sales_order', id, n ? 'baris' : 'tetap'))(s, fd)
}
export async function hapusBarisPesananJualAksi(id: number, baris: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_order', 'L', async (p) => hapusBarisPesananJual(db, await k(p), p, id, baris), () => ke('sales_order', id, 'baris_hapus'))(s, fd)
}

// ===== Faktur penjualan =====
export async function buatFakturJualAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('sales_invoice', 'T', async (p, fd) => buatFakturJual(db, await k(p), p, data(fd)), (h) => ke('sales_invoice', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaFakturJualAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_invoice', 'L', async (p) => ubahKepalaFakturJual(db, await k(p), p, id, data(fd)), (n) => ke('sales_invoice', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function tambahBarisFakturJualAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_invoice', 'L', async (p) => tambahBarisFakturJual(db, await k(p), p, id, data(fd)), () => ke('sales_invoice', id, 'baris'))(s, fd)
}
export async function simpanBarisFakturJualAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_invoice', 'L', async (p) => simpanBarisFakturJual(db, await k(p), p, id, data(fd)), (n) => ke('sales_invoice', id, n ? 'baris' : 'tetap'))(s, fd)
}
export async function hapusBarisFakturJualAksi(id: number, baris: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_invoice', 'L', async (p) => hapusBarisFakturJual(db, await k(p), p, id, baris), () => ke('sales_invoice', id, 'baris_hapus'))(s, fd)
}

// ===== Penerimaan pelanggan =====
export async function buatTerimaAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('customer_payment', 'T', async (p, fd) => buatTerima(db, await k(p), p, data(fd)), (h) => ke('customer_payment', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaTerimaAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('customer_payment', 'L', async (p) => ubahKepalaTerima(db, await k(p), p, id, data(fd)), (n) => ke('customer_payment', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function simpanAlokasiTerimaAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('customer_payment', 'L', async (p) => simpanAlokasiTerima(db, await k(p), p, id, data(fd)), () => ke('customer_payment', id, 'alokasi'))(s, fd)
}

// ===== Retur penjualan =====
export async function buatReturJualAksi(s: HasilAksi, fd: FormData) {
  return aksiDok('sales_return', 'T', async (p, fd) => buatReturJual(db, await k(p), p, data(fd)), (h) => ke('sales_return', (h as { id: number }).id, 'draf'))(s, fd)
}
export async function ubahKepalaReturJualAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_return', 'L', async (p) => ubahKepalaReturJual(db, await k(p), p, id, data(fd)), (n) => ke('sales_return', id, n ? 'tersimpan' : 'tetap'))(s, fd)
}
export async function simpanBarisReturJualAksi(id: number, s: HasilAksi, fd: FormData) {
  return aksiDok('sales_return', 'L', async (p) => simpanBarisReturJual(db, await k(p), p, id, data(fd)), (n) => ke('sales_return', id, n ? 'baris' : 'tetap'))(s, fd)
}
