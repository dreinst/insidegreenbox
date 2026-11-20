import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanProduksi, SaringProduksi } from '@/components/produksi'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { daftarCepat } from '@/lib/produksi/cepat'
import { formatNilai, formatQty } from '@/lib/stok/angka'
import type { SaringDok } from '@/lib/stok/dokumen'
import { pilihanLokasi } from '@/lib/stok/lokasi'

export const metadata: Metadata = { title: 'Produksi Cepat' }

export default async function DaftarCepat({ searchParams }: { searchParams: Promise<SaringDok & { pesan?: string }> }) {
  const p = await wajibIzin('produksi.cepat', 'L')
  const s = await searchParams
  const [hasil, lokasi] = await Promise.all([daftarCepat(db, s), pilihanLokasi(db)])
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  return (
    <>
      <KepalaHalaman judul="Produksi Cepat" keterangan="Satu dokumen untuk BOM assembly kali jumlah batch: bahan berkurang dan hasil bertambah sekaligus saat Diposting.">
        {punyaIzin(p.izin, 'produksi.cepat', 'T') ? (
          <Link href="/produksi-cepat/baru" className="btn">
            Buat produksi cepat
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanProduksi kode={s.pesan} />
      <SaringProduksi s={s} jalur="/produksi-cepat" lokasi={lokasi} label="Saring produksi cepat" golongan="pelaksana" contoh="PC-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Hasil</th>
                <th scope="col">Lokasi</th>
                {lihatNilai ? (
                  <th scope="col" className="angka">
                    Nilai hasil
                  </th>
                ) : null}
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/produksi-cepat/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Hasil">
                    {formatQty(d.outputQty)} {d.bom.product?.baseUnit.symbol ?? ''} {d.bom.product?.name ?? ''}
                    <small className="redup blok">
                      {d.bom.code} × {formatQty(d.qty)} batch
                    </small>
                  </td>
                  <td data-label="Lokasi">{d.fromLocationId === d.toLocationId ? d.fromLocation.name : `${d.fromLocation.name} ke ${d.toLocation.name}`}</td>
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
        <p className="kosong">Belum ada produksi cepat yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/produksi-cepat" query={s} />
    </>
  )
}
