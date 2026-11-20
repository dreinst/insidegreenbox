'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { voidPenjualan } from '@/lib/penjualan'
import { konteksPermintaan } from '@/lib/sesi'

// Lihat cukup untuk masuk ke aksi; hak void (izin Ubah dan saklar pos.void, atau PIN penyetuju) dicek di voidPenjualan.
export async function voidAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.transaksi', 'L', async (p) => {
    await voidPenjualan(db, await konteksPermintaan(p), p, id, {
      alasan: fd.get('alasan') ?? '',
      penyetujuId: fd.get('penyetujuId') ?? '',
      pinPenyetuju: fd.get('pinPenyetuju') ?? '',
    })
    revalidatePath('/transaksi')
    redirect(`/transaksi/${id}?pesan=void`)
  })
}
