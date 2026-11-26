import type { Metadata } from 'next'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { tambahPeranAksi } from '../aksi'
import { FormPeranBaru } from '../form'

export const metadata: Metadata = { title: 'Tambah peran' }

export default async function PeranBaru() {
  await wajibIzin('atur.peran', 'T')
  const peran = await db.role.findMany({ orderBy: { id: 'asc' } })
  return (
    <>
      <KepalaHalaman judul="Tambah peran" keterangan="Sesudah disimpan, atur izin per menu dan saklar fiturnya." jejak={{ href: '/peran', label: 'Peran dan Izin' }} />
      <section className="kartu">
        <FormPeranBaru aksi={tambahPeranAksi} sumber={peran.map((r) => ({ nilai: String(r.id), label: r.name }))} />
      </section>
    </>
  )
}
