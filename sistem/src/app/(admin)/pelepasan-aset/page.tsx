import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanAset } from '@/components/aset'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { daftarPelepasan } from '@/lib/aset/pelepasan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatNilai } from '@/lib/stok/angka'

export const metadata: Metadata = { title: 'Pelepasan Aset' }

export default async function DaftarPelepasan({ searchParams }: { searchParams: Promise<{ status?: string; hal?: string; pesan?: string }> }) {
  const p = await wajibIzin('aset.penyusutan', 'L')
  const s = await searchParams
  const h = await daftarPelepasan(db, s)
  return (
    <>
      <KepalaHalaman judul="Pelepasan Aset" keterangan="Aset yang dijual, dibuang, atau dihapus dari buku. Saat diposting, laba atau rugi dihitung dari hasil penjualan dikurangi nilai buku, lalu dijurnal.">
        {punyaIzin(p.izin, 'aset.penyusutan', 'T') ? (
          <Link href="/pelepasan-aset/baru" className="btn">
            Buat pelepasan
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanAset kode={s.pesan} />
      <form className="saring" method="get" role="search" aria-label="Saring pelepasan aset">
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            {['Draft', 'Diposting', 'Batal'].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {s.status ? <Link href="/pelepasan-aset">Hapus saringan</Link> : null}
        </div>
      </form>
      {h.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel as-tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Aset</th>
                <th scope="col" className="angka">
                  Hasil penjualan
                </th>
                <th scope="col" className="angka">
                  Laba atau rugi
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {h.baris.map((x) => (
                <tr key={x.id}>
                  <td data-label="Nomor">
                    <Link href={`/pelepasan-aset/${x.id}`} className="tebal">
                      {x.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(x.date)}</td>
                  <td data-label="Aset">
                    {x.fixedAsset.code}
                    <small className="redup blok">{x.fixedAsset.name}</small>
                  </td>
                  <td data-label="Hasil penjualan" className="angka">
                    {formatRupiah(x.proceeds)}
                  </td>
                  <td data-label="Laba atau rugi" className={`angka ${x.gainLoss < 0n ? 'as-minus' : ''}`}>
                    {x.status === 'Draft' ? '-' : formatNilai(x.gainLoss)}
                  </td>
                  <td data-label="Status">
                    <LencanaStatus status={x.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada pelepasan aset.</p>
      )}
      <Halaman {...h} dasar="/pelepasan-aset" query={s} />
    </>
  )
}
