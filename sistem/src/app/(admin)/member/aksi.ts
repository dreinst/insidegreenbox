'use server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { jalankanAksi } from '@/lib/izin'
import { tambahMember, tambahTingkat, ubahMember, ubahStatusMember, ubahStatusTingkat, ubahTingkat } from '@/lib/member'
import { konteksPermintaan } from '@/lib/sesi'

const data = (fd: FormData) => Object.fromEntries([...fd.entries()].filter(([k]) => !k.startsWith('$')))

export async function tambahMemberAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.member', 'T', async (p) => {
    const m = await tambahMember(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/member')
    redirect(`/member/${m.id}?pesan=dibuat`)
  })
}

export async function ubahMemberAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.member', 'U', async (p) => {
    const { berubah } = await ubahMember(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/member')
    redirect(`/member/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusMemberAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.member', 'U', async (p) => {
    await ubahStatusMember(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/member')
    redirect(`/member/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}

export async function tambahTingkatAksi(sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.tingkat', 'T', async (p) => {
    const t = await tambahTingkat(db, await konteksPermintaan(p), p, data(fd))
    revalidatePath('/member', 'layout')
    redirect(`/member/tingkat/${t.id}?pesan=dibuat`)
  })
}

export async function ubahTingkatAksi(id: number, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.tingkat', 'U', async (p) => {
    const { berubah } = await ubahTingkat(db, await konteksPermintaan(p), p, id, data(fd))
    revalidatePath('/member', 'layout')
    redirect(`/member/tingkat/${id}?pesan=${berubah ? 'tersimpan' : 'tetap'}`)
  })
}

export async function statusTingkatAksi(id: number, aktif: boolean, sebelum: HasilAksi, fd: FormData) {
  return jalankanAksi(sebelum, fd, 'menu.tingkat', 'U', async (p) => {
    await ubahStatusTingkat(db, await konteksPermintaan(p), p, id, aktif)
    revalidatePath('/member', 'layout')
    redirect(`/member/tingkat/${id}?pesan=${aktif ? 'aktif' : 'nonaktif'}`)
  })
}
