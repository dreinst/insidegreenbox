import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanProduksi, SaringProduksi } from '@/components/produksi'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { daftarHasil } from '@/lib/produksi/hasil'
import { formatNilai, formatQty } from '@/lib/stok/angka'
import type { SaringDok } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'

export const metadata: Metadata = { title: 'Hasil Produksi' }

export default async function DaftarHasil({ searchParams }: { searchParams: Promise<SaringDok & { pesan?: string }> }) {
  const p = await wajibIzin('produksi.hasil', 'L')
  const s = await searchParams
  const [hasil, lokasi] = await Promise.all([daftarHasil(db, s), pilihanLokasi(db)])
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  return (
    <>
      <KepalaHalaman judul="Hasil Produksi" keterangan="Produk hasil perintah produksi masuk ke stok dengan nilai bahan yang sudah dikeluarkan ke proses. Stok bergerak saat Diposting.">
        {punyaIzin(p.izin, 'produksi.hasil', 'T') ? (
          <Link href="/hasil-produksi/baru" className="btn">
            Catat hasil
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanProduksi kode={s.pesan} />
      <SaringProduksi s={s} jalur="/hasil-produksi" lokasi={lokasi} label="Saring hasil produksi" golongan="pelaksana" contoh="HP-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Perintah</th>
                <th scope="col" className="angka">
                  Qty hasil
                </th>
                {lihatNilai ? (
                  <th scope="col" className="angka">
                    Nilai
                  </th>
                ) : null}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/hasil-produksi/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Perintah">
                    <Link href={`/perintah-produksi/${d.productionOrderId}`}>{d.productionOrder.no}</Link>
                    <small className="redup blok">
                      {d.productionOrder.bom.product?.name ?? '-'} · {d.location.name}
                    </small>
                  </td>
                  <td data-label="Qty hasil" className="angka">
                    {formatQty(d.qty)} {d.productionOrder.bom.product?.baseUnit.symbol ?? ''}
                  </td>
                  {lihatNilai ? (
                    <td data-label="Nilai" className="angka">
                      {d.postedAt ? formatNilai(d.value) : '-'}
                    </td>
                  ) : null}
                  <td data-label="Status">
                    <LencanaStatus status={d.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada hasil produksi yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/hasil-produksi" query={s} />
    </>
  )
}
