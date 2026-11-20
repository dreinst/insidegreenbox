import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { tambahPelangganAksi } from '../../_jual/aksi'
import { medanPelanggan } from '../medan'

export const metadata: Metadata = { title: 'Tambah pelanggan' }

export default async function PelangganBaru() {
  await wajibIzin('b2b.pelanggan', 'T')
  return (
    <>
      <KepalaHalaman judul="Tambah pelanggan" jejak={{ href: '/pelanggan', label: 'Pelanggan' }} />
      <section className="kartu">
        <FormMaster aksi={tambahPelangganAksi} medan={medanPelanggan()} tombol="Simpan pelanggan" />
      </section>
    </>
  )
}
