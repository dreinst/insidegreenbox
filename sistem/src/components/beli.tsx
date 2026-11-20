// Bagian bersama layar modul pembelian tahap 4C (server): pesan, lencana progres dan status bayar, saringan daftar,
// ringkasan angka, dan panel status dengan tombol sesuai izin. Gayanya di beli.css.
import '@/app/(admin)/master.css'
import '@/app/(admin)/stok.css'
import '@/app/(admin)/beli.css'
import Link from 'next/link'
import type { DocStatus, PayStatus, Progress } from '@/generated/prisma/client'
import type { HasilAksi } from '@/lib/aksi'
import { DOK_BELI, NAMA_BAYAR, tombolBeli, type JenisDok, type SaringBeli } from '@/lib/beli/dokumen'
import { punyaIzin, type Pengguna } from '@/lib/izin-inti'
import { formatWaktu } from '@/lib/waktu'
import { FormAlasan } from './beli-form'
import { JejakStatus, type JejakDok } from './stok-dok'
import { LencanaStatus } from './stok'
import { TombolAksi } from './stok-form'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

const PESAN: Record<string, string> = {
  dibuat: 'Data baru tersimpan.',
  tersimpan: 'Perubahan tersimpan.',
  tetap: 'Tidak ada yang berubah.',
  aktif: 'Sudah diaktifkan.',
  nonaktif: 'Sudah dinonaktifkan.',
  draf: 'Draf dibuat. Lengkapi barisnya di bawah.',
  baris: 'Baris tersimpan.',
  baris_hapus: 'Baris dihapus.',
  tarik: 'Baris penerimaan ditarik ke faktur.',
  alokasi: 'Alokasi pembayaran tersimpan.',
  ajukan: 'Dokumen diajukan dan menunggu persetujuan.',
  kembalikan: 'Dokumen dikembalikan ke draf.',
  setujui: 'Dokumen disetujui.',
  posting: 'Dokumen sudah Diposting.',
  tutup: 'Sisa dokumen ditutup. Status menjadi Selesai.',
  batal: 'Dokumen dibatalkan.',
  batal_posting: 'Dokumen dibatalkan. Gerak balik dan penghitung turunannya sudah dikembalikan.',
  dihapus: 'Draf dihapus.',
}

export function PesanBeli({ kode }: { kode?: string }) {
  const teks = kode ? PESAN[kode] : undefined
  return teks ? (
    <p className="pesan sukses" role="status">
      {teks}
    </p>
  ) : null
}

const WARNA_PROGRES: Record<Progress, string> = { Belum: 'abu', Sebagian: 'kuning', Penuh: 'hijau' }
export const LencanaProgres = ({ p, awalan = '' }: { p: Progress; awalan?: string }) => (
  <span className={`lencana ${WARNA_PROGRES[p]}`}>
    {awalan}
    {p}
  </span>
)

const WARNA_BAYAR: Record<PayStatus, string> = { BelumBayar: 'merah', Sebagian: 'kuning', Lunas: 'hijau' }
export const LencanaBayar = ({ s }: { s: PayStatus }) => <span className={`lencana ${WARNA_BAYAR[s]}`}>{NAMA_BAYAR[s]}</span>

export function Ringkas({ isi, label }: { isi: [string, string, boolean?][]; label: string }) {
  return (
    <dl className="bl-ringkas" aria-label={label}>
      {isi.map(([dt, dd, minus]) => (
        <div key={dt}>
          <dt>{dt}</dt>
          <dd className={minus ? 'minus' : undefined}>{dd}</dd>
        </div>
      ))}
    </dl>
  )
}

export function SaringDaftarBeli({
  s,
  jalur,
  pemasok,
  label,
  status,
  contoh,
  tambahan,
}: {
  s: SaringBeli & Record<string, string | undefined>
  jalur: string
  pemasok?: { id: number; name: string }[]
  label: string
  status: DocStatus[]
  contoh: string
  tambahan?: { nama: string; label: string; pilihan: [string, string][] }
}) {
  const disaring = !!(s.q || s.status || s.pemasok || s.dari || s.sampai || (tambahan && s[tambahan.nama]))
  return (
    <form className="saring" method="get" role="search" aria-label={label}>
      <div className="kolom">
        <label htmlFor="s-q">Nomor</label>
        <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder={contoh} maxLength={30} />
      </div>
      <div className="kolom">
        <label htmlFor="s-status">Status</label>
        <select id="s-status" name="status" defaultValue={s.status ?? ''}>
          <option value="">Semua status</option>
          {status.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      {pemasok ? (
        <div className="kolom">
          <label htmlFor="s-pemasok">Pemasok</label>
          <select id="s-pemasok" name="pemasok" defaultValue={s.pemasok ?? ''}>
            <option value="">Semua pemasok</option>
            {pemasok.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {tambahan ? (
        <div className="kolom">
          <label htmlFor={`s-${tambahan.nama}`}>{tambahan.label}</label>
          <select id={`s-${tambahan.nama}`} name={tambahan.nama} defaultValue={s[tambahan.nama] ?? ''}>
            <option value="">Semua</option>
            {tambahan.pilihan.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      <div className="kolom">
        <label htmlFor="s-dari">Dari tanggal</label>
        <input id="s-dari" name="dari" type="date" defaultValue={s.dari ?? ''} />
      </div>
      <div className="kolom">
        <label htmlFor="s-sampai">Sampai tanggal</label>
        <input id="s-sampai" name="sampai" type="date" defaultValue={s.sampai ?? ''} />
      </div>
      <div className="saring-tombol">
        <button type="submit" className="btn sekunder">
          Saring
        </button>
        {disaring ? <Link href={jalur}>Hapus saringan</Link> : null}
      </div>
    </form>
  )
}

type PropPanel = {
  p: Pengguna
  jenis: JenisDok
  d: JejakDok
  butuhSetuju: boolean
  aksi: { ajukan: Aksi; kembalikan: Aksi; setujui: Aksi; posting: Aksi; batal: Aksi; tutup: Aksi; hapus: Aksi }
  catatan?: string
  bolehTutup?: boolean
  konfirmasiPosting?: string
  // Dokumen rencana yang Selesai: waktu dan alasan tutup sisa (kosong bila selesai otomatis).
  selesai?: { at: Date | null; alasan: string | null }
}

// Panel status dan tindakan dokumen pembelian. Tombol mengikuti tombolBeli; server tetap memeriksa ulang.
export async function PanelBeli({ p, jenis, d, butuhSetuju, aksi, catatan, bolehTutup, konfirmasiPosting, selesai }: PropPanel) {
  const t = tombolBeli(p, jenis, d.status, butuhSetuju, d.submittedBy, { bolehTutup })
  const info = DOK_BELI[jenis]
  const nama = info.nama.toLowerCase()
  const rencana = info.golongan === 'rencana'
  const adaTombol = t.ajukan || t.kembalikan || t.setujui || t.posting || t.hapus
  return (
    <section className="kartu" aria-labelledby="j-tindakan">
      <div className="kartu-kepala">
        <h2 id="j-tindakan">Status dan tindakan</h2>
        <LencanaStatus status={d.status} />
      </div>
      {catatan ? <p className="catatan">{catatan}</p> : null}
      <JejakStatus d={d} />
      {d.status === 'Selesai' && selesai ? (
        <p className="redup kecil">
          Selesai {selesai.at ? formatWaktu(selesai.at) : ''}: {selesai.alasan ? `sisa ditutup. Alasan: ${selesai.alasan}` : 'semua baris terpenuhi.'}
        </p>
      ) : null}
      {adaTombol ? (
        <div className="deret-tombol">
          {t.setujui ? (
            <TombolAksi
              aksi={aksi.setujui}
              label={rencana && !butuhSetuju && d.status === 'Draft' ? 'Setujui sekarang' : 'Setujui'}
              konfirmasi={rencana ? `Setujui ${d.no}? Dokumen tidak bisa diubah lagi.` : `Setujui ${d.no}? Sesudah transfer dilakukan, tekan Posting.`}
            />
          ) : null}
          {t.posting ? (
            <TombolAksi
              aksi={aksi.posting}
              label={t.setujuiPosting ? 'Setujui dan posting' : 'Posting'}
              konfirmasi={konfirmasiPosting ?? `Posting ${d.no}? Dokumen tidak bisa diubah lagi.`}
            />
          ) : null}
          {t.ajukan ? <TombolAksi aksi={aksi.ajukan} label={butuhSetuju ? 'Ajukan untuk disetujui' : 'Ajukan'} kelas={t.posting || t.setujui ? 'btn sekunder' : 'btn'} /> : null}
          {t.kembalikan ? <TombolAksi aksi={aksi.kembalikan} label="Kembalikan ke draf" kelas="btn sekunder" /> : null}
          {t.hapus ? <TombolAksi aksi={aksi.hapus} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${d.no}? Nomornya tidak dipakai ulang.`} /> : null}
        </div>
      ) : null}
      {t.tutup ? (
        <details className="lipat-batal bl-tutup">
          <summary>Tutup sisa</summary>
          <p className="redup kecil">Sisa yang belum terpenuhi tidak ditunggu lagi dan status menjadi Selesai. Alasan wajib diisi.</p>
          <FormAlasan aksi={aksi.tutup} idAwal="tutup" wajib label="Tutup sisa" kelas="btn sekunder" konfirmasi={`Tutup sisa ${d.no}?`} />
        </details>
      ) : null}
      {t.batal ? (
        <details className="lipat-batal">
          <summary>Batalkan dokumen</summary>
          <FormAlasan aksi={aksi.batal} idAwal="batal" wajib={false} label={`Batalkan ${nama}`} konfirmasi={`Batalkan ${d.no}?`} />
        </details>
      ) : null}
      {t.batalPosting ? (
        <details className="lipat-batal">
          <summary>Batalkan dokumen yang sudah Diposting</summary>
          <p className="redup kecil">Stok dan penghitung dokumen terkait dikembalikan bertanggal hari ini. Ditolak bila masih ada dokumen turunan yang Diposting. Alasan wajib diisi.</p>
          <FormAlasan aksi={aksi.batal} idAwal="batal-posting" wajib label="Batalkan dengan gerak balik" konfirmasi={`Batalkan ${d.no} yang sudah Diposting?`} />
        </details>
      ) : null}
      {punyaIzin(p.izin, 'atur.audit', 'L') ? (
        <p>
          <Link href={`/audit?entitas=${jenis}&dok=${d.id}`}>Lihat jejak audit dokumen ini</Link>
        </p>
      ) : null}
    </section>
  )
}

// Tautan ke dokumen lain bila pengguna boleh melihat menunya; tanpa izin hanya nomornya.
export function TautanDok({ p, menu, href, teks }: { p: Pengguna; menu: string; href: string; teks: string }) {
  return punyaIzin(p.izin, menu, 'L') ? <Link href={href}>{teks}</Link> : <span>{teks}</span>
}
