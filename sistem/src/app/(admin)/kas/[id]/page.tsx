import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Ringkas } from '@/components/beli'
import { FormMaster } from '@/components/form-master'
import { NAMA_JENIS_KAS, PanelKas, PesanKas } from '@/components/kas'
import { formatTanggal } from '@/components/stok'
import { TombolAksi } from '@/components/stok-form'
import { KepalaHalaman } from '@/components/umum'
import { peringatanKasMinus } from '@/lib/akuntansi/kas-minus'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { akunLawan, butuhSetujuKas, muatKas, namaDana, pilihanDana, tombolKas } from '@/lib/kas'
import { formatRupiah } from '@/lib/master'
import { hapusBarisKasAksi, hapusKasAksi, statusKasAksi, tambahBarisKasAksi, ubahKepalaKasAksi } from '../aksi'

export const metadata: Metadata = { title: 'Kas Masuk dan Keluar' }

const isoHari = (d: Date) => d.toISOString().slice(0, 10)

export default async function RincianKas({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('kas.transaksi', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatKas(db, id), searchParams])
  if (!d) notFound()
  if (d.kind === 'pindah') redirect(`/pindah-dana/${id}`)
  const setuju = await butuhSetujuKas(db, d.kind, d.amount)
  const t = tombolKas(p, 'kas.transaksi', d.status, setuju, d.submittedBy)
  const [dana, akun, namaSumber] = await Promise.all([t.ubah ? pilihanDana(db) : [], t.ubah ? akunLawan(db, p) : [], namaDana(db, d.bankAccountId)])
  const masuk = d.kind === 'masuk'
  const aksi = (a: 'ajukan' | 'kembalikan' | 'setujui' | 'posting' | 'batal') => statusKasAksi.bind(null, false, d.id, a)
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`${NAMA_JENIS_KAS[d.kind]} · ${namaSumber} · ${formatTanggal(d.date)}`} jejak={{ href: '/kas', label: 'Kas Masuk dan Keluar' }} />
      <PesanKas kode={pesan} />
      <Ringkas
        label="Ringkasan kas"
        isi={[
          ['Jenis', NAMA_JENIS_KAS[d.kind]],
          [masuk ? 'Masuk ke' : 'Keluar dari', namaSumber],
          ['Jumlah', formatRupiah(d.amount), !masuk],
          ['Baris akun', String(d.cashTransactionLines.length)],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahKepalaKasAksi.bind(null, d.id)}
              medan={[
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: isoHari(d.date), wajib: true },
                { jenis: 'pilih', nama: 'sumber', label: 'Kas atau rekening', awal: d.bankAccountId ? String(d.bankAccountId) : 'kas', pilihan: dana, wajib: true },
                { jenis: 'teks', nama: 'partyName', label: 'Dibayar ke atau diterima dari', awal: d.partyName, maxLength: 80 },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan kepala"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>{masuk ? 'Diterima dari' : 'Dibayar ke'}</dt>
              <dd>{d.partyName || '-'}</dd>
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelKas
          p={p}
          menu="kas.transaksi"
          d={d}
          butuhSetuju={setuju}
          aksi={{ ajukan: aksi('ajukan'), kembalikan: aksi('kembalikan'), setujui: aksi('setujui'), posting: aksi('posting'), batal: aksi('batal'), hapus: hapusKasAksi.bind(null, false, d.id) }}
          peringatan={d.kind === 'keluar' && ['Draft', 'Diajukan', 'Disetujui'].includes(d.status) ? await peringatanKasMinus(db, d.bankAccountId, d.amount) : null}
          catatan={setuju ? (d.status === 'Disetujui' ? 'Sudah disetujui. Tekan Posting sesudah uang benar-benar keluar.' : d.status === 'Draft' ? 'Kas keluar diajukan dulu lalu disetujui Owner sebelum diposting.' : undefined) : undefined}
          konfirmasiPosting={`Posting ${d.no}? ${formatRupiah(d.amount)} dicatat ${masuk ? 'masuk ke' : 'keluar dari'} ${namaSumber} dan jurnalnya dibuat.`}
        />
      </div>

      <section className="kartu" aria-labelledby="j-baris">
        <h2 id="j-baris">{masuk ? 'Akun sumber uang masuk' : 'Akun biaya atau tujuan uang keluar'}</h2>
        {d.cashTransactionLines.length ? (
          <div className="kartu tanpa-isi">
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Akun</th>
                  <th scope="col">Keterangan</th>
                  <th scope="col" className="angka">
                    Jumlah
                  </th>
                  {t.ubah ? <th scope="col">Tindakan</th> : null}
                </tr>
              </thead>
              <tbody>
                {d.cashTransactionLines.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Akun">
                      {b.account.code} {b.account.name}
                    </td>
                    <td data-label="Keterangan">{b.memo || '-'}</td>
                    <td data-label="Jumlah" className="angka">
                      {formatRupiah(b.amount)}
                    </td>
                    {t.ubah ? (
                      <td data-label="Tindakan">
                        <TombolAksi aksi={hapusBarisKasAksi.bind(null, d.id, b.id)} label="Hapus" kelas="btn bahaya kecil" />
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="kosong">Belum ada baris akun.</p>
        )}
        {t.ubah ? (
          <>
            <h3>Tambah baris</h3>
            <FormMaster
              aksi={tambahBarisKasAksi.bind(null, d.id)}
              medan={[
                { jenis: 'pilih', nama: 'accountId', label: 'Akun', pilihan: [{ nilai: '', label: 'Pilih akun' }, ...akun.map((a) => ({ nilai: String(a.id), label: `${a.code} ${a.name}` }))], wajib: true, bantuan: 'Hanya akun beban, pendapatan, dan akun lain yang boleh dipakai kas. Akun kas, bank, persediaan, dan hutang tidak ditawarkan.' },
                { jenis: 'angka', nama: 'amount', label: 'Jumlah (Rp)', inputMode: 'numeric', wajib: true, placeholder: '0' },
                { jenis: 'teks', nama: 'memo', label: 'Keterangan', maxLength: 120 },
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
