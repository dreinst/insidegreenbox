import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanBeli } from '@/components/beli'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { daftarPemasok, type SaringPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Pemasok' }

export default async function DaftarPemasok({ searchParams }: { searchParams: Promise<SaringPemasok & { pesan?: string }> }) {
  const p = await wajibIzin('beli.pemasok', 'L')
  const s = await searchParams
  const hasil = await daftarPemasok(db, s)
  const disaring = !!(s.q || s.status)
  return (
    <>
      <KepalaHalaman judul="Pemasok" keterangan="Pemasok bahan dan barang. Pemasok tidak dihapus, cukup dinonaktifkan. Termin bayar dipakai untuk jatuh tempo faktur.">
        {punyaIzin(p.izin, 'beli.pemasok', 'T') ? (
          <Link href="/pemasok/baru" className="btn">
            Tambah pemasok
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanBeli kode={s.pesan} />
      <form className="saring" method="get" role="search" aria-label="Saring pemasok">
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
          {disaring ? <Link href="/pemasok">Hapus saringan</Link> : null}
        </div>
      </form>
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Pemasok</th>
                <th scope="col">Kontak</th>
                <th scope="col" className="angka">
                  Termin
                </th>
                <th scope="col">Catatan</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((x) => (
                <tr key={x.id}>
                  <td data-label="Pemasok">
                    <Link href={`/pemasok/${x.id}`} className="tebal">
                      {x.name}
                    </Link>
                    <small className="redup blok">{x.code}</small>
                  </td>
                  <td data-label="Kontak">{[x.contact, x.phone].filter(Boolean).join(' · ') || '-'}</td>
                  <td data-label="Termin" className="angka">
                    {x.creditDays ? `${x.creditDays} hari` : 'Tunai'}
                  </td>
                  <td data-label="Catatan" className="ringkasan">
                    {x.note || '-'}
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
        <p className="kosong">Belum ada pemasok yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/pemasok" query={s} />
    </>
  )
}
