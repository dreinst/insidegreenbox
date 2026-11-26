import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanBeli, SaringDaftarBeli } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import type { SaringBeli } from '@/lib/beli/dokumen'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { daftarPembayaran } from '@/lib/beli/pembayaran'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Pembayaran Pembelian' }

export default async function DaftarPembayaran({ searchParams }: { searchParams: Promise<SaringBeli & { pesan?: string }> }) {
  const p = await wajibIzin('beli.pembayaran', 'L')
  const s = await searchParams
  const [hasil, pemasok] = await Promise.all([daftarPembayaran(db, s), pilihanPemasok(db)])
  return (
    <>
      <KepalaHalaman judul="Pembayaran Pembelian" keterangan="Membayar faktur dan pembelian kredit satu pemasok dari kas atau rekening bank. Disiapkan dan diajukan Admin, disetujui Owner, lalu diposting saat uang keluar.">
        {punyaIzin(p.izin, 'beli.pembayaran', 'T') ? (
          <Link href="/pembayaran/baru" className="btn">
            Buat pembayaran
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanBeli kode={s.pesan} />
      <SaringDaftarBeli s={s} jalur="/pembayaran" pemasok={pemasok} label="Saring pembayaran pembelian" status={['Draft', 'Diajukan', 'Disetujui', 'Diposting', 'Batal']} contoh="BB-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pemasok</th>
                <th scope="col" className="angka">
                  Dokumen
                </th>
                <th scope="col" className="angka">
                  Dibayar
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/pembayaran/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pemasok">{d.supplier.name}</td>
                  <td data-label="Dokumen" className="angka">
                    {d._count.purchasePaymentAllocs}
                  </td>
                  <td data-label="Dibayar" className="angka">
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
        <p className="kosong">Belum ada pembayaran pembelian yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/pembayaran" query={s} />
    </>
  )
}
