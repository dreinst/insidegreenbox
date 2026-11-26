import type { Metadata } from 'next'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { peranBolehDiberi } from '@/lib/pengguna'
import { tambahPenggunaAksi } from '../aksi'
import { FormPenggunaBaru } from '../form'

export const metadata: Metadata = { title: 'Tambah pengguna' }

export default async function PenggunaBaru() {
  const p = await wajibIzin('atur.pengguna', 'T')
  // Hanya peran yang izinnya tercakup izin kamu sendiri (temuan audit A-2).
  const peran = await peranBolehDiberi(db, p)
  return (
    <>
      <KepalaHalaman judul="Tambah pengguna" keterangan="Pengguna baru langsung aktif dan bisa masuk dengan sandi yang kamu buat." jejak={{ href: '/pengguna', label: 'Pengguna' }} />
      <section className="kartu">
        <FormPenggunaBaru aksi={tambahPenggunaAksi} peran={peran.map((r) => ({ nilai: String(r.id), label: r.name }))} />
      </section>
    </>
  )
}
