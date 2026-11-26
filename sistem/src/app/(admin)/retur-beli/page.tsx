import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanBeli, SaringDaftarBeli } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import type { SaringBeli } from '@/lib/beli/dokumen'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { CARA_SELESAI, daftarRetur } from '@/lib/beli/retur'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Retur Pembelian' }

export default async function DaftarRetur({ searchParams }: { searchParams: Promise<SaringBeli & { pesan?: string }> }) {
  const p = await wajibIzin('beli.retur', 'L')
  const s = await searchParams
  const [hasil, pemasok] = await Promise.all([daftarRetur(db, s), pilihanPemasok(db)])
  return (
    <>
      <KepalaHalaman judul="Retur Pembelian" keterangan="Barang dikembalikan ke pemasok dari penerimaan atau pembelian langsung. Stok keluar dengan harga penerimaannya; bagian yang sudah difakturkan menjadi nota debit.">
        {punyaIzin(p.izin, 'beli.retur', 'T') ? (
          <Link href="/retur-beli/baru" className="btn">
            Buat retur
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanBeli kode={s.pesan} />
      <SaringDaftarBeli s={s} jalur="/retur-beli" pemasok={pemasok} label="Saring retur pembelian" status={['Draft', 'Diajukan', 'Diposting', 'Batal']} contoh="RB-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pemasok</th>
                <th scope="col">Asal</th>
                <th scope="col">Penyelesaian</th>
                <th scope="col" className="angka">
                  Nota debit
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/retur-beli/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pemasok">{d.supplier.name}</td>
                  <td data-label="Asal">{d.goodsReceipt?.no ?? d.directPurchase?.no ?? '-'}</td>
                  <td data-label="Penyelesaian">{CARA_SELESAI[d.settleMode as keyof typeof CARA_SELESAI] ?? d.settleMode}</td>
                  <td data-label="Nota debit" className="angka">
                    {d.status === 'Diposting' ? formatRupiah(d.debitNoteAmount) : '-'}
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
        <p className="kosong">Belum ada retur pembelian yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/retur-beli" query={s} />
    </>
  )
}
