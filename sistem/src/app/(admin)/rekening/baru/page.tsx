import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { tambahRekeningAksi } from '../aksi'
import { medanRekening } from '../medan'

export const metadata: Metadata = { title: 'Tambah rekening bank' }

export default async function RekeningBaru() {
  await wajibIzin('kas.rekening', 'T')
  return (
    <>
      <KepalaHalaman judul="Tambah rekening bank" keterangan="Rekening baru langsung aktif dan bisa dipilih sebagai tujuan setoran." jejak={{ href: '/rekening', label: 'Rekening Bank' }} />
      <PesanMaster />
      <section className="kartu">
        <FormMaster aksi={tambahRekeningAksi} medan={medanRekening()} tombol="Simpan rekening" />
      </section>
    </>
  )
}
