import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanJual, SaringDaftarJual } from '@/components/b2b'
import { LencanaBayar } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { daftarFakturJual } from '@/lib/b2b/faktur'
import { pilihanPelanggan, type SaringJual } from '@/lib/b2b/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Faktur Penjualan' }

export default async function DaftarFakturJual({ searchParams }: { searchParams: Promise<SaringJual & { bayar?: string; pesan?: string }> }) {
  const p = await wajibIzin('b2b.faktur', 'L')
  const s = await searchParams
  const [hasil, pelanggan] = await Promise.all([daftarFakturJual(db, s), pilihanPelanggan(db)])
  return (
    <>
      <KepalaHalaman judul="Faktur Penjualan" keterangan="Tagihan ke pelanggan sekaligus pengiriman barang. Saat diposting, stok keluar dengan harga rata-rata (HPP) dan faktur menjadi piutang.">
        {punyaIzin(p.izin, 'b2b.faktur', 'T') ? (
          <Link href="/faktur-jual/baru" className="btn">
            Buat faktur
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanJual kode={s.pesan} />
      <SaringDaftarJual
        s={s}
        jalur="/faktur-jual"
        pelanggan={pelanggan}
        label="Saring faktur penjualan"
        status={['Draft', 'Diajukan', 'Diposting', 'Batal']}
        contoh="FJ-2611"
        tambahan={{
          nama: 'bayar',
          label: 'Status bayar',
          pilihan: [
            ['BelumBayar', 'Belum bayar'],
            ['Sebagian', 'Sebagian'],
            ['Lunas', 'Lunas'],
          ],
        }}
      />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pelanggan</th>
                <th scope="col">Jatuh tempo</th>
                <th scope="col" className="angka">
                  Total
                </th>
                <th scope="col" className="angka">
                  Sisa
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/faktur-jual/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                    {d.customerRef ? <small className="redup blok">rujukan {d.customerRef}</small> : null}
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pelanggan">{d.customer.name}</td>
                  <td data-label="Jatuh tempo">{formatTanggal(d.dueDate)}</td>
                  <td data-label="Total" className="angka">
                    {formatRupiah(d.total)}
                  </td>
                  <td data-label="Sisa" className="angka">
                    {d.status === 'Diposting' ? formatRupiah(d.total - d.paidAmount) : '-'}
                  </td>
                  <td data-label="Status">
                    <LencanaStatus status={d.status} /> {d.status === 'Diposting' ? <LencanaBayar s={d.payStatus} /> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada faktur penjualan yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/faktur-jual" query={s} />
    </>
  )
}
