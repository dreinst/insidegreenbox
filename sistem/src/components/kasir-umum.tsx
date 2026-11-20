// Komponen tampilan kecil modul kasir (tahap 3B).
import { rupiah } from '@/lib/hitung-kasir'
import { STATUS_SHIFT } from '@/lib/shift'

export function LencanaShift({ status }: { status: keyof typeof STATUS_SHIFT }) {
  const warna = status === 'Buka' ? 'hijau' : status === 'PerluPersetujuan' ? 'kuning' : 'abu'
  return <span className={`lencana ${warna}`}>{STATUS_SHIFT[status]}</span>
}

export function LencanaJual({ status }: { status: 'Selesai' | 'Void' }) {
  return <span className={`lencana ${status === 'Void' ? 'merah' : 'hijau'}`}>{status}</span>
}

export const selisihTeks = (n: bigint | number | null) => {
  if (n === null) return '-'
  const x = Number(n)
  return x === 0 ? 'Pas' : `${x > 0 ? 'Lebih' : 'Kurang'} ${rupiah(Math.abs(x))}`
}
