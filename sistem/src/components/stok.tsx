// Komponen tampilan modul persediaan tahap 4A (server). Gayanya di stok.css.
import '@/app/(admin)/master.css'
import '@/app/(admin)/stok.css'
import type { DocStatus } from '@/generated/prisma/client'

const PESAN: Record<string, string> = {
  dibuat: 'Data baru tersimpan.',
  tersimpan: 'Perubahan tersimpan.',
  tetap: 'Tidak ada yang berubah.',
  aktif: 'Sudah diaktifkan.',
  nonaktif: 'Sudah dinonaktifkan.',
  draf: 'Draf dibuat. Tambahkan barisnya di bawah.',
  baris: 'Baris ditambahkan.',
  baris_hapus: 'Baris dihapus.',
  hitungan: 'Hitungan fisik tersimpan.',
  ajukan: 'Dokumen diajukan dan menunggu persetujuan.',
  kembalikan: 'Dokumen dikembalikan ke draf.',
  posting: 'Dokumen sudah Diposting. Stok sudah bergerak.',
  batal: 'Dokumen dibatalkan.',
  batal_posting: 'Dokumen dibatalkan. Gerak balik sudah dicatat dan stok kembali.',
  dihapus: 'Draf dihapus.',
  konversi: 'Konversi satuan tersimpan.',
  konversi_hapus: 'Konversi satuan dihapus.',
}

export function PesanStok({ kode }: { kode?: string }) {
  const teks = kode ? PESAN[kode] : undefined
  return teks ? (
    <p className="pesan sukses" role="status">
      {teks}
    </p>
  ) : null
}

const WARNA: Record<DocStatus, string> = { Draft: 'abu', Diajukan: 'kuning', Disetujui: 'kuning', Diposting: 'hijau', Selesai: 'hijau', Batal: 'merah' }

export const LencanaStatus = ({ status }: { status: DocStatus }) => <span className={`lencana ${WARNA[status]}`}>{status}</span>

// Tanggal kolom date (UTC tengah malam) ditampilkan tanpa geser zona.
export const formatTanggal = (d: Date | null | undefined) => (d ? new Intl.DateTimeFormat('id-ID', { timeZone: 'UTC', dateStyle: 'medium' }).format(d) : '-')
export const isoTanggal = (d: Date) => d.toISOString().slice(0, 10)
