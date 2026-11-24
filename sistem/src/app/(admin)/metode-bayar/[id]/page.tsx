import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { FormMaster, FormStatusMaster } from '@/components/form-master'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatWaktu } from '@/lib/waktu'
import { JENIS_METODE, pemakaianMetode, riwayatTarif, type JenisMetode } from '@/lib/metode-bayar'
import { persenTeks, teksTarif } from '@/lib/mdr'
import { statusMetodeAksi, tambahTarifAksi, ubahMetodeAksi } from '../aksi'
import { medanTarif, medanUbahMetode } from '../medan'

export const metadata: Metadata = { title: 'Metode Bayar' }

export default async function RincianMetode({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('akun.metode_bayar', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [m, { pesan }, riwayat, dipakai] = await Promise.all([db.paymentMethod.findUnique({ where: { id } }), searchParams, riwayatTarif(db, id), pemakaianMetode(db, id)])
  if (!m) notFound()
  const bolehUbah = punyaIzin(p.izin, 'akun.metode_bayar', 'U')
  const bolehTarif = punyaIzin(p.izin, 'akun.metode_bayar', 'T')
  const berlaku = riwayat.find((r) => r.keadaan === 'berlaku')
  const mdr = teksTarif(berlaku?.tarif ?? null)
  return (
    <>
      <KepalaHalaman judul={m.name} keterangan={`${JENIS_METODE[m.kind as JenisMetode] ?? m.kind} · MDR ${mdr}`} jejak={{ href: '/metode-bayar', label: 'Metode Bayar' }}>
        <Lencana aktif={m.active} />
      </KepalaHalaman>
      <PesanMaster kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data metode</h2>
          {bolehUbah ? (
            <FormMaster aksi={ubahMetodeAksi.bind(null, m.id)} medan={medanUbahMetode({ name: m.name, kind: m.kind, openDrawer: m.openDrawer, dipakai })} tombol="Simpan perubahan" />
          ) : (
            <dl className="rincian">
              <dt>Nama</dt>
              <dd>{m.name}</dd>
              <dt>Jenis</dt>
              <dd>{JENIS_METODE[m.kind as JenisMetode] ?? m.kind}</dd>
              <dt>MDR hari ini</dt>
              <dd>{mdr}</dd>
              <dt>Buka laci</dt>
              <dd>{m.openDrawer ? 'Ya' : 'Tidak'}</dd>
            </dl>
          )}
        </section>
        <section className="kartu" aria-labelledby="j-status">
          <h2 id="j-status">Status</h2>
          <dl className="rincian">
            <dt>Status</dt>
            <dd>
              <Lencana aktif={m.active} />
            </dd>
          </dl>
          {bolehUbah ? (
            m.active ? (
              <FormStatusMaster aksi={statusMetodeAksi.bind(null, m.id, false)} aktif label="Nonaktifkan metode" konfirmasi={`Nonaktifkan ${m.name}? Kasir tidak bisa memilihnya lagi.`} />
            ) : (
              <FormStatusMaster aksi={statusMetodeAksi.bind(null, m.id, true)} aktif={false} label="Aktifkan lagi" />
            )
          ) : null}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=payment_method&dok=${m.id}`}>Lihat jejak audit metode ini</Link>
            </p>
          ) : null}
        </section>
      </div>

      <section className="kartu tanpa-isi" aria-labelledby="j-tarif">
        <div className="kartu-judul-dalam">
          <h2 id="j-tarif">Tarif MDR</h2>
          <p className="redup">
            Berlaku hari ini: <b>{mdr}</b>. MDR setoran dihitung per transaksi dengan tarif yang berlaku pada tanggal penjualan. Transaksi sampai batas bebas tidak kena MDR; di atasnya kena MDR
            dari seluruh nominal.
          </p>
        </div>
        {riwayat.length ? (
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Berlaku mulai</th>
                <th scope="col" className="angka">
                  MDR
                </th>
                <th scope="col" className="angka">
                  Batas bebas
                </th>
                <th scope="col">Keterangan</th>
                <th scope="col">Dicatat</th>
                <th scope="col">Keadaan</th>
              </tr>
            </thead>
            <tbody>
              {riwayat.map((r) => (
                <tr key={r.id}>
                  <td data-label="Berlaku mulai" className="tebal">
                    {new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' }).format(r.effectiveFrom)}
                  </td>
                  <td data-label="MDR" className="angka">
                    {persenTeks(r.tarif.mdrPct)}
                  </td>
                  <td data-label="Batas bebas" className="angka">
                    {r.tarif.freeLimit === null ? 'Tidak ada' : `Rp ${r.tarif.freeLimit.toLocaleString('id-ID')}`}
                  </td>
                  <td data-label="Keterangan" className="pecah">
                    {r.note || '-'}
                  </td>
                  <td data-label="Dicatat">
                    <span>
                      {r.oleh} <small className="redup">{formatWaktu(r.createdAt)}</small>
                    </span>
                  </td>
                  <td data-label="Keadaan">
                    <span className={`lencana ${r.keadaan === 'berlaku' ? 'hijau' : r.keadaan === 'nanti' ? 'kuning' : 'abu'}`}>{r.keadaan === 'berlaku' ? 'Berlaku' : r.keadaan === 'nanti' ? 'Akan berlaku' : 'Lama'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="redup kartu-judul-dalam jarak-bawah">Belum ada tarif. MDR metode ini dihitung 0 sampai tarif ditambah.</p>
        )}
      </section>

      {bolehTarif ? (
        <section className="kartu" aria-labelledby="j-tarif-baru">
          <h2 id="j-tarif-baru">Tambah tarif baru</h2>
          <p className="redup">Tarif lama tetap tersimpan. Setoran yang sudah dibuat tidak dihitung ulang; shift baru yang masuk lewat Muat ulang baris memakai tarif baru.</p>
          <FormMaster aksi={tambahTarifAksi.bind(null, m.id)} medan={medanTarif()} tombol="Simpan tarif" />
        </section>
      ) : null}
    </>
  )
}
