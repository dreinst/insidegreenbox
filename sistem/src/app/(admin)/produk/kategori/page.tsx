import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { PesanStok } from '@/components/stok'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { JENIS_PRODUK, type JenisProduk } from '@/lib/stok/produk'
import { tambahKategoriProdukAksi } from '../aksi'
import { pilihanJenis } from '../medan'

export const metadata: Metadata = { title: 'Kategori produk' }

export default async function DaftarKategoriProduk({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.produk', 'L')
  const { pesan } = await searchParams
  const baris = await db.productCategory.findMany({ include: { _count: { select: { products: true } } }, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
  const bolehUbah = punyaIzin(p.izin, 'stok.produk', 'U')
  return (
    <>
      <KepalaHalaman judul="Kategori produk" keterangan="Pengelompokan produk untuk saringan stok dan opname. Kategori tidak dihapus, cukup dinonaktifkan." />
      <PesanStok kode={pesan} />
      {baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Jenis</th>
                <th scope="col" className="angka">
                  Jumlah produk
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {baris.map((c) => (
                <tr key={c.id}>
                  <td data-label="Nama">
                    <Link href={`/produk/kategori/${c.id}`} className="tebal">
                      {c.name}
                    </Link>
                  </td>
                  <td data-label="Jenis">{JENIS_PRODUK[c.kind as JenisProduk] ?? c.kind}</td>
                  <td data-label="Jumlah produk" className="angka">
                    {c._count.products}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={c.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/produk/kategori/${c.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada kategori produk.</p>
      )}
      {punyaIzin(p.izin, 'stok.produk', 'T') ? (
        <section className="kartu" aria-labelledby="j-baru">
          <h2 id="j-baru">Tambah kategori</h2>
          <FormMaster
            aksi={tambahKategoriProdukAksi}
            medan={[
              { jenis: 'teks', nama: 'name', label: 'Nama kategori', wajib: true, maxLength: 60 },
              { jenis: 'pilih', nama: 'kind', label: 'Jenis', awal: 'bahan', pilihan: pilihanJenis, wajib: true },
            ]}
            tombol="Simpan kategori"
          />
        </section>
      ) : null}
    </>
  )
}
