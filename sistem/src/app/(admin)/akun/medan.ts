import type { Medan } from '@/components/form-master'
import type { AccountKind } from '@/generated/prisma/client'
import { JENIS_AKUN, URUT_JENIS } from '@/lib/akuntansi/akun'

type Awal = { code?: string; name?: string; kind?: AccountKind; parentId?: number | null; isPostable?: boolean; isCashBank?: boolean; note?: string }

export function medanAkun(awal: Awal, induk: { id: number; code: string; name: string; kind: AccountKind }[]): Medan[] {
  return [
    { jenis: 'teks', nama: 'code', label: 'Kode akun', awal: awal.code, wajib: true, maxLength: 20, placeholder: '6-1950', bantuan: 'Angka, huruf, titik, atau tanda hubung. Urutan bagan mengikuti kode.' },
    { jenis: 'teks', nama: 'name', label: 'Nama akun', awal: awal.name, wajib: true, maxLength: 80 },
    { jenis: 'pilih', nama: 'kind', label: 'Jenis', awal: awal.kind ?? 'Beban', pilihan: URUT_JENIS.map((k) => ({ nilai: k, label: JENIS_AKUN[k] })), wajib: true },
    {
      jenis: 'pilih',
      nama: 'parentId',
      label: 'Akun induk',
      awal: awal.parentId ? String(awal.parentId) : '',
      pilihan: [{ nilai: '', label: 'Tanpa induk (akar)' }, ...induk.map((a) => ({ nilai: String(a.id), label: `${a.code} ${a.name} (${JENIS_AKUN[a.kind]})` }))],
      bantuan: 'Jenis akun harus sama dengan induknya.',
    },
    { jenis: 'centang', nama: 'isPostable', label: 'Akun transaksi (bisa dijurnal)', awal: awal.isPostable ?? true, bantuan: 'Matikan untuk akun induk yang hanya mengelompokkan.' },
    { jenis: 'centang', nama: 'isCashBank', label: 'Akun kas atau bank', awal: awal.isCashBank ?? false, bantuan: 'Hanya untuk akun aset.' },
    { jenis: 'area', nama: 'note', label: 'Keterangan', awal: awal.note, maxLength: 200, lebar: true },
  ]
}
