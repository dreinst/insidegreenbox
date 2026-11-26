// Bagian bersama layar aset tetap dan anggaran tahap 6B: pesan sesudah aksi dan lencana status aset. Ringkasan angka
// dan lencana status dokumen memakai komponen pembelian dan stok. Gayanya di aset.css.
import '@/app/(admin)/master.css'
import '@/app/(admin)/beli.css'
import '@/app/(admin)/aset.css'
import Link from 'next/link'
import { STATUS_ASET, type StatusAset } from '@/lib/aset/aset'
import { db } from '@/lib/db'
import { punyaIzin, type Pengguna } from '@/lib/izin-inti'
import { formatTanggal } from './stok'

const PESAN: Record<string, string> = {
  dibuat: 'Data baru tersimpan.',
  tersimpan: 'Perubahan tersimpan.',
  tetap: 'Tidak ada yang berubah.',
  aktif: 'Sudah diaktifkan.',
  nonaktif: 'Sudah dinonaktifkan.',
  draf: 'Draf dibuat.',
  dihapus: 'Draf dihapus.',
  diaktifkan: 'Aset disetujui dan aktif. Jurnal perolehan sudah dibentuk.',
  dibatalkan: 'Dokumen dibatalkan. Jurnal baliknya sudah dibentuk.',
  dihitung: 'Penyusutan sudah dihitung dan dijurnal.',
  posting: 'Dokumen sudah Diposting dan dijurnal.',
  akun: 'Akun ditambahkan ke anggaran.',
  akun_hapus: 'Akun dihapus dari anggaran.',
  rincian: 'Angka anggaran tersimpan.',
  disetujui: 'Anggaran disetujui dan berlaku untuk tahunnya.',
  revisi: 'Revisi dibuat sebagai draf versi baru. Ubah angkanya, lalu setujui.',
  batal: 'Dokumen dibatalkan.',
}

export function PesanAset({ kode }: { kode?: string }) {
  const teks = kode ? PESAN[kode] : undefined
  return teks ? (
    <p className="pesan sukses" role="status">
      {teks}
    </p>
  ) : null
}

const WARNA: Record<StatusAset, string> = { draft: 'abu', aktif: 'hijau', dilepas: 'kuning', batal: 'merah' }

export const LencanaAset = ({ status }: { status: string }) => <span className={`lencana ${WARNA[status as StatusAset] ?? 'abu'}`}>{STATUS_ASET[status as StatusAset] ?? status}</span>

// Persen realisasi dengan batang kecil (elemen progress, tanpa gaya inline karena CSP); merah bila melewati 100 persen.
export function PersenBatang({ persen }: { persen: number | null }) {
  if (persen === null) return <>-</>
  return (
    <>
      {persen.toLocaleString('id-ID')}%
      <progress className={`rl-batang${persen > 100 ? ' lewat' : ''}`} value={Math.max(0, Math.min(100, persen))} max={100} aria-hidden="true" />
    </>
  )
}

// Jurnal yang dibentuk dokumen ini (maju dan balik), dengan tautan ke Jurnal Umum bila boleh dilihat.
export async function JurnalDokumen({ p, docType, docId }: { p: Pengguna; docType: string; docId: number }) {
  const j = await db.journal.findMany({ where: { sourceType: docType, sourceId: docId, postedAt: { not: null } }, orderBy: { id: 'asc' }, select: { id: true, no: true, date: true, reversalOfId: true } })
  if (!j.length) return <p className="redup kecil">Belum ada jurnal.</p>
  const lihat = punyaIzin(p.izin, 'akun.jurnal', 'L')
  return (
    <ul className="bl-turunan" aria-label="Jurnal dokumen">
      {j.map((x) => (
        <li key={x.id}>
          {lihat ? <Link href={`/jurnal/${x.id}`}>{x.no}</Link> : <span>{x.no}</span>}
          <small className="redup">
            {x.reversalOfId ? 'jurnal balik' : 'jurnal'} {formatTanggal(x.date)}
          </small>
        </li>
      ))}
    </ul>
  )
}
