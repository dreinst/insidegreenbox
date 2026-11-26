import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { tambahPemasokAksi } from '../../_beli/aksi'
import { medanPemasok } from '../medan'

export const metadata: Metadata = { title: 'Tambah pemasok' }

export default async function PemasokBaru() {
  await wajibIzin('beli.pemasok', 'T')
  return (
    <>
      <KepalaHalaman judul="Tambah pemasok" jejak={{ href: '/pemasok', label: 'Pemasok' }} />
      <section className="kartu">
        <FormMaster aksi={tambahPemasokAksi} medan={medanPemasok()} tombol="Simpan pemasok" />
      </section>
    </>
  )
}
