import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PesanAkuntansi, rp } from '@/components/akuntansi'
import { FormMaster } from '@/components/form-master'
import { formatTanggal, isoTanggal, LencanaStatus } from '@/components/stok'
import { JejakStatus } from '@/components/stok-dok'
import { FormBatal, TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { pilihanAkun } from '@/lib/akuntansi/akun'
import { namaSumber, tautanSumber } from '@/lib/akuntansi/dokumen'
import { namaPeriode } from '@/lib/akuntansi/jurnal'
import { ambilJurnal, butuhSetujuMemorial, tombolMemorial } from '@/lib/akuntansi/memorial'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { hapusBarisMemorialAksi, hapusMemorialAksi, statusMemorialAksi, tambahBarisMemorialAksi, ubahKepalaMemorialAksi } from '../aksi'

export const metadata: Metadata = { title: 'Jurnal' }

export default async function RincianJurnal({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('akun.jurnal', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [j, { pesan }] = await Promise.all([ambilJurnal(db, id), searchParams])
  if (!j) notFound()
  const memorial = j.sourceType === 'memorial'
  const butuhSetuju = memorial ? await butuhSetujuMemorial(db) : false
  const t = memorial ? tombolMemorial(p, j.status, butuhSetuju, j.submittedBy) : null
  const akun = t?.ubah ? await pilihanAkun(db) : []
  const sumber = memorial ? null : tautanSumber(j.sourceType, j.sourceId, j.docNo)
  const selisih = j.debit - j.kredit
  const lihatBB = punyaIzin(p.izin, 'akun.buku_besar', 'L')
  return (
    <>
      <KepalaHalaman judul={j.no} keterangan={`${namaSumber(j.sourceType)} · ${formatTanggal(j.date)}${j.docNo && !memorial ? ` · ${j.docNo}` : ''}`} jejak={{ href: '/jurnal', label: 'Jurnal Umum' }}>
        <LencanaStatus status={j.status} />
      </KepalaHalaman>
      <PesanAkuntansi kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data jurnal</h2>
          {t?.ubah ? (
            <FormMaster
              aksi={ubahKepalaMemorialAksi.bind(null, j.id)}
              medan={[
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal jurnal', awal: isoTanggal(j.date), wajib: true },
                { jenis: 'area', nama: 'memo', label: 'Keterangan', awal: j.memo, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Tanggal</dt>
              <dd>{formatTanggal(j.date)}</dd>
              <dt>Sumber</dt>
              <dd>
                {namaSumber(j.sourceType)}
                {!memorial && j.docNo ? <> · {sumber ? <Link href={sumber}>{j.docNo}</Link> : j.docNo}</> : null}
              </dd>
              <dt>Keterangan</dt>
              <dd>{j.memo || '-'}</dd>
              <dt>Periode</dt>
              <dd>{j.period ? `${namaPeriode(j.period.yearMonth)} (${j.period.status})` : 'Belum berlaku'}</dd>
              {j.reversalOf ? (
                <>
                  <dt>Membalik</dt>
                  <dd>
                    <Link href={`/jurnal/${j.reversalOf.id}`}>{j.reversalOf.no}</Link>
                  </dd>
                </>
              ) : null}
              {j.reversals.length ? (
                <>
                  <dt>Dibalik oleh</dt>
                  <dd>
                    {j.reversals.map((r) => (
                      <Link key={r.id} href={`/jurnal/${r.id}`}>
                        {r.no} ({formatTanggal(r.date)})
                      </Link>
                    ))}
                  </dd>
                </>
              ) : null}
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-tindakan">
          <div className="kartu-kepala">
            <h2 id="j-tindakan">Status{t ? ' dan tindakan' : ''}</h2>
            <LencanaStatus status={j.status} />
          </div>
          {memorial && butuhSetuju && j.status === 'Draft' ? <p className="catatan">Jurnal memorial perlu diajukan lalu disetujui Owner. Penyetuju menekan Setujui dan posting.</p> : null}
          {!memorial ? <p className="redup kecil">Jurnal ini dibentuk otomatis saat dokumen sumbernya diposting atau dibatalkan, jadi tidak bisa diubah di sini.</p> : null}
          <JejakStatus d={j} />
          {t && (t.ajukan || t.kembalikan || t.posting || t.hapus) ? (
            <div className="deret-tombol">
              {t.posting ? <TombolAksi aksi={statusMemorialAksi.bind(null, j.id, 'posting')} label={t.setujuiPosting ? 'Setujui dan posting' : 'Posting'} konfirmasi={`Posting ${j.no}? Jurnal masuk buku besar dan tidak bisa diubah lagi.`} /> : null}
              {t.ajukan ? <TombolAksi aksi={statusMemorialAksi.bind(null, j.id, 'ajukan')} label={butuhSetuju ? 'Ajukan untuk disetujui' : 'Ajukan'} kelas={t.posting ? 'btn sekunder' : 'btn'} /> : null}
              {t.kembalikan ? <TombolAksi aksi={statusMemorialAksi.bind(null, j.id, 'kembalikan')} label="Kembalikan ke draf" kelas="btn sekunder" /> : null}
              {t.hapus ? <TombolAksi aksi={hapusMemorialAksi.bind(null, j.id)} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${j.no}? Nomornya tidak dipakai ulang.`} /> : null}
            </div>
          ) : null}
          {t?.batal ? (
            <details className="lipat-batal">
              <summary>Batalkan jurnal</summary>
              <FormBatal aksi={statusMemorialAksi.bind(null, j.id, 'batal')} wajibAlasan={false} label="Batalkan jurnal" konfirmasi={`Batalkan ${j.no}?`} />
            </details>
          ) : null}
          {t?.batalPosting ? (
            <details className="lipat-batal">
              <summary>Batalkan jurnal yang sudah Diposting</summary>
              <p className="redup kecil">Sistem membuat jurnal balik bertanggal hari ini. Alasan wajib diisi.</p>
              <FormBatal aksi={statusMemorialAksi.bind(null, j.id, 'batal')} wajibAlasan label="Batalkan dengan jurnal balik" konfirmasi={`Batalkan ${j.no}? Jurnal balik bertanggal hari ini akan dibuat.`} />
            </details>
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') && memorial ? (
            <p>
              <Link href={`/audit?entitas=journal&dok=${j.id}`}>Lihat jejak audit jurnal ini</Link>
            </p>
          ) : null}
        </section>
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">Baris jurnal</h2>
        {j.journalLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel jr-tabel">
              <thead>
                <tr>
                  <th scope="col">Akun</th>
                  <th scope="col">Keterangan</th>
                  <th scope="col" className="angka">
                    Debit
                  </th>
                  <th scope="col" className="angka">
                    Kredit
                  </th>
                  {t?.ubah ? (
                    <th scope="col">
                      <span className="sr">Tindakan</span>
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {j.journalLines.map((l) => (
                  <tr key={l.id} className={l.credit > 0n ? 'jr-kredit' : undefined}>
                    <td data-label="Akun">
                      <span className="ak-nama">
                        {lihatBB ? <Link href={`/buku-besar?akun=${l.account.id}&dari=${isoTanggal(j.date)}&sampai=${isoTanggal(j.date)}`}>{`${l.account.code} ${l.account.name}`}</Link> : `${l.account.code} ${l.account.name}`}
                      </span>
                    </td>
                    <td data-label="Keterangan" className="pecah">
                      {l.memo || '-'}
                    </td>
                    <td data-label="Debit" className="angka">
                      {l.debit ? rp(l.debit) : ''}
                    </td>
                    <td data-label="Kredit" className="angka">
                      {l.credit ? rp(l.credit) : ''}
                    </td>
                    {t?.ubah ? (
                      <td className="sel-aksi">
                        <TombolAksi aksi={hapusBarisMemorialAksi.bind(null, j.id, l.id)} label="Hapus" kelas="btn kecil sekunder" konfirmasi={`Hapus baris ${l.account.code} ${l.account.name}?`} />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td data-label="">Jumlah</td>
                  <td data-label="">{selisih ? <span className="lap-merah">Selisih {rp(selisih < 0n ? -selisih : selisih)}</span> : 'Seimbang'}</td>
                  <td data-label="Debit" className="angka">
                    {rp(j.debit)}
                  </td>
                  <td data-label="Kredit" className="angka">
                    {rp(j.kredit)}
                  </td>
                  {t?.ubah ? <td /> : null}
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada baris.</p>
        )}
        {t?.ubah ? (
          <>
            <h3>Tambah baris</h3>
            <FormMaster
              aksi={tambahBarisMemorialAksi.bind(null, j.id)}
              medan={[
                { jenis: 'pilih', nama: 'accountId', label: 'Akun', pilihan: [{ nilai: '', label: 'Pilih akun' }, ...akun.map((a) => ({ nilai: String(a.id), label: `${a.code} ${a.name}` }))], wajib: true, lebar: true },
                { jenis: 'angka', nama: 'debit', label: 'Debit (Rp)', placeholder: '0', bantuan: 'Isi debit atau kredit saja.' },
                { jenis: 'angka', nama: 'kredit', label: 'Kredit (Rp)', placeholder: '0' },
                { jenis: 'teks', nama: 'memo', label: 'Keterangan baris', maxLength: 200, lebar: true },
              ]}
              tombol="Tambah baris"
              kelasTombol="btn sekunder"
            />
          </>
        ) : null}
      </section>
    </>
  )
}
