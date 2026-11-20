import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { daftarFotoSitus } from '@/lib/foto'
import { wajibIzin } from '@/lib/izin'
import { tambahMenuAksi } from '../aksi'
import { medanMenu } from '../medan'

export const metadata: Metadata = { title: 'Tambah menu' }

export default async function MenuBaru() {
  await wajibIzin('menu.menu', 'T')
  const [kategori, foto] = await Promise.all([db.menuCategory.findMany({ where: { active: true }, orderBy: [{ sort: 'asc' }, { name: 'asc' }] }), daftarFotoSitus()])
  return (
    <>
      <KepalaHalaman judul="Tambah menu" keterangan="Menu baru langsung aktif dan bisa dipilih di kasir." jejak={{ href: '/menu', label: 'Menu' }} />
      <PesanMaster />
      <section className="kartu">
        {kategori.length ? (
          <FormMaster aksi={tambahMenuAksi} medan={medanMenu(kategori.map((c) => ({ nilai: c.code, label: c.name })), foto)} tombol="Simpan menu" />
        ) : (
          <p className="kosong">Belum ada kategori aktif. Tambahkan kategori dulu di tab Kategori.</p>
        )}
      </section>
    </>
  )
}
