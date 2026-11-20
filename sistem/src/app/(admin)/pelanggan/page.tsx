import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanJual } from '@/components/b2b'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { daftarPelanggan, type SaringPelanggan } from '@/lib/b2b/pelanggan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Pelanggan' }

export default async function DaftarPelanggan({ searchParams }: { searchParams: Promise<SaringPelanggan & { pesan?: string }> }) {
  const p = await wajibIzin('b2b.pelanggan', 'L')
  const s = await searchParams
  const hasil = await daftarPelanggan(db, s)
  const disaring = !!(s.q || s.status)
  return (
    <>
      <KepalaHalaman judul="Pelanggan" keterangan="Pelanggan penjualan B2B. Pelanggan tidak dihapus, cukup dinonaktifkan. Termin bayar dipakai untuk jatuh tempo faktur, dan harga khusus opsional per produk.">
        {punyaIzin(p.izin, 'b2b.pelanggan', 'T') ? (
          <Link href="/pelanggan/baru" className="btn">
            Tambah pelanggan
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanJual kode={s.pesan} />
      <form className="saring" method="get" role="search" aria-label="Saring pelanggan">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Nama, kode, atau kontak" maxLength={60} />
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/pelanggan">Hapus saringan</Link> : null}
        </div>
      </form>
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Pelanggan</th>
                <th scope="col">Kontak</th>
                <th scope="col" className="angka">
                  Termin
                </th>
                <th scope="col" className="angka">
                  Harga khusus
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((x) => (
                <tr key={x.id}>
                  <td data-label="Pelanggan">
                    <Link href={`/pelanggan/${x.id}`} className="tebal">
                      {x.name}
                    </Link>
                    <small className="redup blok">
                      {x.code}
                      {x.category ? ` · ${x.category}` : ''}
                    </small>
                  </td>
                  <td data-label="Kontak">{[x.contact, x.phone].filter(Boolean).join(' · ') || '-'}</td>
                  <td data-label="Termin" className="angka">
                    {x.paymentDays ? `${x.paymentDays} hari` : 'Tunai'}
                  </td>
                  <td data-label="Harga khusus" className="angka">
                    {x._count.customerPrices ? `${x._count.customerPrices} produk` : '-'}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={x.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada pelanggan yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/pelanggan" query={s} />
    </>
  )
}
