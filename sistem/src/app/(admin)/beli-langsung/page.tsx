import type { Metadata } from 'next'
import Link from 'next/link'
import { LencanaBayar, PesanBeli, SaringDaftarBeli } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import type { SaringBeli } from '@/lib/beli/dokumen'
import { CARA_BAYAR, daftarLangsung } from '@/lib/beli/langsung'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Pembelian Langsung' }

export default async function DaftarLangsung({ searchParams }: { searchParams: Promise<SaringBeli & { cara?: string; pesan?: string }> }) {
  const p = await wajibIzin('beli.langsung', 'L')
  const s = await searchParams
  const [hasil, pemasok] = await Promise.all([daftarLangsung(db, s), pilihanPemasok(db)])
  return (
    <>
      <KepalaHalaman judul="Pembelian Langsung" keterangan="Belanja yang barangnya langsung diterima tanpa pesanan, misalnya ke pasar atau toko. Stok masuk saat Diposting. Kredit menjadi hutang pemasok.">
        {punyaIzin(p.izin, 'beli.langsung', 'T') ? (
          <Link href="/beli-langsung/baru" className="btn">
            Catat pembelian
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanBeli kode={s.pesan} />
      <SaringDaftarBeli
        s={s}
        jalur="/beli-langsung"
        pemasok={pemasok}
        label="Saring pembelian langsung"
        status={['Draft', 'Diajukan', 'Diposting', 'Batal']}
        contoh="BL-2611"
        tambahan={{ nama: 'cara', label: 'Cara bayar', pilihan: Object.entries(CARA_BAYAR) }}
      />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pemasok</th>
                <th scope="col">Cara bayar</th>
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
                    <Link href={`/beli-langsung/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                    {d.supplierInvoiceNo ? <small className="redup blok">{d.supplierInvoiceNo}</small> : null}
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pemasok">{d.supplier.name}</td>
                  <td data-label="Cara bayar">{CARA_BAYAR[d.payMode as keyof typeof CARA_BAYAR] ?? d.payMode}</td>
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
        <p className="kosong">Belum ada pembelian langsung yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/beli-langsung" query={s} />
    </>
  )
}
