import '@/app/(admin)/kas.css'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Ringkas } from '@/components/beli'
import { FormAlasan } from '@/components/beli-form'
import { FormMaster } from '@/components/form-master'
import { PesanRekon } from '@/components/rekonsiliasi'
import { FormCocok, type Calon } from '@/components/rekonsiliasi-form'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { JejakStatus } from '@/components/stok-dok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { tautanSumber, namaSumber } from '@/lib/akuntansi/dokumen'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { akunLawan } from '@/lib/kas'
import { formatRupiah } from '@/lib/master'
import { JARAK_SARAN_HARI, netMutasi, rekonsiliasiTerakhir, rincianRekonsiliasi } from '@/lib/rekonsiliasi'
import { namaRekening } from '@/lib/rekening'
import {
  batalRekonsiliasiAksi,
  cocokAksi,
  hapusMutasiAksi,
  hapusRekonsiliasiAksi,
  kasMutasiAksi,
  lepasAksi,
  muatUlangAksi,
  postingRekonsiliasiAksi,
  saranAksi,
  ubahRekonsiliasiAksi,
} from '../aksi'

export const metadata: Metadata = { title: 'Rekonsiliasi Bank' }

const iso = (d: Date) => d.toISOString().slice(0, 10)
const HARI = 86_400_000
const tanda = (n: bigint) => (n < 0n ? `-${formatRupiah(-n)}` : formatRupiah(n))

export default async function RincianRekonsiliasi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('kas.rekonsiliasi', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([rincianRekonsiliasi(db, id), searchParams])
  if (!d) notFound()
  const { r, mutasi, h, calon, saran } = d
  const draf = r.status === 'Draft'
  const iz = (a: 'U' | 'H' | 'P') => punyaIzin(p.izin, 'kas.rekonsiliasi', a)
  const ubah = draf && iz('U')
  const bolehKas = ubah && ['T', 'S', 'P'].every((a) => punyaIzin(p.izin, 'kas.transaksi', a as 'T'))
  const [akun, sebelumnya] = await Promise.all([bolehKas ? akunLawan(db, p) : [], rekonsiliasiTerakhir(db, r.bankAccountId)])
  const pertama = !sebelumnya || sebelumnya.id === r.id ? !sebelumnya : false
  const saranPer = new Map(saran.map((s) => [s.mutasiId, s]))
  const bolehJurnal = punyaIzin(p.izin, 'akun.jurnal', 'L')
  const siap = h.jumlahMutasi > 0 && h.belumCocok === 0 && h.selisihMutasi === 0n && h.diff === 0n
  const rk = (n: bigint) => formatRupiah(n)

  // Calon jurnal per mutasi: arah sama, saran lebih dulu, lalu nominal sama, lalu tanggal terdekat. Paling banyak 6.
  const calonUntuk = (m: (typeof mutasi)[number]): Calon[] => {
    const net = netMutasi(m)
    const s = saranPer.get(m.id)
    return calon
      .filter((l) => (l.debit - l.credit > 0n) === (net > 0n))
      .map((l) => ({ l, beda: l.debit - l.credit === net ? 0 : 1, jarak: Math.abs(new Date(l.date).getTime() - m.date.getTime()) / HARI }))
      .sort((a, b) => Number(b.l.id === s?.journalLineId) - Number(a.l.id === s?.journalLineId) || a.beda - b.beda || a.jarak - b.jarak)
      .slice(0, 6)
      .map(({ l }) => ({
        id: l.id,
        judul: l.docNo || l.no,
        nilai: tanda(l.debit - l.credit),
        rinci: `${formatTanggal(new Date(l.date))} · ${namaSumber(l.sourceType)} · ${l.no}${l.memo ? ` · ${l.memo}` : ''}`,
        saran: l.id === s?.journalLineId,
      }))
  }

  return (
    <>
      <KepalaHalaman judul={r.no} keterangan={`Rekonsiliasi ${namaRekening(r.bankAccount)} · ${formatTanggal(r.periodFrom)} sampai ${formatTanggal(r.periodTo)}`} jejak={{ href: '/rekonsiliasi', label: 'Rekonsiliasi Bank' }}>
        <LencanaStatus status={r.status} />
      </KepalaHalaman>
      <PesanRekon kode={pesan} />
      <Ringkas
        label="Ringkasan rekonsiliasi"
        isi={[
          ['Saldo awal rekening koran', rk(r.stmtOpening)],
          ['Mutasi masuk', rk(h.mutasiMasuk)],
          ['Mutasi keluar', rk(h.mutasiKeluar), true],
          ['Saldo akhir rekening koran', rk(r.stmtClosing)],
          ['Saldo buku', rk(h.saldoBuku)],
          ['Jurnal belum cair', tanda(h.outstanding)],
          ['Selisih', tanda(h.diff), h.diff !== 0n],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-cek">
          <h2 id="j-cek">Syarat posting</h2>
          <ul className="rk-cek">
            <li className={h.jumlahMutasi ? undefined : 'belum'}>{h.jumlahMutasi} baris mutasi di periode ini</li>
            <li className={h.belumCocok ? 'belum' : undefined}>{h.belumCocok ? `${h.belumCocok} mutasi belum dicocokkan` : 'Semua mutasi sudah dicocokkan'}</li>
            <li className={h.selisihMutasi ? 'belum' : undefined}>{h.selisihMutasi ? `Saldo awal + mutasi berbeda ${tanda(h.selisihMutasi)} dari saldo akhir rekening koran` : 'Saldo awal + mutasi = saldo akhir rekening koran'}</li>
            <li className={h.diff ? 'belum' : undefined}>{h.diff ? `Saldo akhir rekening koran berbeda ${tanda(h.diff)} dari saldo buku dikurangi jurnal belum cair` : 'Saldo buku dikurangi jurnal belum cair = saldo akhir rekening koran'}</li>
          </ul>
          {ubah ? (
            <FormMaster
              aksi={ubahRekonsiliasiAksi.bind(null, r.id)}
              medan={[
                { jenis: 'tanggal', nama: 'periodTo', label: 'Sampai tanggal', awal: iso(r.periodTo), wajib: true },
                ...(pertama ? [{ jenis: 'angka' as const, nama: 'stmtOpening', label: 'Saldo awal rekening koran (Rp)', awal: r.stmtOpening.toString(), inputMode: 'numeric' as const }] : []),
                { jenis: 'angka', nama: 'stmtClosing', label: 'Saldo akhir rekening koran (Rp)', awal: r.stmtClosing.toString(), inputMode: 'numeric', wajib: true },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: r.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan"
              kelasTombol="btn sekunder"
            />
          ) : r.note ? (
            <p>{r.note}</p>
          ) : null}
        </section>
        <section className="kartu" aria-labelledby="j-tindakan">
          <div className="kartu-kepala">
            <h2 id="j-tindakan">Status dan tindakan</h2>
            <LencanaStatus status={r.status} />
          </div>
          <JejakStatus d={r} />
          <div className="deret-tombol">
            {draf && iz('P') ? (
              siap ? (
                <TombolAksi aksi={postingRekonsiliasiAksi.bind(null, r.id)} label="Posting rekonsiliasi" konfirmasi={`Posting ${r.no}? Baris jurnal yang dicocokkan akan terkunci dari pembatalan.`} />
              ) : (
                <p className="redup kecil">Tombol Posting muncul setelah semua syarat posting terpenuhi.</p>
              )
            ) : null}
            {ubah && saran.length ? <TombolAksi aksi={saranAksi.bind(null, r.id)} label={`Terapkan ${saran.length} saran`} kelas={siap ? 'btn sekunder' : 'btn'} /> : null}
            {ubah ? <TombolAksi aksi={muatUlangAksi.bind(null, r.id)} label="Muat ulang mutasi" kelas="btn sekunder" /> : null}
            {draf && iz('H') ? <TombolAksi aksi={hapusRekonsiliasiAksi.bind(null, r.id)} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${r.no}? Semua pencocokan dilepas.`} /> : null}
          </div>
          {ubah ? (
            <p className="redup kecil">
              Saran: nominal sama dengan tanggal paling jauh {JARAK_SARAN_HARI} hari, atau nomor dokumen muncul di referensi atau keterangan mutasi. Mutasi baru diimpor di <Link href={`/rekonsiliasi/impor?rekening=${r.bankAccountId}`}>Impor mutasi</Link>.
            </p>
          ) : null}
          {draf && iz('U') ? (
            <details className="lipat-batal">
              <summary>Batalkan rekonsiliasi</summary>
              <FormAlasan aksi={batalRekonsiliasiAksi.bind(null, r.id)} idAwal="batal" wajib={false} label="Batalkan rekonsiliasi" konfirmasi={`Batalkan ${r.no}? Semua pencocokan dilepas.`} />
            </details>
          ) : null}
          {r.status === 'Diposting' && iz('P') ? (
            <details className="lipat-batal">
              <summary>Batalkan rekonsiliasi yang sudah Diposting</summary>
              <p className="redup kecil">Pencocokan dilepas dan baris jurnalnya bisa dibatalkan lagi dari dokumen sumbernya. Hanya rekonsiliasi terakhir rekening ini. Alasan wajib diisi.</p>
              <FormAlasan aksi={batalRekonsiliasiAksi.bind(null, r.id)} idAwal="batal-posting" wajib label="Batalkan rekonsiliasi" konfirmasi={`Batalkan ${r.no} yang sudah Diposting?`} />
            </details>
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=bank_reconcile&dok=${r.id}`}>Lihat jejak audit rekonsiliasi ini</Link>
            </p>
          ) : null}
        </section>
      </div>

      <section className="kartu" aria-labelledby="j-mutasi">
        <h2 id="j-mutasi">Mutasi rekening koran</h2>
        {mutasi.length ? (
          <ol className="rk-mutasi">
            {mutasi.map((m) => {
              const net = netMutasi(m)
              const cocok = m.matchStatus === 'Cocok'
              const calonM = ubah && !cocok ? calonUntuk(m) : []
              return (
                <li key={m.id} id={`m-${m.id}`} className={`rk-baris${cocok ? ' cocok' : ''}`}>
                  <div className="rk-info">
                    <span className="rk-status">
                      <span className="kecil">{formatTanggal(m.date)}</span>
                      <span className={`lencana ${cocok ? 'hijau' : 'kuning'}`}>{cocok ? 'Cocok' : 'Belum cocok'}</span>
                    </span>
                    <span className={`rk-nominal${net < 0n ? ' keluar' : ''}`}>
                      {net < 0n ? 'Keluar ' : 'Masuk '}
                      {formatRupiah(net < 0n ? -net : net)}
                    </span>
                    <span className="rk-ket">
                      {m.description}
                      {m.ref ? ` · Ref ${m.ref}` : ''}
                      {m.balance !== null ? ` · Saldo ${formatRupiah(m.balance)}` : ''}
                    </span>
                  </div>
                  <div className="rk-pilih">
                    {cocok ? (
                      <>
                        <ul className="rk-cek">
                          {m.bankReconcileMatches.map((x) => {
                            const j = x.journalLine.journal
                            const t = tautanSumber(j.sourceType, j.sourceId, j.docNo)
                            return (
                              <li key={x.id}>
                                <span>
                                  {t ? <Link href={t}>{j.docNo || j.no}</Link> : j.docNo || j.no} · {namaSumber(j.sourceType)} · {formatTanggal(j.date)} · {tanda(x.amount)}
                                  {bolehJurnal ? (
                                    <>
                                      {' '}
                                      · <Link href={`/jurnal/${j.id}`}>{j.no}</Link>
                                    </>
                                  ) : null}
                                </span>
                              </li>
                            )
                          })}
                        </ul>
                        {ubah ? (
                          <div className="rk-tombol">
                            <TombolAksi aksi={lepasAksi.bind(null, r.id, m.id)} label="Lepas" kelas="btn sekunder kecil" />
                          </div>
                        ) : null}
                      </>
                    ) : ubah ? (
                      <>
                        {calonM.length ? <FormCocok aksi={cocokAksi.bind(null, r.id, m.id)} idMutasi={m.id} calon={calonM} /> : <p className="redup kecil">Belum ada jurnal bank yang searah dan belum cair.</p>}
                        {bolehKas ? (
                          <details className="rk-buat">
                            <summary>{net < 0n ? 'Buat kas keluar dari mutasi ini' : 'Buat kas masuk dari mutasi ini'}</summary>
                            <FormMaster
                              aksi={kasMutasiAksi.bind(null, r.id, m.id)}
                              medan={[
                                { jenis: 'pilih', nama: `akun_${m.id}`, label: 'Akun', pilihan: [{ nilai: '', label: 'Pilih akun' }, ...akun.map((a) => ({ nilai: String(a.id), label: `${a.code} ${a.name}` }))], wajib: true, bantuan: 'Misalnya Beban Administrasi Bank untuk biaya admin, Pendapatan Lain-lain untuk bunga.' },
                                { jenis: 'teks', nama: `memo_${m.id}`, label: 'Keterangan', awal: m.description.slice(0, 120), maxLength: 120 },
                              ]}
                              tombol="Buat, posting, dan cocokkan"
                              kelasTombol="btn sekunder kecil"
                            />
                          </details>
                        ) : null}
                        {iz('H') ? (
                          <div className="rk-tombol">
                            <TombolAksi aksi={hapusMutasiAksi.bind(null, r.id, m.id)} label="Hapus baris mutasi" kelas="btn sekunder kecil" konfirmasi="Hapus baris mutasi ini? Gunakan bila salah impor." />
                          </div>
                        ) : null}
                      </>
                    ) : (
                      <p className="redup kecil">Belum dicocokkan.</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ol>
        ) : (
          <p className="kosong">
            Belum ada mutasi di periode ini. <Link href={`/rekonsiliasi/impor?rekening=${r.bankAccountId}`}>Impor mutasi</Link> lalu tekan Muat ulang mutasi.
          </p>
        )}
      </section>

      {h.belumCair.length ? (
        <section className="kartu" aria-labelledby="j-belum">
          <h2 id="j-belum">Jurnal bank belum cair per {formatTanggal(r.periodTo)}</h2>
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Dokumen</th>
                  <th scope="col">Sumber</th>
                  <th scope="col" className="angka">
                    Nilai
                  </th>
                </tr>
              </thead>
              <tbody>
                {h.belumCair.map((l) => {
                  const t = tautanSumber(l.sourceType, l.sourceId, l.docNo)
                  return (
                    <tr key={l.id}>
                      <td data-label="Tanggal">{formatTanggal(new Date(l.date))}</td>
                      <td data-label="Dokumen">{t ? <Link href={t}>{l.docNo || l.no}</Link> : l.docNo || l.no}</td>
                      <td data-label="Sumber">{namaSumber(l.sourceType)}</td>
                      <td data-label="Nilai" className="angka">
                        {tanda(l.debit - l.credit)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </>
  )
}
