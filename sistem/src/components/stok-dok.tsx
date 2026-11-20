// Bagian bersama layar rincian dokumen persediaan (tahap 4A): jejak status dan panel tindakan.
import Link from 'next/link'
import type { DocStatus } from '@/generated/prisma/client'
import type { HasilAksi } from '@/lib/aksi'
import { db } from '@/lib/db'
import { punyaIzin, type Pengguna } from '@/lib/izin-inti'
import { DOK_STOK, tombolStatus, type JenisDokStok } from '@/lib/stok/dokumen'
import { formatWaktu } from '@/lib/waktu'
import { LencanaStatus } from './stok'
import { FormBatal, TombolAksi } from './stok-form'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

export type JejakDok = {
  id: number
  no: string
  status: DocStatus
  createdBy: number | null
  createdAt: Date
  submittedBy: number | null
  submittedAt: Date | null
  approvedBy: number | null
  approvedAt: Date | null
  postedBy: number | null
  postedAt: Date | null
  cancelledBy: number | null
  cancelledAt: Date | null
  cancelReason: string | null
}

// Nama pengguna untuk kolom *_by (KONTRAK 3.1: tanpa foreign key, pengguna tidak pernah dihapus).
export async function namaPengguna(ids: (number | null)[]) {
  const unik = [...new Set(ids.filter((x): x is number => x !== null))]
  const u = unik.length ? await db.appUser.findMany({ where: { id: { in: unik } }, select: { id: true, name: true } }) : []
  const peta = new Map(u.map((x) => [x.id, x.name]))
  return (id: number | null) => (id === null ? 'sistem' : (peta.get(id) ?? `#${id}`))
}

export async function JejakStatus({ d }: { d: JejakDok }) {
  const nama = await namaPengguna([d.createdBy, d.submittedBy, d.approvedBy, d.postedBy, d.cancelledBy])
  const baris: [string, number | null, Date | null][] = [
    ['Dibuat', d.createdBy, d.createdAt],
    ['Diajukan', d.submittedBy, d.submittedAt],
    ['Disetujui', d.approvedBy, d.approvedAt],
    ['Diposting', d.postedBy, d.postedAt],
    ['Dibatalkan', d.cancelledBy, d.cancelledAt],
  ]
  return (
    <ul className="daftar-waktu">
      {baris
        .filter(([, , at]) => at)
        .map(([label, oleh, at]) => (
          <li key={label}>
            <span className={`titik ${label === 'Dibatalkan' ? 'merah' : label === 'Diposting' ? 'hijau' : ''}`} aria-hidden="true" />
            <span>
              <b>{label}</b>
              <small className="redup">
                {formatWaktu(at)} oleh {nama(oleh)}
              </small>
              {label === 'Dibatalkan' && d.cancelReason ? <small>Alasan: {d.cancelReason}</small> : null}
            </span>
          </li>
        ))}
    </ul>
  )
}

type PropPanel = {
  p: Pengguna
  jenis: JenisDokStok
  d: JejakDok
  butuhSetuju: boolean
  aksi: { ajukan: Aksi; kembalikan: Aksi; posting: Aksi; batal: Aksi; hapus: Aksi }
  catatan?: string
}

export async function PanelTindakan({ p, jenis, d, butuhSetuju, aksi, catatan }: PropPanel) {
  const t = tombolStatus(p, jenis, d.status, butuhSetuju, d.submittedBy)
  const nama = DOK_STOK[jenis].nama.toLowerCase()
  const adaTombol = t.ajukan || t.kembalikan || t.posting || t.hapus
  return (
    <section className="kartu" aria-labelledby="j-tindakan">
      <div className="kartu-kepala">
        <h2 id="j-tindakan">Status dan tindakan</h2>
        <LencanaStatus status={d.status} />
      </div>
      {catatan ? <p className="catatan">{catatan}</p> : null}
      <JejakStatus d={d} />
      {adaTombol ? (
        <div className="deret-tombol">
          {t.posting ? (
            <TombolAksi
              aksi={aksi.posting}
              label={t.setujuiPosting ? 'Setujui dan posting' : 'Posting'}
              konfirmasi={`Posting ${d.no}? Stok langsung bergerak dan dokumen tidak bisa diubah lagi.`}
            />
          ) : null}
          {t.ajukan ? <TombolAksi aksi={aksi.ajukan} label={butuhSetuju ? 'Ajukan untuk disetujui' : 'Ajukan'} kelas={t.posting ? 'btn sekunder' : 'btn'} /> : null}
          {t.kembalikan ? <TombolAksi aksi={aksi.kembalikan} label="Kembalikan ke draf" kelas="btn sekunder" /> : null}
          {t.hapus ? <TombolAksi aksi={aksi.hapus} label="Hapus draf" kelas="btn bahaya" konfirmasi={`Hapus draf ${d.no}? Nomornya tidak dipakai ulang.`} /> : null}
        </div>
      ) : null}
      {t.batal ? <FormBatal aksi={aksi.batal} wajibAlasan={false} label={`Batalkan ${nama}`} konfirmasi={`Batalkan ${d.no}?`} /> : null}
      {t.batalPosting ? <FormBatal aksi={aksi.batal} wajibAlasan label="Batalkan dengan gerak balik" konfirmasi={`Batalkan ${d.no}? Stok dikembalikan lewat gerak balik bertanggal hari ini.`} /> : null}
      {punyaIzin(p.izin, 'atur.audit', 'L') ? (
        <p>
          <Link href={`/audit?entitas=${jenis}&dok=${d.id}`}>Lihat jejak audit dokumen ini</Link>
        </p>
      ) : null}
    </section>
  )
}
