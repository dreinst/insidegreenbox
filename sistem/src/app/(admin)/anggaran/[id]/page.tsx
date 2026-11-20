import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PesanAset } from '@/components/aset'
import { FormRincianAnggaran } from '@/components/aset-form'
import { Ringkas } from '@/components/beli'
import { FormMaster } from '@/components/form-master'
import { LencanaStatus } from '@/components/stok'
import { JejakStatus } from '@/components/stok-dok'
import { FormBatal, TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { JENIS_AKUN } from '@/lib/akuntansi/akun'
import { muatAnggaran, NAMA_BULAN_PENDEK, pilihanAkunAnggaran } from '@/lib/anggaran/anggaran'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'
import { batalAnggaranAksi, hapusAkunAnggaranAksi, hapusAnggaranAksi, revisiAnggaranAksi, setujuiAnggaranAksi, simpanRincianAnggaranAksi, tambahAkunAnggaranAksi, ubahKepalaAnggaranAksi } from '../../_aset/aksi'

export const metadata: Metadata = { title: 'Anggaran' }

const ribu = (n: bigint) => Number(n).toLocaleString('id-ID')

export default async function RincianAnggaran({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('anggaran.anggaran', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [b, { pesan }] = await Promise.all([muatAnggaran(db, id), searchParams])
  if (!b) notFound()
  const iz = (x: 'T' | 'U' | 'H' | 'S') => punyaIzin(p.izin, 'anggaran.anggaran', x)
  const draf = b.status === 'Draft'
  const bolehUbah = draf && (iz('T') || iz('U'))
  const berlaku = b.status === 'Disetujui' && !b.replacedAt
  const sudahAda = new Set(b.akun.map((a) => a.id))
  const akunPilihan = bolehUbah ? (await pilihanAkunAnggaran(db)).filter((a) => !sudahAda.has(a.id)) : []
  const revisiTerbuka = b.revisions.find((r) => r.status === 'Draft')
  const jejak = { ...b, postedBy: null, postedAt: null }
  return (
    <>
      <KepalaHalaman judul={`${b.no} ${b.name}`} keterangan={`Anggaran tahun ${b.year} · versi ${b.version}`} jejak={{ href: '/anggaran', label: 'Anggaran' }}>
        <LencanaStatus status={b.status} />
        {b.status === 'Disetujui' ? <span className={`lencana ${b.replacedAt ? 'abu' : 'biru'}`}>{b.replacedAt ? 'Digantikan' : 'Berlaku'}</span> : null}
        <Link href={`/realisasi-anggaran?tahun=${b.year}${b.status === 'Disetujui' && b.replacedAt ? `&anggaran=${b.id}` : ''}`} className="btn sekunder">
          Lihat realisasi
        </Link>
      </KepalaHalaman>
      <PesanAset kode={pesan} />
      <Ringkas
        label="Ringkasan anggaran"
        isi={[
          ['Jumlah setahun', formatRupiah(b.total)],
          ['Pendapatan', formatRupiah(b.akun.filter((a) => a.kind === 'Pendapatan').reduce((n, a) => n + a.total, 0n))],
          ['HPP dan beban', formatRupiah(b.akun.filter((a) => a.kind !== 'Pendapatan').reduce((n, a) => n + a.total, 0n))],
          ['Jumlah akun', String(b.akun.length)],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data anggaran</h2>
          {bolehUbah ? (
            <FormMaster
              aksi={ubahKepalaAnggaranAksi.bind(null, b.id)}
              medan={[
                { jenis: 'teks', nama: 'name', label: 'Nama anggaran', awal: b.name, wajib: true, maxLength: 80 },
                { jenis: 'angka', nama: 'year', label: 'Tahun', awal: String(b.year), wajib: true, inputMode: 'numeric', bantuan: b.revisedFromId ? 'Tahun revisi sama dengan anggaran asalnya.' : undefined },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: b.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Tahun</dt>
              <dd>{b.year}</dd>
              <dt>Catatan</dt>
              <dd>{b.note || '-'}</dd>
            </dl>
          )}
          {b.revisedFrom || b.revisions.length ? (
            <>
              <h3>Riwayat versi</h3>
              <ul className="bl-turunan">
                {b.revisedFrom ? (
                  <li>
                    Revisi dari <Link href={`/anggaran/${b.revisedFrom.id}`}>{b.revisedFrom.no}</Link> versi {b.revisedFrom.version}
                  </li>
                ) : null}
                {b.revisions.map((r) => (
                  <li key={r.id}>
                    <Link href={`/anggaran/${r.id}`}>{r.no}</Link> versi {r.version} <LencanaStatus status={r.status} />
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <JejakStatus d={jejak} />
          {b.replacedAt ? <p className="as-catatan">Digantikan revisi yang disetujui. Angka versi ini tetap tersimpan sebagai riwayat.</p> : null}
          <div className="as-tindakan">
            {draf && iz('S') ? <TombolAksi aksi={setujuiAnggaranAksi.bind(null, b.id)} label="Setujui anggaran" konfirmasi={`Setujui ${b.no} sebesar ${formatRupiah(b.total)}? Sesudah disetujui, perubahan dibuat lewat revisi.`} /> : null}
            {berlaku && iz('T') && !revisiTerbuka ? <TombolAksi aksi={revisiAnggaranAksi.bind(null, b.id)} label="Buat revisi" kelas="btn sekunder" konfirmasi={`Salin ${b.no} menjadi draf versi ${b.version + 1}?`} /> : null}
            {revisiTerbuka ? (
              <p className="as-catatan">
                Draf revisi: <Link href={`/anggaran/${revisiTerbuka.id}`}>{revisiTerbuka.no}</Link>
              </p>
            ) : null}
            {draf && iz('H') ? <TombolAksi aksi={hapusAnggaranAksi.bind(null, b.id)} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${b.no}?`} /> : null}
            {(draf && iz('U')) || (berlaku && iz('S')) ? (
              <details>
                <summary>Batalkan anggaran</summary>
                <FormBatal aksi={batalAnggaranAksi.bind(null, b.id)} wajibAlasan={!draf} label="Batalkan anggaran" konfirmasi={`Batalkan ${b.no}?`} />
              </details>
            ) : null}
          </div>
        </section>
      </div>

      <section className="kartu" aria-labelledby="j-rincian">
        <h2 id="j-rincian">Rincian per bulan</h2>
        {b.akun.length ? (
          bolehUbah ? (
            <FormRincianAnggaran
              aksi={simpanRincianAnggaranAksi.bind(null, b.id)}
              namaBulan={NAMA_BULAN_PENDEK}
              baris={b.akun.map((a) => ({ id: a.id, code: a.code, name: a.name, jenis: JENIS_AKUN[a.kind], bulan: a.bulan.map((v) => v.toString()), total: formatRupiah(a.total) }))}
            />
          ) : (
            <div className="kartu tanpa-isi ag-gulir" role="region" aria-label="Rincian anggaran per bulan" tabIndex={0}>
              <table className="tabel ag-tabel">
                <thead>
                  <tr>
                    <th scope="col">Akun</th>
                    {NAMA_BULAN_PENDEK.map((m) => (
                      <th key={m} scope="col" className="angka">
                        {m}
                      </th>
                    ))}
                    <th scope="col" className="angka">
                      Setahun
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {b.akun.map((a) => (
                    <tr key={a.id}>
                      <td data-label="Akun">
                        <span className="tebal">
                          {a.code} {a.name}
                        </span>
                        <small className="redup blok">{JENIS_AKUN[a.kind]}</small>
                      </td>
                      {a.bulan.map((v, i) => (
                        <td key={i} data-label={NAMA_BULAN_PENDEK[i]} className="angka">
                          {ribu(v)}
                        </td>
                      ))}
                      <td data-label="Setahun" className="ag-total">
                        {formatRupiah(a.total)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <p className="kosong">Belum ada akun di anggaran ini.</p>
        )}
        {bolehUbah && b.akun.length ? (
          <details className="bl-lipat as-lipat">
            <summary>Hapus akun dari anggaran</summary>
            <ul className="bl-turunan" aria-label="Hapus akun">
              {b.akun.map((a) => (
                <li key={a.id}>
                  <TombolAksi aksi={hapusAkunAnggaranAksi.bind(null, b.id, a.id)} label={`Hapus ${a.code}`} kelas="btn kecil sekunder" konfirmasi={`Hapus ${a.code} ${a.name} dari anggaran?`} />
                </li>
              ))}
            </ul>
          </details>
        ) : null}
        {bolehUbah ? (
          <>
            <h3>Tambah akun</h3>
            <FormMaster
              aksi={tambahAkunAnggaranAksi.bind(null, b.id)}
              medan={[
                { jenis: 'pilih', nama: 'accountId', label: 'Akun', pilihan: [{ nilai: '', label: 'Pilih akun' }, ...akunPilihan.map((a) => ({ nilai: String(a.id), label: `${a.code} ${a.name} (${JENIS_AKUN[a.kind]})` }))], wajib: true, lebar: true },
                { jenis: 'angka', nama: 'tahunan', label: 'Jumlah setahun (Rp)', inputMode: 'numeric', placeholder: '12.000.000', bantuan: 'Dibagi rata ke 12 bulan; sisa pembagian masuk Desember. Angka per bulan bisa diubah sesudahnya.' },
              ]}
              tombol="Tambah akun"
              kelasTombol="btn sekunder"
            />
          </>
        ) : null}
      </section>
    </>
  )
}
