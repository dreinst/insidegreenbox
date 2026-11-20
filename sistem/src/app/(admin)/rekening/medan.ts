import type { Medan } from '@/components/form-master'

export function medanRekening(awal: { bankName?: string; accountNo?: string; holderName?: string } = {}): Medan[] {
  return [
    { jenis: 'teks', nama: 'bankName', label: 'Nama bank', awal: awal.bankName, wajib: true, maxLength: 40, placeholder: 'BCA' },
    { jenis: 'teks', nama: 'accountNo', label: 'Nomor rekening', awal: awal.accountNo, wajib: true, maxLength: 30, inputMode: 'numeric', bantuan: 'Angka saja; spasi, titik, dan tanda hubung diabaikan.' },
    { jenis: 'teks', nama: 'holderName', label: 'Atas nama', awal: awal.holderName, wajib: true, maxLength: 80, lebar: true },
  ]
}
