import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanJual, SaringDaftarJual } from '@/components/b2b'
import { LencanaProgres } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { daftarPesananJual } from '@/lib/b2b/pesanan'
import { pilihanPelanggan, type SaringJual } from '@/lib/b2b/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Pesanan Penjualan' }

export default async function DaftarPesananJual({ searchParams }: { searchParams: Promise<SaringJual & { pesan?: string }> }) {
  const p = await wajibIzin('b2b.pesanan', 'L')
  const s = await searchParams
  const [hasil, pelanggan] = await Promise.all([daftarPesananJual(db, s), pilihanPelanggan(db)])
  return (
    <>
      <KepalaHalaman judul="Pesanan Penjualan" keterangan="Rencana penjualan ke satu pelanggan. Tidak menggerakkan stok. Barang keluar dan piutang muncul lewat Faktur Penjualan, boleh sebagian.">
        {punyaIzin(p.izin, 'b2b.pesanan', 'T') ? (
          <Link href="/pesanan-jual/baru" className="btn">
            Buat pesanan
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanJual kode={s.pesan} />
      <SaringDaftarJual s={s} jalur="/pesanan-jual" pelanggan={pelanggan} label="Saring pesanan penjualan" status={['Draft', 'Diajukan', 'Disetujui', 'Selesai', 'Batal']} contoh="SO-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pelanggan</th>
                <th scope="col" className="angka">
                  Total
                </th>
                <th scope="col">Progres faktur</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/pesanan-jual/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                    {d.customerRef ? <small className="redup blok">rujukan {d.customerRef}</small> : null}
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Pelanggan">{d.customer.name}</td>
                  <td data-label="Total" className="angka">
                    {formatRupiah(d.total)}
                  </td>
                  <td data-label="Faktur">
                    <LencanaProgres p={d.invoiceProgress} />
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
        <p className="kosong">Belum ada pesanan penjualan yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/pesanan-jual" query={s} />
    </>
  )
}
