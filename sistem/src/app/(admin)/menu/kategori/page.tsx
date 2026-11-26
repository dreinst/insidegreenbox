import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { tambahKategoriAksi } from '../aksi'

export const metadata: Metadata = { title: 'Kategori menu' }

export default async function DaftarKategori({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('menu.menu', 'L')
  const { pesan } = await searchParams
  const baris = await db.menuCategory.findMany({ include: { _count: { select: { items: true } } }, orderBy: [{ active: 'desc' }, { sort: 'asc' }, { name: 'asc' }] })
  const bolehUbah = punyaIzin(p.izin, 'menu.menu', 'U')
  return (
    <>
      <KepalaHalaman judul="Kategori menu" keterangan="Pengelompokan menu di kasir dan situs, diurutkan menurut angka urutan. Kategori tidak dihapus, cukup dinonaktifkan." />
      <PesanMaster kode={pesan} />

      {baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Urutan</th>
                <th scope="col">Nama</th>
                <th scope="col">Kode</th>
                <th scope="col" className="angka">
                  Jumlah menu
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
                  <td data-label="Urutan">{c.sort}</td>
                  <td data-label="Nama">
                    <Link href={`/menu/kategori/${c.id}`} className="tebal">
                      {c.name}
                    </Link>
                  </td>
                  <td data-label="Kode">
                    <code>{c.code}</code>
                  </td>
                  <td data-label="Jumlah menu" className="angka">
                    {c._count.items}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={c.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/menu/kategori/${c.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada kategori. Tambahkan di bawah atau jalankan npm run impor:menu.</p>
      )}

      {punyaIzin(p.izin, 'menu.menu', 'T') ? (
        <section className="kartu jarak-atas-kartu" aria-labelledby="j-baru">
          <h2 id="j-baru">Tambah kategori</h2>
          <FormMaster
            aksi={tambahKategoriAksi}
            medan={[
              { jenis: 'teks', nama: 'name', label: 'Nama kategori', wajib: true, maxLength: 40 },
              { jenis: 'angka', nama: 'sort', label: 'Urutan', bantuan: 'Angka kecil tampil lebih dulu. Kosong berarti di paling akhir.' },
            ]}
            tombol="Simpan kategori"
          />
        </section>
      ) : null}
    </>
  )
}
