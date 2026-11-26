import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanJual, SaringDaftarJual } from '@/components/b2b'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { daftarReturJual } from '@/lib/b2b/retur'
import { pilihanPelanggan, type SaringJual } from '@/lib/b2b/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Retur Penjualan' }

export default async function DaftarReturJual({ searchParams }: { searchParams: Promise<SaringJual & { pesan?: string }> }) {
  const p = await wajibIzin('b2b.retur', 'L')
  const s = await searchParams
  const [hasil, pelanggan] = await Promise.all([daftarReturJual(db, s), pilihanPelanggan(db)])
  return (
    <>
      <KepalaHalaman judul="Retur Penjualan" keterangan="Barang yang dikembalikan pelanggan dari satu faktur penjualan. Barang masuk lagi ke stok dengan HPP asal, dan nota kreditnya mengurangi piutang.">
        {punyaIzin(p.izin, 'b2b.retur', 'T') ? (
          <Link href="/retur-jual/baru" className="btn">
            Buat retur
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanJual kode={s.pesan} />
      <SaringDaftarJual s={s} jalur="/retur-jual" pelanggan={pelanggan} label="Saring retur penjualan" status={['Draft', 'Diajukan', 'Diposting', 'Batal']} contoh="RJ-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pelanggan</th>
                <th scope="col">Faktur</th>
                <th scope="col" className="angka">
                  Nota kredit
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/retur-jual/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pelanggan">{d.customer.name}</td>
                  <td data-label="Faktur">{d.salesInvoice.no}</td>
                  <td data-label="Nota kredit" className="angka">
                    {formatRupiah(d.total)}
                  </td>
                  <td data-label="Status">
                    <LencanaStatus status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada retur penjualan yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/retur-jual" query={s} />
    </>
  )
}
