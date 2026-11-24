import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { nilaiTampil } from '@/components/laporan'
import { KepalaHalaman, PesanFlash } from '@/components/umum'
import { buktiPdf, buktiSah } from '@/lib/bukti'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { namaRekening } from '@/lib/rekening'
import { tarifPada, teksTarif } from '@/lib/mdr'
import { alasanButuhOwner, ambilSetoran, calonBaris, dariKolomTanggal, NAMA_STATUS_SETORAN, syaratShiftTanggal } from '@/lib/setoran'
import { STATUS_SHIFT } from '@/lib/shift'
import { formatWaktu } from '@/lib/waktu'
import { ajukanAksi, batalAksi, hapusAksi, kembalikanAksi, muatUlangAksi, postingAksi, ubahSetoranAksi } from '../aksi'
import { FormAlasan, FormTombol, FormUbah } from '../form'
import '../setoran.css'

export const metadata: Metadata = { title: 'Setoran POS' }

const jam = (d: Date | null) => (d ? formatWaktu(d) : '-')

export default async function RincianSetoran({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('kasir.setoran', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [st, { pesan }] = await Promise.all([ambilSetoran(db, id), searchParams])
  if (!st) notFound()
  const iso = dariKolomTanggal(st.date)
  const tunai = st.paymentMethod.kind === 'tunai'
  const terbuka = st.status === 'Draft' || st.status === 'Diajukan'
  const [rekening, masihBuka, calon] = await Promise.all([
    db.bankAccount.findMany({ where: { OR: [{ active: true }, ...(st.bankAccountId ? [{ id: st.bankAccountId }] : [])] }, orderBy: { bankName: 'asc' } }),
    terbuka && tunai ? db.shift.findMany({ where: { ...syaratShiftTanggal(iso), status: 'Buka' }, select: { id: true } }) : [],
    st.status === 'Draft' ? calonBaris(db, iso, st.paymentMethod, st.id) : [],
  ])
  // tahap 6C: tarif yang berlaku pada tanggal shift, untuk keterangan saja (hitungan memakai tanggal tiap penjualan).
  const tarif = tunai ? null : await tarifPada(db, st.paymentMethodId, iso)
  const shiftBaru = calon.filter((c) => !st.posSettlementLines.some((l) => l.shiftId === c.shiftId))
  const alasan = terbuka ? alasanButuhOwner(st) : []
  const bisa = (a: 'U' | 'H' | 'S' | 'P') => punyaIzin(p.izin, 'kasir.setoran', a)
  const bolehUbah = st.status === 'Draft' && bisa('U')
  const bolehPosting = terbuka && bisa('P') && (!alasan.length || bisa('S'))
  const bolehKembali = st.status === 'Diajukan' && (bisa('S') || (st.submittedBy === p.id && bisa('U')))
  const bolehBatal = st.status === 'Diposting' ? bisa('U') && bisa('P') && saklarNyala(p, 'dok.batal_posting') : st.status !== 'Batal' && bisa('U')
  const urlBukti = buktiSah(st.proofFile) ? `/setoran/${st.id}/bukti` : null
  return (
    <>
      <KepalaHalaman judul={`Setoran ${st.no}`} keterangan={`${st.paymentMethod.name} · shift tanggal ${iso}`} jejak={{ href: '/setoran', label: 'Setoran POS' }}>
        <span className={`st-status ${st.status}`}>{NAMA_STATUS_SETORAN[st.status]}</span>
      </KepalaHalaman>
      <PesanFlash kode={pesan} />
      {masihBuka.length ? (
        <p className="lap-peringatan" role="status">
          Shift {masihBuka.map((s) => `#${s.id}`).join(', ')} tanggal {iso} masih buka. Setoran tunai baru bisa diposting sesudah semua shift tanggal itu ditutup.
        </p>
      ) : null}
      {shiftBaru.length ? (
        <p className="lap-peringatan" role="status">
          Shift {shiftBaru.map((c) => `#${c.shiftId}`).join(', ')} sudah ditutup tetapi belum masuk setoran ini. Tekan Muat ulang baris.
        </p>
      ) : null}
      {alasan.length ? (
        <div className="lap-peringatan" role="status">
          Setoran ini butuh persetujuan Owner karena:
          <ul className="st-alasan">
            {alasan.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="kisi lap-atas">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data setoran</h2>
          <dl className="rincian">
            <dt>Tanggal shift</dt>
            <dd>{iso}</dd>
            <dt>Metode</dt>
            <dd>
              {st.paymentMethod.name} {tunai ? null : <small className="redup">(MDR {teksTarif(tarif?.tarif ?? null)})</small>}
            </dd>
            <dt>Rekening tujuan</dt>
            <dd>{st.bankAccount ? namaRekening(st.bankAccount) : tunai ? 'Kas Besar' : 'Belum dipilih'}</dd>
            <dt>Catatan</dt>
            <dd className="pecah">{st.note || '-'}</dd>
            <dt>Bukti setor</dt>
            <dd>
              {urlBukti ? (
                <a href={urlBukti} target="_blank" rel="noreferrer">
                  {buktiPdf(st.proofFile) ? 'Buka PDF bukti' : 'Lihat foto bukti'}
                </a>
              ) : (
                'Belum ada'
              )}
            </dd>
          </dl>
        </section>
        <section className="kartu" aria-labelledby="j-angka">
          <h2 id="j-angka">Angka</h2>
          <dl className="rincian angka">
            <dt>Nilai sistem</dt>
            <dd>{nilaiTampil(Number(st.expectedTotal), 'uang')}</dd>
            <dt>Nilai disetor</dt>
            <dd>{nilaiTampil(Number(st.actualTotal), 'uang')}</dd>
            <dt>Biaya MDR</dt>
            <dd>{rupiah(st.mdrFee)}</dd>
            <dt className="tebal">Selisih</dt>
            <dd className={st.diff ? 'lap-merah' : 'tebal'}>{nilaiTampil(Number(st.diff), 'selisih')}</dd>
          </dl>
          <p className="redup kecil">
            {tunai ? '' : 'Biaya MDR bawaan dihitung per transaksi dengan tarif yang berlaku pada tanggal penjualan, dan boleh diubah selama Draft. '}Selisih = disetor + MDR - nilai sistem. Jurnal
            dibentuk saat Diposting.
          </p>
        </section>
        <section className="kartu" aria-labelledby="j-jejak">
          <h2 id="j-jejak">Jejak status</h2>
          <dl className="rincian">
            <dt>Dibuat</dt>
            <dd>
              {st.oleh.dibuat ?? '-'}, {jam(st.createdAt)}
            </dd>
            {st.submittedAt ? (
              <>
                <dt>Diajukan</dt>
                <dd>
                  {st.oleh.diajukan}, {jam(st.submittedAt)}
                </dd>
              </>
            ) : null}
            {st.approvedAt ? (
              <>
                <dt>Disetujui</dt>
                <dd>
                  {st.oleh.disetujui}, {jam(st.approvedAt)}
                </dd>
              </>
            ) : null}
            {st.postedAt ? (
              <>
                <dt>Diposting</dt>
                <dd>
                  {st.oleh.diposting}, {jam(st.postedAt)}
                </dd>
              </>
            ) : null}
            {st.cancelledAt ? (
              <>
                <dt>Dibatalkan</dt>
                <dd>
                  {st.oleh.dibatalkan}, {jam(st.cancelledAt)}: {st.cancelReason}
                </dd>
              </>
            ) : null}
          </dl>
          {punyaIzin(p.izin, 'atur.audit', 'L') ? <Link href={`/audit?entitas=pos_settlement&dok=${st.id}`}>Lihat jejak audit setoran ini</Link> : null}
        </section>
      </div>

      {bolehUbah ? (
        <section className="kartu" aria-labelledby="j-ubah">
          <h2 id="j-ubah">Isi setoran</h2>
          <p className="redup">{tunai ? 'Nilai sistem tunai = kas dihitung saat tutup shift dikurangi modal yang ditinggal di laci.' : 'Nilai sistem = penjualan metode ini di shift. Isi nilai disetor sesuai dana yang masuk menurut mutasi.'}</p>
          <FormUbah
            aksi={ubahSetoranAksi.bind(null, st.id)}
            tunai={tunai}
            rekening={rekening.map((r) => ({ id: r.id, label: `${namaRekening(r)}${r.active ? '' : ' (nonaktif)'}` }))}
            kepala={{ bankAccountId: st.bankAccountId, mdrFee: Number(st.mdrFee), note: st.note, bukti: urlBukti ? { url: urlBukti, pdf: buktiPdf(st.proofFile) } : null }}
            baris={st.posSettlementLines.map((l) => ({ id: l.id, shift: l.shiftId, kasir: l.shift.user.name, waktu: formatWaktu(l.shift.openedAt), status: STATUS_SHIFT[l.shift.status], expected: Number(l.expected), actual: Number(l.actual), note: l.note }))}
          />
        </section>
      ) : (
        <section className="kartu tanpa-isi" aria-labelledby="j-baris">
          <h2 id="j-baris" className="kartu-judul-dalam">
            Baris shift
          </h2>
          <div className="lap-gulir" role="region" aria-label="Baris shift" tabIndex={0}>
            <table className="tabel lap-tabel">
              <thead>
                <tr>
                  <th scope="col">Shift</th>
                  <th scope="col">Kasir</th>
                  <th scope="col" className="angka">
                    Nilai sistem
                  </th>
                  <th scope="col" className="angka">
                    Nilai disetor
                  </th>
                  <th scope="col" className="angka">
                    Selisih
                  </th>
                  <th scope="col">Catatan</th>
                </tr>
              </thead>
              <tbody>
                {st.posSettlementLines.map((l) => (
                  <tr key={l.id}>
                    <td data-label="Shift" className="tebal">
                      <span>
                        <Link href={`/shift/${l.shiftId}`}>#{l.shiftId}</Link> <small className="redup">{STATUS_SHIFT[l.shift.status]}</small>
                      </span>
                    </td>
                    <td data-label="Kasir">{l.shift.user.name}</td>
                    <td data-label="Nilai sistem" className="angka">
                      {nilaiTampil(Number(l.expected), 'uang')}
                    </td>
                    <td data-label="Nilai disetor" className="angka">
                      {nilaiTampil(Number(l.actual), 'uang')}
                    </td>
                    <td data-label="Selisih" className={`angka${l.diff ? ' lap-merah' : ''}`}>
                      {nilaiTampil(Number(l.diff), 'selisih')}
                    </td>
                    <td data-label="Catatan" className="pecah">
                      {l.note || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {terbuka || bolehBatal ? (
        <section className="kartu" aria-labelledby="j-aksi">
          <h2 id="j-aksi">Tindakan</h2>
          <div className="st-aksi">
            {st.status === 'Draft' && bisa('U') ? <FormTombol aksi={muatUlangAksi.bind(null, st.id)} label="Muat ulang baris" kelas="btn sekunder" /> : null}
            {bolehPosting ? (
              <FormTombol
                aksi={postingAksi.bind(null, st.id)}
                label={alasan.length ? 'Setujui dan posting' : 'Posting setoran'}
                konfirmasi={`Posting setoran ${st.no}? Sesudah diposting setoran tidak bisa diubah.`}
              />
            ) : null}
            {st.status === 'Draft' && bisa('U') && !bolehPosting ? <FormTombol aksi={ajukanAksi.bind(null, st.id)} label="Ajukan ke Owner" /> : null}
            {bolehKembali ? <FormAlasan aksi={kembalikanAksi.bind(null, st.id)} nama="catatan" label="Catatan pengembalian (boleh kosong)" tombol="Kembalikan ke Draft" kelas="btn sekunder" /> : null}
            {st.status === 'Draft' && bisa('H') ? <FormTombol aksi={hapusAksi.bind(null, st.id)} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${st.no}? Nomornya tidak dipakai lagi.`} /> : null}
          </div>
          {st.status === 'Diajukan' && !bolehPosting ? <p className="redup">Menunggu Owner menyetujui dan memposting.</p> : null}
          {bolehBatal ? (
            <details className="st-jarak">
              <summary className="tebal">Batalkan setoran</summary>
              <FormAlasan
                aksi={batalAksi.bind(null, st.id)}
                nama="alasan"
                label="Alasan pembatalan"
                tombol="Batalkan setoran"
                wajib
                bantuan={st.status === 'Diposting' ? 'Shift di setoran ini bisa disetor ulang lewat setoran baru. Jurnal balik dibuat saat modul akuntansi ada.' : 'Shift di setoran ini bisa disetor ulang lewat setoran baru.'}
                konfirmasi={`Batalkan setoran ${st.no}?`}
              />
            </details>
          ) : st.status === 'Diposting' ? (
            <p className="redup">Membatalkan setoran yang sudah diposting butuh saklar Batalkan dokumen diposting (Owner).</p>
          ) : null}
        </section>
      ) : st.status === 'Diposting' ? (
        <p className="redup">Membatalkan setoran yang sudah diposting butuh saklar Batalkan dokumen diposting (Owner).</p>
      ) : null}
    </>
  )
}
