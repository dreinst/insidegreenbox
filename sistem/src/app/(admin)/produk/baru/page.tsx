import type { Metadata } from 'next'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { pilihanKategori, pilihanSatuan } from '@/lib/stok/produk'
import { tambahProdukAksi } from '../aksi'
import { medanProduk } from '../medan'

export const metadata: Metadata = { title: 'Tambah produk' }

export default async function ProdukBaru() {
  await wajibIzin('stok.produk', 'T')
  const [satuan, kategori] = await Promise.all([pilihanSatuan(db), pilihanKategori(db)])
  return (
    <>
      <KepalaHalaman judul="Tambah produk" keterangan="Produk baru langsung aktif. Konversi satuan beli bisa ditambah sesudah disimpan." jejak={{ href: '/produk', label: 'Produk dan Satuan' }} />
      <section className="kartu">
        <FormMaster aksi={tambahProdukAksi} medan={medanProduk(satuan, kategori)} tombol="Simpan produk" />
      </section>
    </>
  )
}
