import type { Metadata } from 'next'
import { PesanAkuntansi } from '@/components/akuntansi'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { pilihanInduk } from '@/lib/akuntansi/akun'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { tambahAkunAksi } from '../aksi'
import { medanAkun } from '../medan'

export const metadata: Metadata = { title: 'Tambah akun' }

export default async function AkunBaru() {
  await wajibIzin('akun.coa', 'T')
  const induk = await pilihanInduk(db)
  return (
    <>
      <KepalaHalaman judul="Tambah akun" keterangan="Akun baru langsung aktif. Supaya dipakai dokumen, pilih akun ini di tab Pemetaan." jejak={{ href: '/akun', label: 'Bagan Akun' }} />
      <PesanAkuntansi />
      <section className="kartu">
        <FormMaster aksi={tambahAkunAksi} medan={medanAkun({}, induk)} tombol="Simpan akun" />
      </section>
    </>
  )
}
