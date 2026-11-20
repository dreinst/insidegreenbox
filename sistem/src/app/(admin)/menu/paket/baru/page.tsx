import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { daftarFotoSitus } from '@/lib/foto'
import { wajibIzin } from '@/lib/izin'
import { tambahPaketAksi } from '../../aksi'
import { medanPaket } from '../../medan'

export const metadata: Metadata = { title: 'Tambah paket set' }

export default async function PaketBaru() {
  await wajibIzin('menu.menu', 'T')
  const [menu, foto] = await Promise.all([db.menuItem.findMany({ where: { active: true }, orderBy: [{ categoryRef: { sort: 'asc' } }, { sort: 'asc' }] }), daftarFotoSitus()])
  return (
    <>
      <KepalaHalaman judul="Tambah paket set" keterangan="Pilih satu menu utama dan satu minuman, lalu tentukan harga paketnya." jejak={{ href: '/menu/paket', label: 'Paket set' }} />
      <PesanMaster />
      <section className="kartu">
        <FormMaster aksi={tambahPaketAksi} medan={medanPaket(menu.map((m) => ({ nilai: String(m.id), label: m.name })), foto)} tombol="Simpan paket" />
      </section>
    </>
  )
}
