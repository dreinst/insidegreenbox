// Pembantu halaman rincian dokumen pembelian: aksi panel status yang sudah diikat ke dokumen, dan bentuk jejak status.
import type { DocStatus } from '@/generated/prisma/client'
import type { JenisBeli } from '@/lib/beli/dokumen'
import { hapusBeliAksi, statusBeliAksi } from './aksi'

export const aksiPanel = (jenis: JenisBeli, id: number) => ({
  ajukan: statusBeliAksi.bind(null, jenis, id, 'ajukan'),
  kembalikan: statusBeliAksi.bind(null, jenis, id, 'kembalikan'),
  setujui: statusBeliAksi.bind(null, jenis, id, 'setujui'),
  posting: statusBeliAksi.bind(null, jenis, id, 'posting'),
  batal: statusBeliAksi.bind(null, jenis, id, 'batal'),
  tutup: statusBeliAksi.bind(null, jenis, id, 'tutup'),
  hapus: hapusBeliAksi.bind(null, jenis, id),
})

type Jejak = {
  id: number
  no: string
  status: DocStatus
  createdBy: number | null
  createdAt: Date
  submittedBy: number | null
  submittedAt: Date | null
  approvedBy: number | null
  approvedAt: Date | null
  postedBy?: number | null
  postedAt?: Date | null
  cancelledBy: number | null
  cancelledAt: Date | null
  cancelReason: string | null
}

// Dokumen rencana tidak punya kolom posted_*.
export const jejak = (d: Jejak) => ({ ...d, postedBy: d.postedBy ?? null, postedAt: d.postedAt ?? null })

export const isoHari = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '')
