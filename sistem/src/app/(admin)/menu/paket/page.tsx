import type { Metadata } from 'next'
import Link from 'next/link'
import { Foto, PesanMaster } from '@/components/master'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { daftarPaket, type SaringPaket } from '@/lib/menu'

export const metadata: Metadata = { title: 'Paket set' }

export default async function DaftarPaket({ searchParams }: { searchParams: Promise<SaringPaket & { pesan?: string }> }) {
  const p = await wajibIzin('menu.menu', 'L')
  const s = await searchParams
  const hasil = await daftarPaket(db, s)
  const disaring = !!(s.q || s.status)
  const bolehUbah = punyaIzin(p.izin, 'menu.menu', 'U')
  return (
    <>
      <KepalaHalaman judul="Paket set" keterangan="Satu menu utama dan satu minuman dengan harga paket yang lebih murah.">
        {punyaIzin(p.izin, 'menu.menu', 'T') ? (
          <Link href="/menu/paket/baru" className="btn">
            Tambah paket
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanMaster kode={s.pesan} />

      <form className="saring" method="get" role="search" aria-label="Saring paket">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Nama paket" maxLength={64} />
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
          {disaring ? <Link href="/menu/paket">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Paket</th>
                <th scope="col">Isi</th>
                <th scope="col" className="angka">
                  Harga normal
                </th>
                <th scope="col" className="angka">
                  Harga paket
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((x) => (
                <tr key={x.id}>
                  <td data-label="Paket">
                    <span className="sel-foto">
                      <Foto image={x.image} nama={x.name} />
                      <Link href={`/menu/paket/${x.id}`} className="tebal">
                        {x.name}
                      </Link>
                    </span>
                  </td>
                  <td data-label="Isi">
                    {x.mainItem.name} + {x.drinkItem.name}
                  </td>
                  <td data-label="Harga normal" className="angka">
                    {formatRupiah(x.normalPrice)}
                  </td>
                  <td data-label="Harga paket" className="angka">
                    {formatRupiah(x.price)}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={x.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/menu/paket/${x.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada paket yang cocok dengan saringan.' : 'Belum ada paket set.'}</p>
      )}
      <Halaman {...hasil} dasar="/menu/paket" query={s} />
    </>
  )
}
