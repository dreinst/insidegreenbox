import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster } from '@/components/form-master'
import { JejakPerintah, PesanProduksi, Progres } from '@/components/produksi'
import { LencanaStatus, formatTanggal, isoTanggal } from '@/components/stok'
import { FormBatal, TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { JENIS_KELUAR } from '@/lib/produksi/pengeluaran'
import { batasKeluar, bersihKeluar, butuhSetujuPerintah, muatPerintah, progres, tombolPerintah } from '@/lib/produksi/perintah'
import { pilihanBomAssembly } from '@/lib/produksi/resep'
import { des, formatNilai, formatQty, isianQty } from '@/lib/stok/angka'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { hapusPerintahAksi, statusPerintahAksi, ubahPerintahAksi } from '../aksi'

export const metadata: Metadata = { title: 'Perintah Produksi' }

export default async function RincianPerintah({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('produksi.perintah', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }, setuju] = await Promise.all([muatPerintah(db, id), searchParams, butuhSetujuPerintah(db)])
  if (!d) notFound()
  const t = tombolPerintah(p, d.status, setuju, d.submittedBy)
  const lihatNilai = saklarNyala(p, 'stok.lihat_nilai')
  const [bom, lokasi] = t.ubah ? await Promise.all([pilihanBomAssembly(db), pilihanLokasi(db)]) : [[], []]
  const sat = d.bom.product?.baseUnit.symbol ?? ''
  const berjalan = d.status === 'Disetujui'
  const bisaKeluar = berjalan && punyaIzin(p.izin, 'produksi.pengeluaran', 'T')
  const bisaHasil = berjalan && punyaIzin(p.izin, 'produksi.hasil', 'T')
  const adaTombol = t.setujui || t.ajukan || t.kembalikan || t.hapus
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Perintah produksi · ${d.bom.product?.name ?? d.bom.name} · ${formatTanggal(d.date)}`} jejak={{ href: '/perintah-produksi', label: 'Perintah Produksi' }}>
        <LencanaStatus status={d.status} />
      </KepalaHalaman>
      <PesanProduksi kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data perintah</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahPerintahAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'bomId', label: 'BOM assembly', awal: String(d.bomId), pilihan: bom.map((b) => ({ nilai: String(b.id), label: b.name })), wajib: true, lebar: true },
                { jenis: 'angka', nama: 'plannedQty', label: `Qty rencana (${sat})`, awal: isianQty(d.plannedQty), inputMode: 'decimal', wajib: true },
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: isoTanggal(d.date), wajib: true },
                { jenis: 'pilih', nama: 'materialLocationId', label: 'Lokasi bahan', awal: String(d.materialLocationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'pilih', nama: 'outputLocationId', label: 'Lokasi hasil', awal: String(d.outputLocationId), pilihan: lokasi.map((l) => ({ nilai: String(l.id), label: l.name })), wajib: true },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan draf"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>BOM</dt>
              <dd>
                <Link href={`/resep/${d.bomId}`}>{d.bom.name}</Link> ({d.bom.code})
              </dd>
              <dt>Qty rencana</dt>
              <dd>
                {formatQty(d.plannedQty)} {sat}
              </dd>
              <dt>Dihasilkan</dt>
              <dd>
                {formatQty(d.producedQty)} {sat} ({progres(d.producedQty, d.plannedQty)})
                <Progres nilai={d.producedQty} dari={d.plannedQty} />
              </dd>
              <dt>Lokasi bahan</dt>
              <dd>{d.materialLocation.name}</dd>
              <dt>Lokasi hasil</dt>
              <dd>{d.outputLocation.name}</dd>
              {lihatNilai ? (
                <>
                  <dt>Nilai dalam proses</dt>
                  <dd>{formatNilai(d.wipValue)}</dd>
                  {d.wipWriteOff ? (
                    <>
                      <dt>Selisih produksi</dt>
                      <dd>{formatNilai(d.wipWriteOff)} dibuang saat ditutup</dd>
                    </>
                  ) : null}
                </>
              ) : null}
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-tindakan">
          <div className="kartu-kepala">
            <h2 id="j-tindakan">Status dan tindakan</h2>
            <LencanaStatus status={d.status} />
          </div>
          {d.status === 'Draft' ? <p className="catatan">{setuju ? 'Perintah ini perlu diajukan lalu disetujui.' : 'Setujui perintah supaya bahan bisa dikeluarkan. Perintah tidak menggerakkan stok.'}</p> : null}
          <JejakPerintah d={d} />
          {adaTombol ? (
            <div className="deret-tombol">
              {t.setujui ? <TombolAksi aksi={statusPerintahAksi.bind(null, d.id, 'setujui')} label="Setujui" konfirmasi={`Setujui ${d.no}? Baris bahan tidak bisa diubah lagi.`} /> : null}
              {t.ajukan ? <TombolAksi aksi={statusPerintahAksi.bind(null, d.id, 'ajukan')} label="Ajukan" kelas={t.setujui ? 'btn sekunder' : 'btn'} /> : null}
              {t.kembalikan ? <TombolAksi aksi={statusPerintahAksi.bind(null, d.id, 'kembalikan')} label="Kembalikan ke draf" kelas="btn sekunder" /> : null}
              {t.hapus ? <TombolAksi aksi={hapusPerintahAksi.bind(null, d.id)} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${d.no}? Nomornya tidak dipakai ulang.`} /> : null}
            </div>
          ) : null}
          {bisaKeluar || bisaHasil ? (
            <p className="tautan-baris">
              {bisaKeluar ? (
                <Link href={`/pengeluaran-bahan/baru?perintah=${d.id}`} className="btn sekunder">
                  Keluarkan bahan
                </Link>
              ) : null}
              {bisaHasil ? (
                <Link href={`/hasil-produksi/baru?perintah=${d.id}`} className="btn sekunder">
                  Catat hasil
                </Link>
              ) : null}
            </p>
          ) : null}
          {t.tutup ? (
            <details className="lipat-batal">
              <summary>Tutup produksi</summary>
              <p className="redup kecil">Sisa qty tidak diproduksi lagi dan sisa nilai dalam proses dibuang ke Selisih Produksi. Alasan wajib diisi.</p>
              <FormBatal aksi={statusPerintahAksi.bind(null, d.id, 'tutup')} wajibAlasan label="Tutup dan selesaikan" konfirmasi={`Tutup ${d.no}?`} />
            </details>
          ) : null}
          {t.batal ? (
            <details className="lipat-batal">
              <summary>Batalkan perintah</summary>
              <FormBatal aksi={statusPerintahAksi.bind(null, d.id, 'batal')} wajibAlasan={false} label="Batalkan perintah produksi" konfirmasi={`Batalkan ${d.no}?`} />
            </details>
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=production_order&dok=${d.id}`}>Lihat jejak audit dokumen ini</Link>
            </p>
          ) : null}
        </section>
      </div>

      <section className="kartu" aria-labelledby="j-bahan">
        <h2 id="j-bahan">Kebutuhan bahan</h2>
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Bahan</th>
                <th scope="col" className="angka">
                  Kebutuhan
                </th>
                <th scope="col" className="angka">
                  Batas keluar
                </th>
                <th scope="col" className="angka">
                  Keluar
                </th>
                <th scope="col" className="angka">
                  Kembali
                </th>
                <th scope="col" className="angka">
                  Sisa
                </th>
              </tr>
            </thead>
            <tbody>
              {d.productionOrderLines.map((l) => {
                const s = des(l.requiredQty).minus(bersihKeluar(l))
                return (
                  <tr key={l.id}>
                    <td data-label="Bahan">
                      <span className="tebal">{l.product.name}</span>
                      <small className="redup blok">{l.product.code}</small>
                    </td>
                    <td data-label="Kebutuhan" className="angka">
                      {formatQty(l.requiredQty)} {l.product.baseUnit.symbol}
                    </td>
                    <td data-label="Batas keluar" className="angka">
                      {formatQty(batasKeluar(l))} ({formatQty(l.tolPct)}%)
                    </td>
                    <td data-label="Keluar" className="angka">
                      {formatQty(l.issuedQty)}
                    </td>
                    <td data-label="Kembali" className="angka">
                      {formatQty(l.returnedQty)}
                    </td>
                    <td data-label="Sisa" className="angka">
                      {formatQty(s.isNeg() ? 0 : s)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="kartu" aria-labelledby="j-turunan">
        <h2 id="j-turunan">Dokumen pelaksana</h2>
        {d.materialIssues.length || d.productionResults.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Nomor</th>
                  <th scope="col">Jenis</th>
                  <th scope="col">Tanggal</th>
                  <th scope="col">Rincian</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {d.materialIssues.map((m) => (
                  <tr key={`k${m.id}`}>
                    <td data-label="Nomor">
                      <Link href={`/pengeluaran-bahan/${m.id}`} className="tebal">
                        {m.no}
                      </Link>
                    </td>
                    <td data-label="Jenis">Pengeluaran bahan</td>
                    <td data-label="Tanggal">{formatTanggal(m.date)}</td>
                    <td data-label="Rincian">
                      {JENIS_KELUAR[m.kind as keyof typeof JENIS_KELUAR] ?? m.kind}, {m.location.name}
                    </td>
                    <td data-label="Status">
                      <LencanaStatus status={m.status} />
                    </td>
                  </tr>
                ))}
                {d.productionResults.map((h) => (
                  <tr key={`h${h.id}`}>
                    <td data-label="Nomor">
                      <Link href={`/hasil-produksi/${h.id}`} className="tebal">
                        {h.no}
                      </Link>
                    </td>
                    <td data-label="Jenis">Hasil produksi</td>
                    <td data-label="Tanggal">{formatTanggal(h.date)}</td>
                    <td data-label="Rincian">
                      {formatQty(h.qty)} {sat} di {h.location.name}
                      {lihatNilai && h.status !== 'Draft' && h.status !== 'Diajukan' ? `, ${formatNilai(h.value)}` : ''}
                    </td>
                    <td data-label="Status">
                      <LencanaStatus status={h.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada pengeluaran bahan atau hasil produksi.</p>
        )}
      </section>
    </>
  )
}
