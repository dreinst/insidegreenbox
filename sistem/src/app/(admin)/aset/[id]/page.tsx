import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { JurnalDokumen, LencanaAset, PesanAset } from '@/components/aset'
import { Ringkas, TautanDok } from '@/components/beli'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus, formatTanggal } from '@/components/stok'
import { namaPengguna } from '@/components/stok-dok'
import { FormBatal, TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { muatAset } from '@/lib/aset/aset'
import { pilihanKategoriAset } from '@/lib/aset/kategori'
import { akumulasiTerjadwal, bulanIni } from '@/lib/aset/penyusutan'
import { namaPeriode } from '@/lib/akuntansi/jurnal'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { namaRekening } from '@/lib/rekening'
import { pilihanLokasi } from '@/lib/stok/lokasi'
import { formatWaktu } from '@/lib/waktu'
import { aktifkanAsetAksi, batalAsetAksi, hapusAsetAksi, ubahAsetAksi } from '../../_aset/aksi'
import { medanAset } from '../medan'

export const metadata: Metadata = { title: 'Aset Tetap' }

const iso = (d: Date) => d.toISOString().slice(0, 10)

export default async function RincianAset({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('aset.daftar', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [a, { pesan }] = await Promise.all([muatAset(db, id), searchParams])
  if (!a) notFound()
  const iz = (x: 'T' | 'U' | 'H' | 'S') => punyaIzin(p.izin, 'aset.daftar', x)
  const draf = a.status === 'draft'
  const aktif = a.status === 'aktif'
  const bolehUbah = (draf || aktif) && iz('U')
  const [kategori, lokasi, rekening] = bolehUbah ? await Promise.all([pilihanKategoriAset(db), pilihanLokasi(db), db.bankAccount.findMany({ where: { active: true }, orderBy: { id: 'asc' } })]) : [[], [], []]
  const sumber = a.bankAccountId ? await db.bankAccount.findUnique({ where: { id: a.bankAccountId } }) : null
  const nama = await namaPengguna([a.createdBy, a.activatedBy, a.cancelledBy])
  const perBulan = (a.cost - a.salvage) / BigInt(a.usefulMonths)
  const terjadwal = akumulasiTerjadwal(a, bulanIni())
  const bolehLepas = aktif && punyaIzin(p.izin, 'aset.penyusutan', 'T') && !a.assetDisposals.some((x) => x.status !== 'Batal')
  return (
    <>
      <KepalaHalaman judul={`${a.code} ${a.name}`} keterangan={`${a.category.name} · perolehan ${formatTanggal(a.acquiredDate)}`} jejak={{ href: '/aset', label: 'Aset Tetap' }}>
        <LencanaAset status={a.status} />
        {bolehLepas ? (
          <Link href={`/pelepasan-aset/baru?aset=${a.id}`} className="btn sekunder">
            Lepas atau jual aset
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanAset kode={pesan} />
      <Ringkas
        label="Ringkasan aset"
        isi={[
          ['Nilai perolehan', formatRupiah(a.cost)],
          ['Nilai sisa', formatRupiah(a.salvage)],
          ['Penyusutan per bulan', formatRupiah(perBulan)],
          ['Akumulasi penyusutan', formatRupiah(a.accumDepreciation)],
          ['Nilai buku', formatRupiah(a.status === 'dilepas' || a.status === 'batal' ? 0n : a.cost - a.accumDepreciation)],
          ...(aktif && terjadwal > a.accumDepreciation ? ([['Belum disusutkan sampai bulan ini', formatRupiah(terjadwal - a.accumDepreciation)]] as [string, string][]) : []),
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data aset</h2>
          {bolehUbah ? (
            <>
              {aktif ? <p className="as-catatan">Aset sudah aktif, jadi hanya nama, lokasi, dan catatan yang bisa diubah.</p> : null}
              <FormMaster
                aksi={ubahAsetAksi.bind(null, a.id)}
                medan={
                  draf
                    ? medanAset(
                        { kategori, lokasi, rekening },
                        {
                          name: a.name,
                          categoryId: String(a.categoryId),
                          locationId: a.locationId ? String(a.locationId) : '',
                          acquiredDate: iso(a.acquiredDate),
                          cost: a.cost.toString(),
                          salvage: a.salvage.toString(),
                          usefulMonths: String(a.usefulMonths),
                          sumber: a.bankAccountId ? String(a.bankAccountId) : 'kas',
                          note: a.note,
                        },
                      )
                    : [
                        { jenis: 'teks', nama: 'name', label: 'Nama aset', awal: a.name, wajib: true, maxLength: 80, lebar: true },
                        { jenis: 'pilih', nama: 'locationId', label: 'Lokasi', awal: a.locationId ? String(a.locationId) : '', pilihan: [{ nilai: '', label: 'Tanpa lokasi' }, ...lokasi.map((l) => ({ nilai: String(l.id), label: l.name }))] },
                        { jenis: 'area', nama: 'note', label: 'Catatan', awal: a.note, maxLength: 300, lebar: true },
                      ]
                }
                tombol="Simpan perubahan"
                kelasTombol="btn sekunder"
              />
            </>
          ) : null}
          {draf && bolehUbah ? null : (
          <dl className={`rincian${bolehUbah ? ' as-jarak' : ''}`}>
            <dt>Kategori</dt>
            <dd>{a.category.name}</dd>
            <dt>Lokasi</dt>
            <dd>{a.location?.name ?? '-'}</dd>
            <dt>Umur manfaat</dt>
            <dd>{a.usefulMonths} bulan, garis lurus, mulai {namaPeriode(iso(a.acquiredDate).slice(0, 7))}</dd>
            <dt>Dibayar dari</dt>
            <dd>{sumber ? namaRekening(sumber) : 'Kas besar'}</dd>
            {a.assetAccount ? (
              <>
                <dt>Akun</dt>
                <dd>
                  aset {a.assetAccount.code}, akumulasi {a.accumAccount?.code}, beban {a.expenseAccount?.code}
                </dd>
              </>
            ) : null}
            {!bolehUbah ? (
              <>
                <dt>Catatan</dt>
                <dd>{a.note || '-'}</dd>
              </>
            ) : null}
          </dl>
          )}
        </section>

        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <ul className="daftar-waktu">
            <li>
              <span className="titik" aria-hidden="true" />
              <span>
                <b>Dibuat</b>
                <small className="redup">
                  {formatWaktu(a.createdAt)} oleh {nama(a.createdBy)}
                </small>
              </span>
            </li>
            {a.activatedAt ? (
              <li>
                <span className="titik hijau" aria-hidden="true" />
                <span>
                  <b>Disetujui dan aktif</b>
                  <small className="redup">
                    {formatWaktu(a.activatedAt)} oleh {nama(a.activatedBy)}
                  </small>
                </span>
              </li>
            ) : null}
            {a.cancelledAt ? (
              <li>
                <span className="titik merah" aria-hidden="true" />
                <span>
                  <b>Dibatalkan</b>
                  <small className="redup">
                    {formatWaktu(a.cancelledAt)} oleh {nama(a.cancelledBy)}
                  </small>
                  {a.cancelReason ? <small>Alasan: {a.cancelReason}</small> : null}
                </span>
              </li>
            ) : null}
          </ul>
          <h3>Jurnal</h3>
          <JurnalDokumen p={p} docType="fixed_asset" docId={a.id} />
          <div className="as-tindakan">
            {draf && iz('S') ? <TombolAksi aksi={aktifkanAsetAksi.bind(null, a.id)} label="Setujui dan aktifkan" konfirmasi={`Aktifkan ${a.code}? Perolehan ${formatRupiah(a.cost)} dijurnal dan data angkanya tidak bisa diubah lagi.`} /> : null}
            {draf && iz('H') ? <TombolAksi aksi={hapusAsetAksi.bind(null, a.id)} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${a.code}?`} /> : null}
            {aktif && iz('S') && saklarNyala(p, 'dok.batal_posting') && a.accumDepreciation === 0n ? (
              <details>
                <summary>Batalkan aset</summary>
                <FormBatal aksi={batalAsetAksi.bind(null, a.id)} wajibAlasan label="Batalkan aset" konfirmasi={`Batalkan ${a.code}? Jurnal perolehannya dibalik.`} />
              </details>
            ) : null}
          </div>
          {draf && !iz('S') ? <p className="as-catatan">Menunggu Owner menyetujui dan mengaktifkan aset ini.</p> : null}
        </section>
      </div>

      <section className="kartu" aria-labelledby="j-susut">
        <h2 id="j-susut">Riwayat penyusutan</h2>
        {a.assetDepreciations.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel as-tabel">
              <thead>
                <tr>
                  <th scope="col">Bulan</th>
                  <th scope="col">Dokumen</th>
                  <th scope="col" className="angka">
                    Penyusutan
                  </th>
                  <th scope="col" className="angka">
                    Akumulasi sesudahnya
                  </th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {a.assetDepreciations.map((d) => (
                  <tr key={d.id}>
                    <td data-label="Bulan">{namaPeriode(d.run.yearMonth)}</td>
                    <td data-label="Dokumen">
                      <TautanDok p={p} menu="aset.penyusutan" href={`/penyusutan/${d.run.id}`} teks={d.run.no} />
                    </td>
                    <td data-label="Penyusutan" className="angka">
                      {formatRupiah(d.amount)}
                    </td>
                    <td data-label="Akumulasi sesudahnya" className="angka">
                      {formatRupiah(d.accumAfter)}
                    </td>
                    <td data-label="Status">
                      <LencanaStatus status={d.run.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">{draf ? 'Aset draf belum disusutkan.' : 'Belum ada penyusutan.'}</p>
        )}
        {a.assetDisposals.length ? (
          <>
            <h3>Pelepasan</h3>
            <ul className="bl-turunan">
              {a.assetDisposals.map((x) => (
                <li key={x.id}>
                  <TautanDok p={p} menu="aset.penyusutan" href={`/pelepasan-aset/${x.id}`} teks={x.no} /> {formatTanggal(x.date)} <LencanaStatus status={x.status} />
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>
    </>
  )
}
