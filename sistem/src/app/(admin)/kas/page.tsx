import type { Metadata } from 'next'
import Link from 'next/link'
import { SaringDaftarBeli } from '@/components/beli'
import { NAMA_JENIS_KAS, PesanKas } from '@/components/kas'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarKas, type SaringKas } from '@/lib/kas'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Kas Masuk dan Keluar' }

export default async function DaftarKas({ searchParams }: { searchParams: Promise<SaringKas & { pesan?: string }> }) {
  const p = await wajibIzin('kas.transaksi', 'L')
  const s = await searchParams
  const hasil = await daftarKas(db, s, false)
  return (
    <>
      <KepalaHalaman judul="Kas Masuk dan Keluar" keterangan="Uang masuk dan keluar dari Kas Besar atau rekening bank di luar penjualan dan pembelian, misalnya biaya operasional, bunga, atau setoran modal. Kas keluar disetujui Owner dulu, lalu diposting saat uang keluar.">
        {punyaIzin(p.izin, 'kas.transaksi', 'T') ? (
          <div className="deret-tombol">
            <Link href="/kas/baru?jenis=keluar" className="btn">
              Kas keluar
            </Link>
            <Link href="/kas/baru?jenis=masuk" className="btn sekunder">
              Kas masuk
            </Link>
          </div>
        ) : null}
      </KepalaHalaman>
      <PesanKas kode={s.pesan} />
      <SaringDaftarBeli
        s={s}
        jalur="/kas"
        label="Saring kas masuk dan keluar"
        status={['Draft', 'Diajukan', 'Disetujui', 'Diposting', 'Batal']}
        contoh="KK-2611 atau nama pihak"
        tambahan={{ nama: 'jenis', label: 'Jenis', pilihan: [['masuk', 'Kas masuk'], ['keluar', 'Kas keluar']] }}
      />
      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Jenis</th>
                <th scope="col">Kas atau rekening</th>
                <th scope="col">Pihak</th>
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
                    <Link href={`/kas/${d.id}`} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.date)}</td>
                  <td data-label="Jenis">{NAMA_JENIS_KAS[d.kind]}</td>
                  <td data-label="Kas atau rekening">{d.dari}</td>
                  <td data-label="Pihak">{d.partyName || '-'}</td>
                  <td data-label="Jumlah" className="angka">
                    {d.kind === 'keluar' ? `-${formatRupiah(d.amount)}` : formatRupiah(d.amount)}
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
        <p className="kosong">Belum ada kas masuk atau keluar yang cocok.</p>
      )}
      <Halaman {...hasil} dasar="/kas" query={s} />
    </>
  )
}
