// Komponen tampilan modul resep dan produksi tahap 4B (server). Gayanya di produksi.css.
import '@/app/(admin)/master.css'
import '@/app/(admin)/stok.css'
import '@/app/(admin)/produksi.css'
import Link from 'next/link'
import type { DocStatus } from '@/generated/prisma/client'
import { des } from '@/lib/stok/angka'
import { formatWaktu } from '@/lib/waktu'
import { namaPengguna } from './stok-dok'

const PESAN: Record<string, string> = {
  dibuat: 'Data baru tersimpan. Tambahkan bahannya di bawah.',
  tersimpan: 'Perubahan tersimpan.',
  tetap: 'Tidak ada yang berubah.',
  aktif: 'Resep diaktifkan.',
  nonaktif: 'Resep dinonaktifkan. Menu atau produk hasilnya dianggap tanpa resep.',
  bahan: 'Bahan tersimpan.',
  bahan_hapus: 'Bahan dihapus dari resep.',
  draf: 'Draf dibuat. Periksa isinya sebelum diproses.',
  qty: 'Qty tersimpan.',
  ajukan: 'Dokumen diajukan dan menunggu persetujuan.',
  kembalikan: 'Dokumen dikembalikan ke draf.',
  setujui: 'Perintah produksi disetujui. Bahan sudah bisa dikeluarkan.',
  tutup: 'Perintah produksi ditutup dan berstatus Selesai.',
  posting: 'Dokumen sudah Diposting. Stok sudah bergerak.',
  batal: 'Dokumen dibatalkan.',
  batal_posting: 'Dokumen dibatalkan. Gerak balik sudah dicatat dan stok kembali.',
  dihapus: 'Draf dihapus.',
}

export function PesanProduksi({ kode }: { kode?: string }) {
  const teks = kode ? PESAN[kode] : undefined
  return teks ? (
    <p className="pesan sukses" role="status">
      {teks}
    </p>
  ) : null
}

// Batang progres qty dihasilkan lawan qty rencana.
export function Progres({ nilai, dari }: { nilai: string | number | { toString(): string }; dari: string | number | { toString(): string } }) {
  const a = Number(des(nilai.toString()))
  const b = Number(des(dari.toString()))
  const persen = b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0
  // Elemen progress bawaan, karena CSP produksi menolak atribut style sebaris.
  return <progress className="progres" value={Math.min(a, b)} max={b > 0 ? b : 1} aria-label={`${persen} persen dari rencana`} />
}

type JejakPerintah = {
  createdBy: number | null
  createdAt: Date
  submittedBy: number | null
  submittedAt: Date | null
  approvedBy: number | null
  approvedAt: Date | null
  closedBy: number | null
  closedAt: Date | null
  closeReason: string | null
  cancelledBy: number | null
  cancelledAt: Date | null
  cancelReason: string | null
  status: DocStatus
}

// Jejak status perintah produksi (dokumen rencana: tanpa Diposting, dengan Selesai).
export async function JejakPerintah({ d }: { d: JejakPerintah }) {
  const nama = await namaPengguna([d.createdBy, d.submittedBy, d.approvedBy, d.closedBy, d.cancelledBy])
  const baris: [string, number | null, Date | null, string | null][] = [
    ['Dibuat', d.createdBy, d.createdAt, null],
    ['Diajukan', d.submittedBy, d.submittedAt, null],
    ['Disetujui', d.approvedBy, d.approvedAt, null],
    [d.closeReason ? 'Ditutup manual' : 'Selesai', d.closedBy, d.status === 'Selesai' ? d.closedAt : null, d.closeReason],
    ['Dibatalkan', d.cancelledBy, d.cancelledAt, d.cancelReason],
  ]
  return (
    <ul className="daftar-waktu">
      {baris
        .filter(([, , at]) => at)
        .map(([label, oleh, at, alasan]) => (
          <li key={label}>
            <span className={`titik ${label === 'Dibatalkan' ? 'merah' : label === 'Disetujui' || label === 'Selesai' || label === 'Ditutup manual' ? 'hijau' : ''}`} aria-hidden="true" />
            <span>
              <b>{label}</b>
              <small className="redup">
                {formatWaktu(at)} oleh {nama(oleh)}
              </small>
              {alasan ? <small>Alasan: {alasan}</small> : null}
            </span>
          </li>
        ))}
    </ul>
  )
}

const STATUS_SARING: Record<'rencana' | 'pelaksana', string[]> = {
  rencana: ['Draft', 'Diajukan', 'Disetujui', 'Selesai', 'Batal'],
  pelaksana: ['Draft', 'Diajukan', 'Diposting', 'Batal'],
}

type Saring = { q?: string; status?: string; lokasi?: string; dari?: string; sampai?: string }

// Saringan daftar dokumen produksi. Mirip SaringDokumen persediaan, dengan status sesuai golongan dokumen.
export function SaringProduksi({ s, jalur, lokasi, label, golongan, contoh }: { s: Saring; jalur: string; lokasi: { id: number; name: string }[]; label: string; golongan: 'rencana' | 'pelaksana'; contoh: string }) {
  const disaring = !!(s.q || s.status || s.lokasi || s.dari || s.sampai)
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
          {STATUS_SARING[golongan].map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
      </div>
      <div className="kolom">
        <label htmlFor="s-lokasi">Lokasi</label>
        <select id="s-lokasi" name="lokasi" defaultValue={s.lokasi ?? ''}>
          <option value="">Semua lokasi</option>
          {lokasi.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      </div>
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
