import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanJual, SaringDaftarJual } from '@/components/b2b'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { daftarTerima } from '@/lib/b2b/penerimaan'
import { pilihanPelanggan, type SaringJual } from '@/lib/b2b/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Penerimaan Pelanggan' }

export default async function DaftarTerima({ searchParams }: { searchParams: Promise<SaringJual & { pesan?: string }> }) {
  const p = await wajibIzin('b2b.penerimaan', 'L')
  const s = await searchParams
  const [hasil, pelanggan] = await Promise.all([daftarTerima(db, s), pilihanPelanggan(db)])
  return (
    <>
      <KepalaHalaman judul="Penerimaan Pelanggan" keterangan="Uang masuk dari pelanggan B2B, dialokasikan ke faktur yang belum lunas. Status bayar faktur berubah saat penerimaan diposting.">
        {punyaIzin(p.izin, 'b2b.penerimaan', 'T') ? (
          <Link href="/terima-pelanggan/baru" className="btn">
            Catat penerimaan
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanJual kode={s.pesan} />
      <SaringDaftarJual s={s} jalur="/terima-pelanggan" pelanggan={pelanggan} label="Saring penerimaan pelanggan" status={['Draft', 'Diajukan', 'Diposting', 'Batal']} contoh="TP-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pelanggan</th>
                <th scope="col" className="angka">
                  Dokumen
                </th>
                <th scope="col" className="angka">
                  Jumlah
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/terima-pelanggan/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pelanggan">{d.customer.name}</td>
                  <td data-label="Dokumen" className="angka">
                    {d._count.customerPaymentAllocs}
                  </td>
                  <td data-label="Jumlah" className="angka">
                    {formatRupiah(d.amount)}
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
        <p className="kosong">Belum ada penerimaan pelanggan yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/terima-pelanggan" query={s} />
    </>
  )
}
