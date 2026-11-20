import type { Metadata } from 'next'
import Link from 'next/link'
import { LencanaBayar, PesanBeli, SaringDaftarBeli } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import type { SaringBeli } from '@/lib/beli/dokumen'
import { daftarFaktur } from '@/lib/beli/faktur'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Faktur Pembelian' }

export default async function DaftarFaktur({ searchParams }: { searchParams: Promise<SaringBeli & { bayar?: string; pesan?: string }> }) {
  const p = await wajibIzin('beli.faktur', 'L')
  const s = await searchParams
  const [hasil, pemasok] = await Promise.all([daftarFaktur(db, s), pilihanPemasok(db)])
  return (
    <>
      <KepalaHalaman judul="Faktur Pembelian" keterangan="Tagihan pemasok atas barang yang sudah diterima. Hutang muncul saat faktur Diposting dan dilunasi lewat Pembayaran.">
        {punyaIzin(p.izin, 'beli.faktur', 'T') ? (
          <Link href="/faktur/baru" className="btn">
            Catat faktur
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanBeli kode={s.pesan} />
      <SaringDaftarBeli
        s={s}
        jalur="/faktur"
        pemasok={pemasok}
        label="Saring faktur pembelian"
        status={['Draft', 'Diajukan', 'Diposting', 'Batal']}
        contoh="FB-2611"
        tambahan={{ nama: 'bayar', label: 'Status bayar', pilihan: [['BelumBayar', 'Belum bayar'], ['Sebagian', 'Sebagian'], ['Lunas', 'Lunas']] }}
      />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pemasok</th>
                <th scope="col">Jatuh tempo</th>
                <th scope="col" className="angka">
                  Total
                </th>
                <th scope="col">Bayar</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/faktur/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                    <small className="redup blok">{d.supplierInvoiceNo}</small>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pemasok">{d.supplier.name}</td>
                  <td data-label="Jatuh tempo">{formatTanggal(d.dueDate)}</td>
                  <td data-label="Total" className="angka">
                    {formatRupiah(d.total)}
                  </td>
                  <td data-label="Bayar">{d.status === 'Diposting' ? <LencanaBayar s={d.payStatus} /> : '-'}</td>
                  <td data-label="Status">
                    <LencanaStatus status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada faktur pembelian yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/faktur" query={s} />
    </>
  )
}
