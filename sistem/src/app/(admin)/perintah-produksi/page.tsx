import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanProduksi, Progres, SaringProduksi } from '@/components/produksi'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarPerintah, progres } from '@/lib/produksi/perintah'
import { formatQty } from '@/lib/stok/angka'
import type { SaringDok } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'

export const metadata: Metadata = { title: 'Perintah Produksi' }

export default async function DaftarPerintah({ searchParams }: { searchParams: Promise<SaringDok & { pesan?: string }> }) {
  const p = await wajibIzin('produksi.perintah', 'L')
  const s = await searchParams
  const [hasil, lokasi] = await Promise.all([daftarPerintah(db, s), pilihanLokasi(db)])
  return (
    <>
      <KepalaHalaman judul="Perintah Produksi" keterangan="Rencana membuat produk setengah jadi dari BOM assembly yang dikerjakan bertahap. Stok bergerak lewat Pengeluaran Bahan dan Hasil Produksi.">
        {punyaIzin(p.izin, 'produksi.perintah', 'T') ? (
          <Link href="/perintah-produksi/baru" className="btn">
            Buat perintah
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanProduksi kode={s.pesan} />
      <SaringProduksi s={s} jalur="/perintah-produksi" lokasi={lokasi} label="Saring perintah produksi" golongan="rencana" contoh="PP-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Produk hasil</th>
                <th scope="col" className="angka">
                  Dihasilkan
                </th>
                <th scope="col">Progres</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => {
                const sat = d.bom.product?.baseUnit.symbol ?? ''
                return (
                  <tr key={d.id}>
                    <td data-label="Nomor">
                      <Link href={`/perintah-produksi/${d.id}`} className="tebal">
                        {d.no}
                      </Link>
                    </td>
                    <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                    <td data-label="Produk">
                      {d.bom.product?.name ?? '-'}
                      <small className="redup blok">
                        {d.bom.code} · {d.materialLocation.name} ke {d.outputLocation.name}
                      </small>
                    </td>
                    <td data-label="Dihasilkan" className="angka">
                      {formatQty(d.producedQty)} / {formatQty(d.plannedQty)} {sat}
                      <Progres nilai={d.producedQty} dari={d.plannedQty} />
                    </td>
                    <td data-label="Progres">{progres(d.producedQty, d.plannedQty)}</td>
                    <td data-label="Status">
                      <LencanaStatus status={d.status} />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada perintah produksi yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/perintah-produksi" query={s} />
    </>
  )
}
