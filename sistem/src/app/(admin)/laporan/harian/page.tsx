import type { Metadata } from 'next'
import Link from 'next/link'
import { RingkasLaporan, SaringanLaporan, TabelLaporan } from '@/components/laporan'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { lihatVoid, pilihanSaring, tutupHarian, type SaringLaporan } from '@/lib/laporan'
import { tabelHarian } from '@/lib/laporan-kolom'

export const metadata: Metadata = { title: 'Tutup Harian POS' }

const selisihTeks = (n: number) => (n === 0 ? 'Rp 0' : `${n < 0 ? '-' : '+'}${rupiah(Math.abs(n))}`)

export default async function TutupHarian({ searchParams }: { searchParams: Promise<SaringLaporan> }) {
  const p = await wajibIzin('laporan.penjualan', 'L')
  const s = await searchParams
  const [d, pil] = await Promise.all([tutupHarian(db, s), pilihanSaring(db)])
  const bolehSetoran = punyaIzin(p.izin, 'kasir.setoran', 'L')
  return (
    <>
      <KepalaHalaman judul="Tutup Harian POS" keterangan={`Shift yang dibuka tanggal ${d.tanggal} (WIB), kas seharusnya lawan kas dihitung, dan status setoran per metode.`} />
      <SaringanLaporan dasar="/laporan/harian" jenis="harian" s={s} berlaku={{ tanggal: d.tanggal }} opsi={{ tanggal: true, kasir: pil.kasir.map((k) => ({ nilai: String(k.id), label: k.name })) }} />
      {d.ringkas.masihBuka ? (
        <p className="lap-peringatan" role="status">
          {d.ringkas.masihBuka} shift masih buka. Kas seharusnya dan selisihnya baru tampil sesudah ditutup, dan setoran tunai tanggal ini baru bisa diposting sesudah semua shift ditutup.
        </p>
      ) : null}
      <RingkasLaporan
        isi={[
          { label: 'Shift', nilai: String(d.ringkas.shift), catatan: d.ringkas.masihBuka ? `${d.ringkas.masihBuka} masih buka` : undefined },
          { label: 'Total penjualan', nilai: rupiah(d.ringkas.penjualan), catatan: `${d.ringkas.transaksi} transaksi` },
          ...(lihatVoid(p) ? [{ label: 'Void', nilai: `${d.ringkas.nVoid} transaksi`, catatan: rupiah(d.ringkas.nilaiVoid) }] : []),
          { label: 'Selisih kas', nilai: selisihTeks(d.ringkas.selisih) },
        ]}
      />
      <TabelLaporan tabel={tabelHarian(d)} judul={`Shift tanggal ${d.tanggal}`} kunci={(b) => String(b.id)} kosong="Tidak ada shift yang dibuka pada tanggal ini." />

      <div className="kisi lap-atas">
        <section className="kartu" aria-labelledby="j-setoran">
          <h2 id="j-setoran">Setoran per metode</h2>
          {d.setoran.length ? (
            <ul className="daftar-angka">
              {d.setoran.map((x) => (
                <li key={x.id}>
                  <span>
                    {bolehSetoran ? <Link href={`/setoran/${x.id}`}>{x.no}</Link> : x.no} {x.metode} <small className="redup">({x.status})</small>
                  </span>
                  <b>{rupiah(x.disetor)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="redup">Belum ada setoran untuk tanggal ini.</p>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-belum">
          <h2 id="j-belum">Belum disetor</h2>
          {d.belum.length ? (
            <ul className="daftar-angka">
              {d.belum.map((x) => (
                <li key={x.metode}>
                  <span>
                    {x.metode} <small className="redup">({x.shift} shift)</small>
                  </span>
                  <b>{rupiah(x.nilai)}</b>
                </li>
              ))}
            </ul>
          ) : (
            <p className="redup">Semua shift yang sudah ditutup sudah disetor.</p>
          )}
          {d.belum.length && punyaIzin(p.izin, 'kasir.setoran', 'T') ? (
            <p>
              <Link href={`/setoran?tanggal=${d.tanggal}`}>Buat setoran tanggal ini</Link>
            </p>
          ) : null}
        </section>
      </div>
    </>
  )
}
