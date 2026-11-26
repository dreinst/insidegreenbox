import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JurnalDokumen, PesanAset } from '@/components/aset'
import { Ringkas } from '@/components/beli'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { namaPengguna } from '@/components/stok-dok'
import { FormBatal } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { namaPeriode } from '@/lib/akuntansi/jurnal'
import { muatPenyusutan, runTerakhir } from '@/lib/aset/penyusutan'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { formatWaktu } from '@/lib/waktu'
import { batalPenyusutanAksi } from '../../_aset/aksi'

export const metadata: Metadata = { title: 'Penyusutan' }

export default async function RincianPenyusutan({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('aset.penyusutan', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [r, akhir, { pesan }] = await Promise.all([muatPenyusutan(db, id), runTerakhir(db), searchParams])
  if (!r) notFound()
  const nama = await namaPengguna([r.postedBy, r.cancelledBy])
  const adaDilepas = r.assetDepreciations.some((d) => d.fixedAsset.status !== 'aktif')
  const bolehBatal = !adaDilepas && r.status === 'Diposting' && akhir?.id === r.id && punyaIzin(p.izin, 'aset.penyusutan', 'P') && saklarNyala(p, 'dok.batal_posting')
  const lihatAset = punyaIzin(p.izin, 'aset.daftar', 'L')
  return (
    <>
      <KepalaHalaman judul={r.no} keterangan={`Penyusutan ${namaPeriode(r.yearMonth)} · jurnal ${formatTanggal(r.date)}`} jejak={{ href: '/penyusutan', label: 'Penyusutan' }}>
        <LencanaStatus status={r.status} />
      </KepalaHalaman>
      <PesanAset kode={pesan} />
      <Ringkas
        label="Ringkasan penyusutan"
        isi={[
          ['Bulan', namaPeriode(r.yearMonth)],
          ['Jumlah aset', String(r.assetCount)],
          ['Total penyusutan', formatRupiah(r.total)],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status dan jurnal</h2>
          <ul className="daftar-waktu">
            <li>
              <span className="titik hijau" aria-hidden="true" />
              <span>
                <b>Dihitung dan diposting</b>
                <small className="redup">
                  {formatWaktu(r.postedAt)} oleh {nama(r.postedBy)}
                </small>
              </span>
            </li>
            {r.cancelledAt ? (
              <li>
                <span className="titik merah" aria-hidden="true" />
                <span>
                  <b>Dibatalkan</b>
                  <small className="redup">
                    {formatWaktu(r.cancelledAt)} oleh {nama(r.cancelledBy)}
                  </small>
                  {r.cancelReason ? <small>Alasan: {r.cancelReason}</small> : null}
                </span>
              </li>
            ) : null}
          </ul>
          <JurnalDokumen p={p} docType="asset_depreciation_run" docId={r.id} />
          {bolehBatal ? (
            <details className="bl-lipat as-lipat">
              <summary>Batalkan penyusutan</summary>
              <FormBatal aksi={batalPenyusutanAksi.bind(null, r.id)} wajibAlasan label="Batalkan penyusutan" konfirmasi={`Batalkan ${r.no}? Jurnalnya dibalik dan akumulasi aset dikembalikan.`} />
            </details>
          ) : r.status === 'Diposting' && adaDilepas ? (
            <p className="as-catatan">Dokumen ini tidak bisa dibatalkan karena ada aset di dalamnya yang sudah dilepas atau dibatalkan.</p>
          ) : r.status === 'Diposting' && akhir && akhir.id !== r.id ? (
            <p className="as-catatan">Hanya dokumen penyusutan terakhir ({akhir.no}) yang bisa dibatalkan.</p>
          ) : null}
        </section>
      </div>
      <section className="kartu" aria-labelledby="j-rincian">
        <h2 id="j-rincian">Rincian per aset</h2>
        <div className="kartu tanpa-isi">
          <table className="tabel as-tabel">
            <thead>
              <tr>
                <th scope="col">Aset</th>
                <th scope="col" className="angka">
                  Nilai perolehan
                </th>
                <th scope="col" className="angka">
                  Penyusutan
                </th>
                <th scope="col" className="angka">
                  Akumulasi sesudahnya
                </th>
              </tr>
            </thead>
            <tbody>
              {r.assetDepreciations.map((d) => (
                <tr key={d.id}>
                  <td data-label="Aset">
                    {lihatAset ? (
                      <Link href={`/aset/${d.fixedAsset.id}`} className="tebal">
                        {d.fixedAsset.code}
                      </Link>
                    ) : (
                      <span className="tebal">{d.fixedAsset.code}</span>
                    )}
                    <small className="redup blok">{d.fixedAsset.name}</small>
                  </td>
                  <td data-label="Nilai perolehan" className="angka">
                    {formatRupiah(d.fixedAsset.cost)}
                  </td>
                  <td data-label="Penyusutan" className="angka">
                    {formatRupiah(d.amount)}
                  </td>
                  <td data-label="Akumulasi sesudahnya" className="angka">
                    {formatRupiah(d.accumAfter)}
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
