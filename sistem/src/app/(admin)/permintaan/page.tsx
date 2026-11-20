import type { Metadata } from 'next'
import Link from 'next/link'
import { LencanaProgres, PesanBeli, SaringDaftarBeli } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import type { SaringBeli } from '@/lib/beli/dokumen'
import { daftarPermintaan } from '@/lib/beli/permintaan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

export const metadata: Metadata = { title: 'Permintaan Pembelian' }

export default async function DaftarPermintaan({ searchParams }: { searchParams: Promise<SaringBeli & { pesan?: string }> }) {
  const p = await wajibIzin('beli.permintaan', 'L')
  const s = await searchParams
  const hasil = await daftarPermintaan(db, s)
  return (
    <>
      <KepalaHalaman judul="Permintaan Pembelian" keterangan="Kebutuhan barang dari dapur atau bar sebelum dipesan ke pemasok. Tidak menggerakkan stok. Boleh dilewati bila pesanan tanpa permintaan diizinkan.">
        {punyaIzin(p.izin, 'beli.permintaan', 'T') ? (
          <Link href="/permintaan/baru" className="btn">
            Buat permintaan
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanBeli kode={s.pesan} />
      <SaringDaftarBeli s={s} jalur="/permintaan" label="Saring permintaan pembelian" status={['Draft', 'Diajukan', 'Disetujui', 'Selesai', 'Batal']} contoh="PR-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Dibutuhkan</th>
                <th scope="col">Lokasi</th>
                <th scope="col" className="angka">
                  Baris
                </th>
                <th scope="col">Progres pesan</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((d) => (
                <tr key={d.id}>
                  <td data-label="Nomor">
                    <Link href={`/permintaan/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Dibutuhkan">{formatTanggal(d.requiredDate)}</td>
                  <td data-label="Lokasi">{d.location.name}</td>
                  <td data-label="Baris" className="angka">
                    {d._count.purchaseRequestLines}
                  </td>
                  <td data-label="Progres">
                    <LencanaProgres p={d.orderProgress} />
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
        <p className="kosong">Belum ada permintaan pembelian yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/permintaan" query={s} />
    </>
  )
}
