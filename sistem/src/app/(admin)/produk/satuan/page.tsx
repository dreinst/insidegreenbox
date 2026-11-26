import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { PesanStok } from '@/components/stok'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { tambahSatuanAksi } from '../aksi'

export const metadata: Metadata = { title: 'Satuan' }

export default async function DaftarSatuan({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('stok.produk', 'L')
  const { pesan } = await searchParams
  const baris = await db.unit.findMany({ include: { _count: { select: { productsBase: true, productUnits: true } } }, orderBy: [{ active: 'desc' }, { name: 'asc' }] })
  const bolehUbah = punyaIzin(p.izin, 'stok.produk', 'U')
  return (
    <>
      <KepalaHalaman judul="Satuan" keterangan="Satuan dasar dan satuan beli produk. Satuan tidak dihapus, cukup dinonaktifkan." />
      <PesanStok kode={pesan} />
      {baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Simbol</th>
                <th scope="col" className="angka">
                  Satuan dasar produk
                </th>
                <th scope="col" className="angka">
                  Konversi
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {baris.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nama">
                    <Link href={`/produk/satuan/${u.id}`} className="tebal">
                      {u.name}
                    </Link>
                  </td>
                  <td data-label="Simbol">
                    <code>{u.symbol}</code>
                  </td>
                  <td data-label="Satuan dasar" className="angka">
                    {u._count.productsBase}
                  </td>
                  <td data-label="Konversi" className="angka">
                    {u._count.productUnits}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={u.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/produk/satuan/${u.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada satuan.</p>
      )}
      {punyaIzin(p.izin, 'stok.produk', 'T') ? (
        <section className="kartu" aria-labelledby="j-baru">
          <h2 id="j-baru">Tambah satuan</h2>
          <FormMaster
            aksi={tambahSatuanAksi}
            medan={[
              { jenis: 'teks', nama: 'name', label: 'Nama satuan', wajib: true, maxLength: 30, placeholder: 'karton' },
              { jenis: 'teks', nama: 'symbol', label: 'Simbol', wajib: true, maxLength: 10, placeholder: 'ktn' },
            ]}
            tombol="Simpan satuan"
          />
        </section>
      ) : null}
    </>
  )
}
