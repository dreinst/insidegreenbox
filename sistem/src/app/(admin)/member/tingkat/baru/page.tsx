import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { tambahTingkatAksi } from '../../aksi'
import { medanTingkat } from '../../medan'

export const metadata: Metadata = { title: 'Tambah tingkat' }

export default async function TingkatBaru() {
  await wajibIzin('menu.tingkat', 'T')
  return (
    <>
      <KepalaHalaman judul="Tambah tingkat" keterangan="Sesudah disimpan, tingkat semua member dihitung ulang." jejak={{ href: '/member/tingkat', label: 'Tingkat' }} />
      <PesanMaster />
      <section className="kartu">
        <FormMaster aksi={tambahTingkatAksi} medan={medanTingkat()} tombol="Simpan tingkat" />
      </section>
    </>
  )
}
