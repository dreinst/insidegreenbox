import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { tambahLokasiAksi } from '../aksi'
import { medanLokasi } from '../medan'

export const metadata: Metadata = { title: 'Tambah lokasi' }

export default async function LokasiBaru() {
  await wajibIzin('atur.lokasi', 'T')
  return (
    <>
      <KepalaHalaman judul="Tambah lokasi" keterangan="Lokasi baru langsung aktif dan bisa dipakai di dokumen stok." jejak={{ href: '/lokasi', label: 'Lokasi' }} />
      <section className="kartu">
        <FormMaster aksi={tambahLokasiAksi} medan={medanLokasi()} tombol="Simpan lokasi" />
      </section>
    </>
  )
}
