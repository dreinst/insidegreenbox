import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LencanaShift, selisihTeks } from '@/components/kasir-umum'
import { KepalaHalaman, PesanFlash } from '@/components/umum'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { ambilShift, rekapMetode } from '@/lib/shift'
import { formatWaktu } from '@/lib/waktu'
import { kasLaciAksi, setujuiShiftAksi, tutupShiftAksi } from '../aksi'
import { FormKas, FormSetujui, FormTutup } from '../form'
import '@/components/kasir.css'

export const metadata: Metadata = { title: 'Shift' }

export default async function RincianShift({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('kasir.shift', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [s, { pesan }] = await Promise.all([ambilShift(db, p, id), searchParams])
  if (!s) notFound()
  const buka = s.status === 'Buka'
  // Hitung buta: rekap uang dan kas seharusnya baru tampil sesudah shift ditutup (RANCANGAN 6.1).
  const rekap = buka ? null : await rekapMetode(db, id)
  const [jumlahJual, namaPenutup] = await Promise.all([
    db.sale.count({ where: { shiftId: id, status: 'Selesai' } }),
    s.closedBy ? db.appUser.findUnique({ where: { id: s.closedBy }, select: { name: true } }) : null,
  ])
  const bolehUbah = buka && punyaIzin(p.izin, 'kasir.shift', 'U')
  const bolehSetuju = s.status === 'PerluPersetujuan' && punyaIzin(p.izin, 'kasir.shift', 'S')
  const lembar = (s.denominationsJson ?? null) as Record<string, number> | null
  const masuk = s.shiftCashMoves.filter((m) => m.kind === 'masuk').reduce((a, m) => a + Number(m.amount), 0)
  const keluar = s.shiftCashMoves.filter((m) => m.kind === 'keluar').reduce((a, m) => a + Number(m.amount), 0)

  return (
    <>
      <KepalaHalaman judul={`Shift #${s.id}`} keterangan={`${s.user.name} · ${s.location.name}`} jejak={{ href: '/shift', label: 'Shift' }}>
        <LencanaShift status={s.status} />
      </KepalaHalaman>
      <PesanFlash kode={pesan} />
      {s.status === 'PerluPersetujuan' ? (
        <p className="pesan peringatan" role="status">
          Selisih kas {selisihTeks(s.cashDiff).toLowerCase()} melewati batas {s.diffLimit === null ? 'yang berlaku' : rupiah(s.diffLimit)}. Shift ini menunggu persetujuan Owner.
        </p>
      ) : null}

      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data shift</h2>
          <dl className="rincian">
            <dt>Kasir</dt>
            <dd>{s.user.name}</dd>
            <dt>Dibuka</dt>
            <dd>{formatWaktu(s.openedAt)}</dd>
            <dt>Modal awal</dt>
            <dd>{rupiah(s.openCash)}</dd>
            <dt>Transaksi selesai</dt>
            <dd>
              {jumlahJual}
              {punyaIzin(p.izin, 'kasir.transaksi', 'L') ? (
                <>
                  {' · '}
                  <Link href={`/transaksi?shift=${s.id}`}>Lihat transaksi</Link>
                </>
              ) : null}
            </dd>
            <dt>Ditutup</dt>
            <dd>{s.closedAt ? `${formatWaktu(s.closedAt)}${namaPenutup ? ` oleh ${namaPenutup.name}` : ''}` : 'Belum'}</dd>
          </dl>
        </section>

        {!buka ? (
          <section className="kartu" aria-labelledby="j-kas">
            <h2 id="j-kas">Hitung kas</h2>
            <dl className="rincian angka">
              <dt>Modal awal</dt>
              <dd>{rupiah(s.openCash)}</dd>
              <dt>Penjualan tunai</dt>
              <dd>{rupiah(Number(s.expectedCash ?? 0) - Number(s.openCash) - masuk + keluar)}</dd>
              <dt>Kas masuk laci</dt>
              <dd>{rupiah(masuk)}</dd>
              <dt>Kas keluar laci</dt>
              <dd>-{rupiah(keluar)}</dd>
              <dt className="tebal">Kas seharusnya</dt>
              <dd className="tebal">{rupiah(s.expectedCash ?? 0)}</dd>
              <dt className="tebal">Kas dihitung</dt>
              <dd className="tebal">{rupiah(s.countedCash ?? 0)}</dd>
              <dt>Selisih</dt>
              <dd className={Number(s.cashDiff ?? 0) === 0 ? '' : 'teks-merah tebal'}>{selisihTeks(s.cashDiff)}</dd>
              <dt>Batas tanpa persetujuan</dt>
              <dd>{s.diffLimit === null ? 'Tidak ada' : rupiah(s.diffLimit)}</dd>
            </dl>
            {lembar && Object.keys(lembar).length ? (
              <p className="redup kecil">
                Pecahan:{' '}
                {Object.entries(lembar)
                  .sort((a, b) => Number(b[0]) - Number(a[0]))
                  .map(([nilai, n]) => `${n} x ${rupiah(Number(nilai))}`)
                  .join(', ')}
              </p>
            ) : null}
            {s.note ? (
              <p>
                <b>Catatan kasir:</b> {s.note}
              </p>
            ) : null}
            {s.approvedAt ? (
              <p>
                <b>Disetujui</b> {s.approver?.name} pada {formatWaktu(s.approvedAt)}: {s.approvalNote}
              </p>
            ) : null}
          </section>
        ) : null}

        {rekap ? (
          <section className="kartu" aria-labelledby="j-rekap">
            <h2 id="j-rekap">Rekap per metode bayar</h2>
            {rekap.metode.length ? (
              <ul className="daftar-angka">
                {rekap.metode.map((m) => (
                  <li key={m.nama}>
                    <span>
                      {m.nama} <small className="redup">({m.n} pembayaran)</small>
                    </span>
                    <b>{rupiah(m.total)}</b>
                  </li>
                ))}
                <li>
                  <span className="tebal">Omzet ({rekap.selesai} transaksi)</span>
                  <b>{rupiah(rekap.omzet)}</b>
                </li>
              </ul>
            ) : (
              <p className="redup">Tidak ada penjualan di shift ini.</p>
            )}
            {rekap.void ? <p className="redup kecil">{rekap.void} transaksi void tidak dihitung.</p> : null}
          </section>
        ) : null}

        {bolehSetuju ? (
          <section className="kartu" aria-labelledby="j-setuju">
            <h2 id="j-setuju">Setujui selisih</h2>
            <p className="redup">Sesudah disetujui, shift berstatus Ditutup dan bisa masuk setoran.</p>
            <FormSetujui aksi={setujuiShiftAksi.bind(null, s.id)} />
          </section>
        ) : null}
      </div>

      {bolehUbah ? (
        <div className="kisi">
          <section className="kartu" aria-labelledby="j-laci">
            <h2 id="j-laci">Kas masuk dan keluar laci</h2>
            <FormKas aksi={kasLaciAksi.bind(null, s.id)} />
          </section>
          <section className="kartu" aria-labelledby="j-tutup">
            <h2 id="j-tutup">Tutup shift</h2>
            <FormTutup aksi={tutupShiftAksi.bind(null, s.id)} />
          </section>
        </div>
      ) : null}

      <section className="kartu tanpa-isi" aria-labelledby="j-gerak">
        <h2 id="j-gerak" className="kartu-judul-dalam">
          Catatan kas laci
        </h2>
        {s.shiftCashMoves.length ? (
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Waktu</th>
                <th scope="col">Jenis</th>
                <th scope="col">Jumlah</th>
                <th scope="col">Alasan</th>
              </tr>
            </thead>
            <tbody>
              {s.shiftCashMoves.map((m) => (
                <tr key={m.id}>
                  <td data-label="Waktu">{formatWaktu(m.at)}</td>
                  <td data-label="Jenis">{m.kind === 'masuk' ? 'Kas masuk' : 'Kas keluar'}</td>
                  <td data-label="Jumlah">{rupiah(m.amount)}</td>
                  <td data-label="Alasan" className="pecah">
                    {m.reason}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="redup kartu-judul-dalam jarak-bawah">Belum ada kas masuk atau keluar laci.</p>
        )}
      </section>
    </>
  )
}
