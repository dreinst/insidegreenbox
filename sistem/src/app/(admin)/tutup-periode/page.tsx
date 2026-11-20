import type { Metadata } from 'next'
import { PesanAkuntansi, rp } from '@/components/akuntansi'
import { FormBatal, TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { daftarPeriode } from '@/lib/akuntansi/periode'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { isOwner, punyaIzin } from '@/lib/izin-inti'
import { formatWaktu } from '@/lib/waktu'
import { bukaPeriodeAksi, tutupPeriodeAksi } from './aksi'

export const metadata: Metadata = { title: 'Tutup Periode' }

export default async function TutupPeriode({ searchParams }: { searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('akun.tutup_periode', 'L')
  const [{ pesan }, daftar] = await Promise.all([searchParams, daftarPeriode(db)])
  const bolehTutup = punyaIzin(p.izin, 'akun.tutup_periode', 'T')
  const bolehBuka = punyaIzin(p.izin, 'akun.tutup_periode', 'H') && isOwner(p)
  return (
    <>
      <KepalaHalaman
        judul="Tutup Periode"
        keterangan="Periode bulanan yang ditutup mengunci tanggalnya: posting dokumen, jurnal memorial, dan pembatalan yang jurnalnya bertanggal di bulan itu ditolak. Hanya bulan yang sudah lewat yang bisa ditutup. Owner bisa membuka lagi dengan alasan."
      />
      <PesanAkuntansi kode={pesan} />
      <div className="kartu tanpa-isi">
        <table className="tabel">
          <thead>
            <tr>
              <th scope="col">Periode</th>
              <th scope="col">Status</th>
              <th scope="col" className="angka">
                Jurnal
              </th>
              <th scope="col" className="angka">
                Total debit
              </th>
              <th scope="col">Riwayat</th>
              <th scope="col">
                <span className="sr">Tindakan</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {daftar.map((b) => (
              <tr key={b.ym}>
                <td data-label="Periode" className="tebal">
                  {b.nama}
                </td>
                <td data-label="Status">
                  <span className={`lencana ${b.status === 'Ditutup' ? 'merah' : b.berjalan ? 'kuning' : 'hijau'}`}>{b.status === 'Ditutup' ? 'Ditutup' : b.berjalan ? 'Berjalan' : 'Terbuka'}</span>
                </td>
                <td data-label="Jurnal" className="angka">
                  {b.jurnal.toLocaleString('id-ID')}
                </td>
                <td data-label="Total debit" className="angka">
                  {rp(b.debit)}
                </td>
                <td data-label="Riwayat" className="pecah">
                  {b.status === 'Ditutup' && b.ditutupPada ? (
                    <small className="blok">
                      Ditutup {formatWaktu(b.ditutupPada)} oleh {b.ditutupOleh ?? '-'}
                    </small>
                  ) : null}
                  {b.dibukaPada ? (
                    <small className="blok redup">
                      Dibuka lagi {formatWaktu(b.dibukaPada)} oleh {b.dibukaOleh}: {b.alasanBuka}
                    </small>
                  ) : null}
                  {!b.ditutupPada && !b.dibukaPada ? '-' : null}
                </td>
                <td className="sel-aksi">
                  <div className="periode-tindakan">
                    {b.status !== 'Ditutup' && !b.berjalan && bolehTutup ? (
                      <TombolAksi aksi={tutupPeriodeAksi.bind(null, b.ym)} label={`Tutup ${b.nama}`} kelas="btn kecil" konfirmasi={`Tutup periode ${b.nama}? Posting dan pembatalan bertanggal di bulan itu akan ditolak.`} />
                    ) : null}
                    {b.status === 'Ditutup' && bolehBuka ? (
                      <details>
                        <summary>Buka lagi</summary>
                        <FormBatal aksi={bukaPeriodeAksi.bind(null, b.ym)} wajibAlasan labelAlasan="Alasan membuka lagi" label={`Buka ${b.nama}`} konfirmasi={`Buka lagi periode ${b.nama}?`} />
                      </details>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
