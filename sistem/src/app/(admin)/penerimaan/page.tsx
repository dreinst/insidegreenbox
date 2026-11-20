import type { Metadata } from 'next'
import Link from 'next/link'
import { LencanaProgres, PesanBeli, SaringDaftarBeli } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import type { SaringBeli } from '@/lib/beli/dokumen'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { daftarPenerimaan } from '@/lib/beli/penerimaan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Penerimaan Barang' }

export default async function DaftarPenerimaan({ searchParams }: { searchParams: Promise<SaringBeli & { pesan?: string }> }) {
  const p = await wajibIzin('beli.penerimaan', 'L')
  const s = await searchParams
  const [hasil, pemasok] = await Promise.all([daftarPenerimaan(db, s), pilihanPemasok(db)])
  return (
    <>
      <KepalaHalaman judul="Penerimaan Barang" keterangan="Barang yang benar-benar tiba dari pesanan. Stok bertambah dan harga rata-rata dihitung ulang saat Diposting. Tagihannya dicatat di Faktur.">
        {punyaIzin(p.izin, 'beli.penerimaan', 'T') ? (
          <Link href="/penerimaan/baru" className="btn">
            Terima barang
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanBeli kode={s.pesan} />
      <SaringDaftarBeli s={s} jalur="/penerimaan" pemasok={pemasok} label="Saring penerimaan barang" status={['Draft', 'Diajukan', 'Diposting', 'Batal']} contoh="TB-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pemasok</th>
                <th scope="col">Pesanan</th>
                <th scope="col">Lokasi</th>
                <th scope="col">Progres faktur</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/penerimaan/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pemasok">{d.supplier.name}</td>
                  <td data-label="Pesanan">{d.purchaseOrder.no}</td>
                  <td data-label="Lokasi">{d.location.name}</td>
                  <td data-label="Faktur">{d.status === 'Diposting' ? <LencanaProgres p={d.invoiceProgress} /> : '-'}</td>
                  <td data-label="Status">
                    <LencanaStatus status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada penerimaan barang yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/penerimaan" query={s} />
    </>
  )
}
