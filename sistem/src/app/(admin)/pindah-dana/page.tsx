import type { Metadata } from 'next'
import Link from 'next/link'
import { SaringDaftarBeli } from '@/components/beli'
import { PesanKas } from '@/components/kas'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarKas, type SaringKas } from '@/lib/kas'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Pindah Dana' }

export default async function DaftarPindah({ searchParams }: { searchParams: Promise<SaringKas & { pesan?: string }> }) {
  const p = await wajibIzin('kas.pindah', 'L')
  const s = await searchParams
  const hasil = await daftarKas(db, s, true)
  return (
    <>
      <KepalaHalaman judul="Pindah Dana" keterangan="Memindah uang antara Kas Besar dan rekening bank, atau antar rekening. Disetujui dulu, lalu diposting saat uang benar-benar dipindah.">
        {punyaIzin(p.izin, 'kas.pindah', 'T') ? (
          <Link href="/pindah-dana/baru" className="btn">
            Buat pindah dana
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanKas kode={s.pesan} />
      <SaringDaftarBeli s={s} jalur="/pindah-dana" label="Saring pindah dana" status={['Draft', 'Diajukan', 'Disetujui', 'Diposting', 'Batal']} contoh="PN-2611" />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Dari</th>
                <th scope="col">Ke</th>
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
                    <Link href={`/pindah-dana/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Dari">{d.dari}</td>
                  <td data-label="Ke">{d.ke}</td>
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
        <p className="kosong">Belum ada pindah dana yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/pindah-dana" query={s} />
    </>
  )
}
