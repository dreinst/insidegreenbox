import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanProduksi, SaringProduksi } from '@/components/produksi'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { JENIS_KELUAR, daftarPengeluaran } from '@/lib/produksi/pengeluaran'
import type { SaringDok } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'

export const metadata: Metadata = { title: 'Pengeluaran Bahan' }

export default async function DaftarPengeluaran({ searchParams }: { searchParams: Promise<SaringDok & { pesan?: string }> }) {
  const p = await wajibIzin('produksi.pengeluaran', 'L')
  const s = await searchParams
  const [hasil, lokasi] = await Promise.all([daftarPengeluaran(db, s), pilihanLokasi(db)])
  return (
    <>
      <KepalaHalaman judul="Pengeluaran Bahan" keterangan="Bahan keluar ke proses produksi atau kembali dari proses, untuk perintah produksi yang Disetujui. Stok bergerak saat Diposting.">
        {punyaIzin(p.izin, 'produksi.pengeluaran', 'T') ? (
          <Link href="/pengeluaran-bahan/baru" className="btn">
            Buat pengeluaran
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanProduksi kode={s.pesan} />
      <SaringProduksi s={s} jalur="/pengeluaran-bahan" lokasi={lokasi} label="Saring pengeluaran bahan" golongan="pelaksana" contoh="KB-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Perintah</th>
                <th scope="col">Jenis</th>
                <th scope="col">Lokasi</th>
                <th scope="col" className="angka">
                  Bahan
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/pengeluaran-bahan/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Perintah">
                    <Link href={`/perintah-produksi/${d.productionOrderId}`}>{d.productionOrder.no}</Link>
                  </td>
                  <td data-label="Jenis">{JENIS_KELUAR[d.kind as keyof typeof JENIS_KELUAR] ?? d.kind}</td>
                  <td data-label="Lokasi">{d.location.name}</td>
                  <td data-label="Bahan" className="angka">
                    {d._count.materialIssueLines}
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
        <p className="kosong">Belum ada pengeluaran bahan yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/pengeluaran-bahan" query={s} />
    </>
  )
}
