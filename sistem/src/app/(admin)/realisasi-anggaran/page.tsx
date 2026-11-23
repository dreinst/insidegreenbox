import type { Metadata } from 'next'
import Link from 'next/link'
import { PersenBatang } from '@/components/aset'
import { Ringkas } from '@/components/beli'
import { KepalaHalaman } from '@/components/umum'
import { JENIS_AKUN } from '@/lib/akuntansi/akun'
import { NAMA_BULAN_PENDEK } from '@/lib/anggaran/anggaran'
import { realisasiAnggaran } from '@/lib/anggaran/realisasi'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatNilai } from '@/lib/stok/angka'
import { saringRealisasi, type QueryRealisasi } from './saring'

export const metadata: Metadata = { title: 'Realisasi Anggaran' }

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
const persenTeks = (x: number | null) => (x === null ? '-' : `${x.toLocaleString('id-ID')}%`)

export default async function RealisasiAnggaran({ searchParams }: { searchParams: Promise<QueryRealisasi> }) {
  const p = await wajibIzin('anggaran.anggaran', 'L')
  const q = await searchParams
  const s = saringRealisasi(q)
  const [h, versi] = await Promise.all([
    realisasiAnggaran(db, s.tahun, { bulan: s.bulan, anggaranId: s.anggaranId }),
    db.budget.findMany({ where: { year: s.tahun, status: 'Disetujui' }, orderBy: { version: 'desc' }, select: { id: true, no: true, version: true, replacedAt: true } }),
  ])
  const csv = new URLSearchParams({ tahun: String(s.tahun), ...(s.bulan ? { bulan: String(s.bulan) } : {}), ...(s.anggaranId ? { anggaran: String(s.anggaranId) } : {}) })
  const periode = s.bulan ? `${NAMA_BULAN[s.bulan - 1]} ${s.tahun}` : `tahun ${s.tahun}`
  return (
    <>
      <KepalaHalaman judul="Realisasi Anggaran" keterangan="Realisasi dibaca dari jurnal yang berlaku: pendapatan dari kredit dikurangi debit, HPP dan beban dari debit dikurangi kredit. Selisih = realisasi - anggaran.">
        <a href={`/realisasi-anggaran/unduh?${csv}`} className="btn sekunder" download>
          Unduh CSV
        </a>
      </KepalaHalaman>
      <form className="saring" method="get" role="search" aria-label="Saring realisasi anggaran">
        <div className="kolom">
          <label htmlFor="s-tahun">Tahun</label>
          <input id="s-tahun" name="tahun" inputMode="numeric" defaultValue={String(s.tahun)} maxLength={4} />
        </div>
        <div className="kolom">
          <label htmlFor="s-bulan">Bulan</label>
          <select id="s-bulan" name="bulan" defaultValue={s.bulan ? String(s.bulan) : ''}>
            <option value="">Setahun</option>
            {NAMA_BULAN.map((n, i) => (
              <option key={n} value={i + 1}>
                {n}
              </option>
            ))}
          </select>
        </div>
        {versi.length > 1 ? (
          <div className="kolom">
            <label htmlFor="s-anggaran">Versi anggaran</label>
            <select id="s-anggaran" name="anggaran" defaultValue={s.anggaranId ? String(s.anggaranId) : ''}>
              <option value="">Yang berlaku</option>
              {versi.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.no} versi {v.version}
                  {v.replacedAt ? ' (digantikan)' : ''}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Tampilkan
          </button>
        </div>
      </form>
      {h.anggaran ? (
        <p className="as-catatan">
          Anggaran: {punyaIzin(p.izin, 'anggaran.anggaran', 'L') ? <Link href={`/anggaran/${h.anggaran.id}`}>{`${h.anggaran.no} ${h.anggaran.name}`}</Link> : h.anggaran.no}, versi {h.anggaran.version}. Periode {periode}.
        </p>
      ) : (
        <p className="pesan galat" role="status">
          Belum ada anggaran Disetujui untuk tahun {s.tahun}. Realisasi tetap tampil dengan anggaran 0.
        </p>
      )}
      <Ringkas
        label="Ringkasan realisasi"
        isi={[
          ['Anggaran pendapatan', formatRupiah(h.pendapatan.anggaran)],
          ['Realisasi pendapatan', formatNilai(h.pendapatan.realisasi)],
          ['Anggaran HPP dan beban', formatRupiah(h.biaya.anggaran)],
          ['Realisasi HPP dan beban', formatNilai(h.biaya.realisasi)],
          ['Persen biaya terpakai', persenTeks(h.biaya.persen)],
        ]}
      />

      <section className="kartu" aria-labelledby="j-akun">
        <h2 id="j-akun">Per akun, {periode}</h2>
        {h.baris.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel as-tabel">
              <thead>
                <tr>
                  <th scope="col">Akun</th>
                  <th scope="col">Jenis</th>
                  <th scope="col" className="angka">
                    Anggaran
                  </th>
                  <th scope="col" className="angka">
                    Realisasi
                  </th>
                  <th scope="col" className="angka">
                    Selisih
                  </th>
                  <th scope="col" className="angka">
                    Persen
                  </th>
                </tr>
              </thead>
              <tbody>
                {h.baris.map((b) => {
                  const buruk = b.kind === 'Pendapatan' ? b.selisih < 0n : b.selisih > 0n
                  return (
                    <tr key={b.accountId}>
                      <td data-label="Akun">
                        <span className="tebal">{b.code}</span> {b.name}
                      </td>
                      <td data-label="Jenis">{JENIS_AKUN[b.kind]}</td>
                      <td data-label="Anggaran" className="angka">
                        {formatRupiah(b.anggaran)}
                      </td>
                      <td data-label="Realisasi" className="angka">
                        {formatNilai(b.realisasi)}
                      </td>
                      <td data-label="Selisih" className={`angka ${b.selisih === 0n ? '' : buruk ? 'as-minus' : 'as-plus'}`}>
                        {b.selisih > 0n ? '+' : ''}
                        {formatNilai(b.selisih)}
                      </td>
                      <td data-label="Persen" className="angka">
                        <PersenBatang persen={b.persen} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada anggaran atau realisasi untuk {periode}.</p>
        )}
        <p className="as-catatan">Selisih hijau berarti lebih baik dari anggaran (pendapatan di atas, biaya di bawah); merah sebaliknya.</p>
      </section>

      <section className="kartu" aria-labelledby="j-bulan">
        <h2 id="j-bulan">Per bulan, tahun {s.tahun}</h2>
        <div className="kartu tanpa-isi">
          <table className="tabel as-tabel">
            <thead>
              <tr>
                <th scope="col">Bulan</th>
                <th scope="col" className="angka">
                  Anggaran pendapatan
                </th>
                <th scope="col" className="angka">
                  Realisasi pendapatan
                </th>
                <th scope="col" className="angka">
                  Anggaran biaya
                </th>
                <th scope="col" className="angka">
                  Realisasi biaya
                </th>
                <th scope="col" className="angka">
                  Persen biaya
                </th>
              </tr>
            </thead>
            <tbody>
              {h.perBulan.map((m) => (
                <tr key={m.bulan}>
                  <td data-label="Bulan">
                    <Link href={`/realisasi-anggaran?${new URLSearchParams({ tahun: String(s.tahun), bulan: String(m.bulan), ...(s.anggaranId ? { anggaran: String(s.anggaranId) } : {}) })}`}>{NAMA_BULAN_PENDEK[m.bulan - 1]}</Link>
                  </td>
                  <td data-label="Anggaran pendapatan" className="angka">
                    {formatRupiah(m.pendapatan.anggaran)}
                  </td>
                  <td data-label="Realisasi pendapatan" className="angka">
                    {formatNilai(m.pendapatan.realisasi)}
                  </td>
                  <td data-label="Anggaran biaya" className="angka">
                    {formatRupiah(m.biaya.anggaran)}
                  </td>
                  <td data-label="Realisasi biaya" className="angka">
                    {formatNilai(m.biaya.realisasi)}
                  </td>
                  <td data-label="Persen biaya" className="angka">
                    {persenTeks(m.biaya.persen)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  )
}
