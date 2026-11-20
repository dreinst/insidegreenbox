'use client'
import { useActionState } from 'react'
import { IsiMedan } from '@/components/form-master'
import { PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

// Penerapan harga massal. Aturannya dibawa sebagai isian tersembunyi dari pratinjau, lalu server menghitung ulang.
export function FormHargaMassal({ aksi, aturan, jumlah }: { aksi: Aksi; aturan: Record<string, string>; jumlah: number }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      {Object.entries(aturan).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <div className="kisi-form">
        <IsiMedan hasil={hasil} m={{ jenis: 'teks', nama: 'label', label: 'Alasan atau catatan', wajib: true, maxLength: 120, lebar: true, bantuan: 'Muncul di riwayat harga, misalnya "Kenaikan harga bahan Desember".' }} />
        <IsiMedan hasil={hasil} m={{ jenis: 'centang', nama: 'konfirmasi', label: `Saya sudah memeriksa pratinjau di atas dan siap mengubah harga ${jumlah} menu.`, lebar: true }} />
      </div>
      <div className="tombol-baris">
        <TombolKirim>Terapkan perubahan harga</TombolKirim>
      </div>
    </form>
  )
}
