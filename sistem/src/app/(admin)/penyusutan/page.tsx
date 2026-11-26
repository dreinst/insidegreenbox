import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanAset } from '@/components/aset'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { TombolAksi } from '@/components/stok-form'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { namaPeriode } from '@/lib/akuntansi/jurnal'
import { bulanBerikut, bulanIni, daftarPenyusutan, geserBulan, runTerakhir, usulanPenyusutan } from '@/lib/aset/penyusutan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { hitungPenyusutanAksi } from '../_aset/aksi'

export const metadata: Metadata = { title: 'Penyusutan' }

export default async function DaftarPenyusutan({ searchParams }: { searchParams: Promise<{ bulan?: string; hal?: string; pesan?: string }> }) {
  const p = await wajibIzin('aset.penyusutan', 'L')
  const s = await searchParams
  const [h, berikut, akhir] = await Promise.all([daftarPenyusutan(db, s), bulanBerikut(db), runTerakhir(db)])
  const kini = bulanIni()
  // Pilihan bulan: sesudah dokumen terakhir sampai bulan ini; tanpa dokumen, 12 bulan terakhir.
  const pilihan: string[] = []
  for (let ym = akhir ? geserBulan(akhir.yearMonth, 1) : geserBulan(kini, -11); ym <= kini; ym = geserBulan(ym, 1)) pilihan.push(ym)
  const bulan = s.bulan && pilihan.includes(s.bulan) ? s.bulan : (berikut ?? null)
  const usulan = bulan ? await usulanPenyusutan(db, bulan) : []
  const total = usulan.reduce((n, u) => n + u.amount, 0n)
  const boleh = punyaIzin(p.izin, 'aset.penyusutan', 'T') && punyaIzin(p.izin, 'aset.penyusutan', 'P')
  return (
    <>
      <KepalaHalaman judul="Penyusutan" keterangan="Satu dokumen per bulan untuk semua aset aktif, garis lurus. Dokumen langsung dijurnal: debit beban penyusutan, kredit akumulasi penyusutan." />
      <PesanAset kode={s.pesan} />

      <section className="kartu" aria-labelledby="j-hitung">
        <h2 id="j-hitung">Hitung penyusutan</h2>
        {bulan ? (
          <>
            {pilihan.length > 1 ? (
              <form className="as-hitung" method="get" aria-label="Pilih bulan penyusutan">
                <div className="kolom">
                  <label htmlFor="s-bulan">Bulan</label>
                  <select id="s-bulan" name="bulan" defaultValue={bulan}>
                    {pilihan.map((ym) => (
                      <option key={ym} value={ym}>
                        {namaPeriode(ym)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="tombol-baris">
                  <button type="submit" className="btn sekunder">
                    Lihat pratinjau
                  </button>
                </div>
              </form>
            ) : null}
            <p className="as-catatan">
              {usulan.length ? `${usulan.length} aset disusutkan di ${namaPeriode(bulan)}, total ${formatRupiah(total)}.` : `Tidak ada aset aktif yang perlu disusutkan di ${namaPeriode(bulan)}.`}
              {akhir ? ` Dokumen terakhir: ${akhir.no} untuk ${namaPeriode(akhir.yearMonth)}.` : ''}
            </p>
            {usulan.length ? (
              <div className="kartu tanpa-isi as-pratinjau">
                <table className="tabel as-tabel">
                  <thead>
                    <tr>
                      <th scope="col">Aset</th>
                      <th scope="col" className="angka">
                        Nilai perolehan
                      </th>
                      <th scope="col" className="angka">
                        Akumulasi sebelumnya
                      </th>
                      <th scope="col" className="angka">
                        Penyusutan
                      </th>
                      <th scope="col" className="angka">
                        Nilai buku sesudahnya
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {usulan.map((u) => (
                      <tr key={u.id}>
                        <td data-label="Aset">
                          <Link href={`/aset/${u.id}`} className="tebal">
                            {u.code}
                          </Link>
                          <small className="redup blok">{u.name}</small>
                        </td>
                        <td data-label="Nilai perolehan" className="angka">
                          {formatRupiah(u.cost)}
                        </td>
                        <td data-label="Akumulasi sebelumnya" className="angka">
                          {formatRupiah(u.accum)}
                        </td>
                        <td data-label="Penyusutan" className="angka">
                          {formatRupiah(u.amount)}
                        </td>
                        <td data-label="Nilai buku sesudahnya" className="angka">
                          {formatRupiah(u.bookAfter)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td data-label="Jumlah">Jumlah</td>
                      <td />
                      <td />
                      <td data-label="Penyusutan" className="angka">
                        {formatRupiah(total)}
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : null}
            {boleh && usulan.length ? (
              <TombolAksi aksi={hitungPenyusutanAksi.bind(null, bulan)} label={`Hitung penyusutan ${namaPeriode(bulan)}`} konfirmasi={`Hitung dan posting penyusutan ${namaPeriode(bulan)} sebesar ${formatRupiah(total)}?`} />
            ) : null}
          </>
        ) : (
          <p className="as-catatan">Penyusutan sampai {namaPeriode(kini)} sudah dihitung ({akhir?.no}). Bulan berikutnya bisa dihitung mulai awal bulan depan.</p>
        )}
      </section>

      <h2>Dokumen penyusutan</h2>
      {h.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel as-tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Bulan</th>
                <th scope="col">Tanggal jurnal</th>
                <th scope="col" className="angka">
                  Aset
                </th>
                <th scope="col" className="angka">
                  Total
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {h.baris.map((r) => (
                <tr key={r.id}>
                  <td data-label="Nomor">
                    <Link href={`/penyusutan/${r.id}`} className="tebal">
                      {r.no}
                    </Link>
                  </td>
                  <td data-label="Bulan">{namaPeriode(r.yearMonth)}</td>
                  <td data-label="Tanggal jurnal">{formatTanggal(r.date)}</td>
                  <td data-label="Aset" className="angka">
                    {r.assetCount}
                  </td>
                  <td data-label="Total" className="angka">
                    {formatRupiah(r.total)}
                  </td>
                  <td data-label="Status">
                    <LencanaStatus status={r.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada dokumen penyusutan.</p>
      )}
      <Halaman {...h} dasar="/penyusutan" query={s} />
    </>
  )
}
