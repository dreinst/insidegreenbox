import type { Metadata } from 'next'
import Link from 'next/link'
import { LencanaProgres, PesanBeli, SaringDaftarBeli } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import type { SaringBeli } from '@/lib/beli/dokumen'
import { pilihanPemasok } from '@/lib/beli/pemasok'
import { daftarPesanan } from '@/lib/beli/pesanan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Pesanan Pembelian' }

export default async function DaftarPesanan({ searchParams }: { searchParams: Promise<SaringBeli & { pesan?: string }> }) {
  const p = await wajibIzin('beli.pesanan', 'L')
  const s = await searchParams
  const [hasil, pemasok] = await Promise.all([daftarPesanan(db, s), pilihanPemasok(db)])
  return (
    <>
      <KepalaHalaman judul="Pesanan Pembelian" keterangan="Pesanan resmi ke satu pemasok. Pesanan di atas batas persetujuan perlu disetujui Owner. Barang diterima lewat Penerimaan Barang, boleh sebagian.">
        {punyaIzin(p.izin, 'beli.pesanan', 'T') ? (
          <Link href="/pesanan/baru" className="btn">
            Buat pesanan
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanBeli kode={s.pesan} />
      <SaringDaftarBeli s={s} jalur="/pesanan" pemasok={pemasok} label="Saring pesanan pembelian" status={['Draft', 'Diajukan', 'Disetujui', 'Selesai', 'Batal']} contoh="PO-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pemasok</th>
                <th scope="col" className="angka">
                  Total
                </th>
                <th scope="col">Progres terima</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/pesanan/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                    {d.legacyNo ? <small className="redup blok">admin lama {d.legacyNo}</small> : null}
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pemasok">{d.supplier.name}</td>
                  <td data-label="Total" className="angka">
                    {formatRupiah(d.total)}
                  </td>
                  <td data-label="Terima">
                    <LencanaProgres p={d.receiveProgress} />
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
        <p className="kosong">Belum ada pesanan pembelian yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/pesanan" query={s} />
    </>
  )
}
