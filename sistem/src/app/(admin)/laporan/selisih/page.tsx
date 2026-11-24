import type { Metadata } from 'next'
import Link from 'next/link'
import { SaringanLaporan, TabelLaporan } from '@/components/laporan'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { pilihanSaring, selisihKas, type SaringLaporan } from '@/lib/laporan'
import { tabelSelisih } from '@/lib/laporan-kolom'
import { STATUS_SHIFT } from '@/lib/shift'
import { formatWaktu } from '@/lib/waktu'

export const metadata: Metadata = { title: 'Selisih Kas per Kasir' }

const selisihTeks = (n: number) => (n === 0 ? 'Rp 0' : `${n < 0 ? '-' : '+'}${rupiah(Math.abs(n))}`)

export default async function SelisihKas({ searchParams }: { searchParams: Promise<SaringLaporan> }) {
  await wajibIzin('laporan.penjualan', 'L')
  const s = await searchParams
  const [d, pil] = await Promise.all([selisihKas(db, s), pilihanSaring(db)])
  return (
    <>
      <KepalaHalaman
        judul="Selisih Kas per Kasir"
        keterangan={`Shift yang dibuka ${d.rentang.dari} sampai ${d.rentang.sampai} (WIB) dan sudah ditutup. Selisih kecil sesekali wajar; perhatikan kasir yang sering berselisih ke arah yang sama.`}
      />
      <SaringanLaporan dasar="/laporan/selisih" jenis="selisih" s={s} berlaku={d.rentang} opsi={{ rentang: true, kasir: pil.kasir.map((k) => ({ nilai: String(k.id), label: k.name })) }} />
      {d.rentang.catatan ? <p className="lap-catatan">{d.rentang.catatan}</p> : null}
      <TabelLaporan tabel={tabelSelisih(d)} judul="Selisih kas per kasir" kunci={(b) => String(b.id)} kosong="Tidak ada shift yang ditutup pada rentang ini." />

      <h2 className="lap-judul">Shift yang berselisih</h2>
      {d.rinci.length ? (
        <div className="kartu tanpa-isi lap-gulir" role="region" aria-label="Shift yang berselisih" tabIndex={0}>
          <table className="tabel lap-tabel">
            <thead>
              <tr>
                <th scope="col">Shift</th>
                <th scope="col">Kasir</th>
                <th scope="col">Dibuka</th>
                <th scope="col" className="angka">
                  Kas seharusnya
                </th>
                <th scope="col" className="angka">
                  Kas dihitung
                </th>
                <th scope="col" className="angka">
                  Selisih
                </th>
                <th scope="col">Status</th>
                <th scope="col">Alasan</th>
              </tr>
            </thead>
            <tbody>
              {d.rinci.map((x) => (
                <tr key={x.id}>
                  <td data-label="Shift" className="tebal">
                    <Link href={`/shift/${x.id}`}>#{x.id}</Link>
                  </td>
                  <td data-label="Kasir">{x.user.name}</td>
                  <td data-label="Dibuka">{formatWaktu(x.openedAt)}</td>
                  <td data-label="Kas seharusnya" className="angka">
                    {rupiah(x.expectedCash ?? 0)}
                  </td>
                  <td data-label="Kas dihitung" className="angka">
                    {rupiah(x.countedCash ?? 0)}
                  </td>
                  <td data-label="Selisih" className="angka lap-merah">
                    {selisihTeks(Number(x.cashDiff ?? 0))}
                  </td>
                  <td data-label="Status">{x.status === 'PerluPersetujuan' ? STATUS_SHIFT.PerluPersetujuan : x.approver ? `Disetujui ${x.approver.name}` : STATUS_SHIFT[x.status]}</td>
                  <td data-label="Alasan" className="pecah">
                    {[x.note, x.approvalNote].filter(Boolean).join(' · ') || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Tidak ada shift yang berselisih pada rentang ini.</p>
      )}
      <Halaman hal={d.hal} jumlahHal={d.jumlahHal} total={d.total} dasar="/laporan/selisih" query={{ dari: s.dari, sampai: s.sampai, kasir: s.kasir }} />
    </>
  )
}
