'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { hapusBukti, simpanBukti } from '@/lib/bukti'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { konteksPermintaan } from '@/lib/sesi'
import { ajukanSetoran, batalSetoran, buatSetoranHarian, hapusSetoran, kembalikanSetoran, muatUlangSetoran, postingSetoran, ubahSetoran } from '@/lib/setoran'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k, v]) => !k.startsWith('$') && typeof v === 'string'))

export async function buatSetoranAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.setoran', 'T', async (p) => {
    const h = await buatSetoranHarian(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/setoran')
    const satu = [...h.dibuat, ...h.diperbarui]
    if (satu.length === 1) redirect(`/setoran/${satu[0].id}?pesan=${h.dibuat.length ? 'setoran-dibuat' : 'setoran-muat'}`)
    const t = String(fd.get('tanggal') ?? '')
    redirect(`/setoran?dari=${t}&sampai=${t}&pesan=setoran-dibuat`)
  })
}

export async function ubahSetoranAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.setoran', 'U', async (p) => {
    const berkas = fd.get('bukti')
    const hapus = fd.get('hapusBukti') === 'on'
    const baru = berkas instanceof File && berkas.size > 0 ? await simpanBukti(berkas) : null
    let hasil
    try {
      hasil = await ubahSetoran(db, await konteksPermintaan(p), p, id, data(fd), baru ?? (hapus ? null : undefined))
    } catch (e) {
      // Berkas yang baru disimpan dibuang lagi bila perubahan gagal.
      await hapusBukti(baru)
      throw e
    }
    await hapusBukti(hasil.buktiLama)
    revalidatePath(`/setoran/${id}`)
    redirect(`/setoran/${id}?pesan=${hasil.berubah ? 'setoran-tersimpan' : 'tetap'}`)
  })
}

export async function muatUlangAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.setoran', 'U', async (p) => {
    const h = await muatUlangSetoran(db, await konteksPermintaan(p), p, id)
    revalidatePath(`/setoran/${id}`)
    redirect(`/setoran/${id}?pesan=${h.periksa ? 'setoran-periksa' : h.berubah ? 'setoran-berubah' : h.baru ? 'setoran-muat' : 'tetap'}`)
  })
}

export async function ajukanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.setoran', 'U', async (p) => {
    await ajukanSetoran(db, await konteksPermintaan(p), p, id)
    revalidatePath('/setoran')
    redirect(`/setoran/${id}?pesan=setoran-ajukan`)
  })
}

// Izin dicek di modul: penyetuju atau pengaju sendiri. Di sini cukup Lihat supaya pengaju tanpa Setujui bisa lewat.
export async function kembalikanAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.setoran', 'L', async (p) => {
    await kembalikanSetoran(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/setoran')
    redirect(`/setoran/${id}?pesan=setoran-kembali`)
  })
}

export async function postingAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.setoran', 'P', async (p) => {
    await postingSetoran(db, await konteksPermintaan(p), p, id)
    revalidatePath('/setoran')
    redirect(`/setoran/${id}?pesan=setoran-posting`)
  })
}

export async function batalAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.setoran', 'U', async (p) => {
    await batalSetoran(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/setoran')
    redirect(`/setoran/${id}?pesan=setoran-batal`)
  })
}

export async function hapusAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'kasir.setoran', 'H', async (p) => {
    const st = await hapusSetoran(db, await konteksPermintaan(p), p, id)
    await hapusBukti(st.proofFile)
    revalidatePath('/setoran')
    redirect('/setoran?pesan=setoran-hapus')
  })
}
