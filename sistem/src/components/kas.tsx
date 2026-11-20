// Bagian bersama layar Kas dan Bank tahap 5C (server): pesan dan panel status kas masuk, kas keluar, dan pindah dana.
// Gaya bersama ada di beli.css dan stok.css; gaya khusus kas dan rekonsiliasi di kas.css.
import '@/app/(admin)/master.css'
import '@/app/(admin)/stok.css'
import '@/app/(admin)/beli.css'
import '@/app/(admin)/kas.css'
import Link from 'next/link'
import type { DocStatus } from '@/generated/prisma/client'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { punyaIzin, type Pengguna } from '@/lib/izin-inti'
import { tombolKas } from '@/lib/kas'
import { FormAlasan } from './beli-form'
import { JejakStatus, type JejakDok } from './stok-dok'
import { LencanaStatus } from './stok'
import { TombolAksi } from './stok-form'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

const PESAN: Record<string, string> = {
  draf: 'Draf dibuat. Lengkapi isinya di bawah.',
  tersimpan: 'Perubahan tersimpan.',
  tetap: 'Tidak ada yang berubah.',
  baris: 'Baris tersimpan.',
  baris_hapus: 'Baris dihapus.',
  ajukan: 'Dokumen diajukan dan menunggu persetujuan.',
  kembalikan: 'Dokumen dikembalikan ke draf.',
  setujui: 'Dokumen disetujui. Tekan Posting sesudah uang benar-benar bergerak.',
  posting: 'Dokumen sudah Diposting dan jurnalnya dibuat.',
  batal: 'Dokumen dibatalkan.',
  batal_posting: 'Dokumen dibatalkan. Jurnal baliknya sudah dibuat.',
  dihapus: 'Draf dihapus.',
}

export function PesanKas({ kode }: { kode?: string }) {
  const teks = kode ? PESAN[kode] : undefined
  return teks ? (
    <p className="pesan sukses" role="status">
      {teks}
    </p>
  ) : null
}

export const NAMA_JENIS_KAS: Record<string, string> = { masuk: 'Kas masuk', keluar: 'Kas keluar', pindah: 'Pindah dana' }

type PropPanel = {
  p: Pengguna
  menu: string
  d: JejakDok
  butuhSetuju: boolean
  aksi: { ajukan: Aksi; kembalikan: Aksi; setujui: Aksi; posting: Aksi; batal: Aksi; hapus: Aksi }
  catatan?: string
  konfirmasiPosting: string
}

// Panel status dan tindakan dokumen kas. Tombol mengikuti tombolKas; server tetap memeriksa ulang.
export async function PanelKas({ p, menu, d, butuhSetuju, aksi, catatan, konfirmasiPosting }: PropPanel) {
  const t = tombolKas(p, menu, d.status as DocStatus, butuhSetuju, d.submittedBy)
  const adaTombol = t.ajukan || t.kembalikan || t.setujui || t.posting || t.hapus
  const jurnal =
    (d.status === 'Diposting' || d.status === 'Batal') && punyaIzin(p.izin, 'akun.jurnal', 'L')
      ? await db.journal.findMany({ where: { sourceType: 'cash_transaction', sourceId: d.id }, select: { id: true, no: true, reversalOfId: true }, orderBy: { id: 'asc' } })
      : []
  return (
    <section className="kartu" aria-labelledby="j-tindakan">
      <div className="kartu-kepala">
        <h2 id="j-tindakan">Status dan tindakan</h2>
        <LencanaStatus status={d.status} />
      </div>
      {catatan ? <p className="catatan">{catatan}</p> : null}
      <JejakStatus d={d} />
      {jurnal.length ? (
        <p className="kecil">
          Jurnal:{' '}
          {jurnal.map((x, i) => (
            <span key={x.id}>
              {i ? ', ' : ''}
              <Link href={`/jurnal/${x.id}`}>{x.no}</Link>
              {x.reversalOfId ? ' (balik)' : ''}
            </span>
          ))}
        </p>
      ) : null}
      {adaTombol ? (
        <div className="deret-tombol">
          {t.setujui ? <TombolAksi aksi={aksi.setujui} label="Setujui" konfirmasi={`Setujui ${d.no}? Sesudah uang benar-benar bergerak, tekan Posting.`} /> : null}
          {t.posting ? <TombolAksi aksi={aksi.posting} label="Posting" konfirmasi={konfirmasiPosting} /> : null}
          {t.ajukan ? <TombolAksi aksi={aksi.ajukan} label={butuhSetuju ? 'Ajukan untuk disetujui' : 'Ajukan'} kelas={t.posting || t.setujui ? 'btn sekunder' : 'btn'} /> : null}
          {t.kembalikan ? <TombolAksi aksi={aksi.kembalikan} label="Kembalikan ke draf" kelas="btn sekunder" /> : null}
          {t.hapus ? <TombolAksi aksi={aksi.hapus} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${d.no}? Nomornya tidak dipakai ulang.`} /> : null}
        </div>
      ) : null}
      {t.batal ? (
        <details className="lipat-batal">
          <summary>Batalkan dokumen</summary>
          <FormAlasan aksi={aksi.batal} idAwal="batal" wajib={false} label="Batalkan dokumen" konfirmasi={`Batalkan ${d.no}?`} />
        </details>
      ) : null}
      {t.batalPosting ? (
        <details className="lipat-batal">
          <summary>Batalkan dokumen yang sudah Diposting</summary>
          <p className="redup kecil">Jurnal balik dibuat bertanggal hari ini. Ditolak bila baris banknya sudah dicocokkan di Rekonsiliasi Bank. Alasan wajib diisi.</p>
          <FormAlasan aksi={aksi.batal} idAwal="batal-posting" wajib label="Batalkan dengan jurnal balik" konfirmasi={`Batalkan ${d.no} yang sudah Diposting?`} />
        </details>
      ) : null}
      {punyaIzin(p.izin, 'atur.audit', 'L') ? (
        <p>
          <Link href={`/audit?entitas=cash_transaction&dok=${d.id}`}>Lihat jejak audit dokumen ini</Link>
        </p>
      ) : null}
    </section>
  )
}
