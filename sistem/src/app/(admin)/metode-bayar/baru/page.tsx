import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { wajibIzin } from '@/lib/izin'
import { tambahMetodeAksi } from '../aksi'
import { medanMetodeBaru } from '../medan'

export const metadata: Metadata = { title: 'Tambah metode bayar' }

export default async function MetodeBaru() {
  await wajibIzin('akun.metode_bayar', 'T')
  return (
    <>
      <KepalaHalaman judul="Tambah metode bayar" keterangan="Metode baru langsung aktif dan bisa dipilih di kasir." jejak={{ href: '/metode-bayar', label: 'Metode Bayar' }} />
      <PesanMaster />
      <section className="kartu">
        <FormMaster aksi={tambahMetodeAksi} medan={medanMetodeBaru()} tombol="Simpan metode" />
      </section>
    </>
  )
}
