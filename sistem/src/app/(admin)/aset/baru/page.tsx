import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanAset } from '@/components/aset'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { pilihanKategoriAset } from '@/lib/aset/kategori'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { hariIni } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { tambahAsetAksi } from '../../_aset/aksi'
import { medanAset } from '../medan'

export const metadata: Metadata = { title: 'Tambah aset' }

export default async function AsetBaru() {
  await wajibIzin('aset.daftar', 'T')
  const [kategori, lokasi, rekening] = await Promise.all([pilihanKategoriAset(db), pilihanLokasi(db), db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } })])
  return (
    <>
      <KepalaHalaman judul="Tambah aset" keterangan="Aset disimpan sebagai draf. Perolehan baru dijurnal saat Owner menekan Setujui dan aktifkan." jejak={{ href: '/aset', label: 'Aset Tetap' }} />
      <PesanAset />
      {kategori.length ? (
        <section className="kartu">
          <FormMaster aksi={tambahAsetAksi} medan={medanAset({ kategori, lokasi, rekening }, { acquiredDate: hariIni().toISOString().slice(0, 10) })} tombol="Simpan draf aset" />
        </section>
      ) : (
        <p className="kosong">
          Belum ada kategori aset aktif. <Link href="/aset/kategori">Buat kategori dulu</Link>.
        </p>
      )}
    </>
  )
}
