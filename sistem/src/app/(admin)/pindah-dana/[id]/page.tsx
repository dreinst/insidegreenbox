import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { Ringkas } from '@/components/beli'
import { FormMaster } from '@/components/form-master'
import { PanelKas, PesanKas } from '@/components/kas'
import { formatTanggal } from '@/components/stok'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { butuhSetujuKas, muatKas, namaDana, pilihanDana, tombolKas } from '@/lib/kas'
import { formatRupiah } from '@/lib/master'
import { hapusKasAksi, statusKasAksi, ubahPindahAksi } from '../../kas/aksi'

export const metadata: Metadata = { title: 'Pindah Dana' }

export default async function RincianPindah({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('kas.pindah', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [d, { pesan }] = await Promise.all([muatKas(db, id), searchParams])
  if (!d) notFound()
  if (d.kind !== 'pindah') redirect(`/kas/${id}`)
  const setuju = await butuhSetujuKas(db, d.kind, d.amount)
  const t = tombolKas(p, 'kas.pindah', d.status, setuju, d.submittedBy)
  const [dana, dari, ke] = await Promise.all([t.ubah ? pilihanDana(db) : [], namaDana(db, d.bankAccountId), namaDana(db, d.toBankAccountId)])
  const aksi = (a: 'ajukan' | 'kembalikan' | 'setujui' | 'posting' | 'batal') => statusKasAksi.bind(null, true, d.id, a)
  return (
    <>
      <KepalaHalaman judul={d.no} keterangan={`Pindah dana · ${formatTanggal(d.date)}`} jejak={{ href: '/pindah-dana', label: 'Pindah Dana' }} />
      <PesanKas kode={pesan} />
      <Ringkas
        label="Ringkasan pindah dana"
        isi={[
          ['Dari', dari],
          ['Ke', ke],
          ['Jumlah', formatRupiah(d.amount)],
        ]}
      />
      <div className="kisi">
        <section className="kartu" aria-labelledby="j-data">
          <h2 id="j-data">Data dokumen</h2>
          {t.ubah ? (
            <FormMaster
              aksi={ubahPindahAksi.bind(null, d.id)}
              medan={[
                { jenis: 'tanggal', nama: 'date', label: 'Tanggal', awal: d.date.toISOString().slice(0, 10), wajib: true },
                { jenis: 'pilih', nama: 'sumber', label: 'Dari', awal: d.bankAccountId ? String(d.bankAccountId) : 'kas', pilihan: dana, wajib: true },
                { jenis: 'pilih', nama: 'tujuan', label: 'Ke', awal: d.toBankAccountId ? String(d.toBankAccountId) : 'kas', pilihan: dana, wajib: true },
                { jenis: 'angka', nama: 'amount', label: 'Jumlah (Rp)', awal: d.amount.toString(), inputMode: 'numeric', wajib: true },
                { jenis: 'area', nama: 'note', label: 'Catatan', awal: d.note, maxLength: 300, lebar: true },
              ]}
              tombol="Simpan"
              kelasTombol="btn sekunder"
            />
          ) : (
            <dl className="rincian">
              <dt>Catatan</dt>
              <dd>{d.note || '-'}</dd>
            </dl>
          )}
        </section>
        <PanelKas
          p={p}
          menu="kas.pindah"
          d={d}
          butuhSetuju={setuju}
          aksi={{ ajukan: aksi('ajukan'), kembalikan: aksi('kembalikan'), setujui: aksi('setujui'), posting: aksi('posting'), batal: aksi('batal'), hapus: hapusKasAksi.bind(null, true, d.id) }}
          catatan={setuju && d.status === 'Disetujui' ? 'Sudah disetujui. Tekan Posting sesudah uang benar-benar dipindah.' : undefined}
          konfirmasiPosting={`Posting ${d.no}? ${formatRupiah(d.amount)} dicatat pindah dari ${dari} ke ${ke}.`}
        />
      </div>
    </>
  )
}
