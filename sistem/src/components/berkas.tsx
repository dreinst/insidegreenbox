'use client'
// Isian berkas dengan batas ukuran di peramban (audit C-5). Berkas di atas batas langsung dilepas dari isian dengan
// pesan, jadi formulir tidak pernah mengirim badan di atas batas aksi server (3 MB) yang menjatuhkan halaman dan
// menghapus isian lain. Server tetap memeriksa ukuran dan jenis berkasnya sendiri.
import { useState, type InputHTMLAttributes } from 'react'

export const MB = 1024 * 1024

const ukuran = (n: number) => `${(n / MB).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { id: string; maks: number }

export function InputBerkas({ maks, onChange, 'aria-describedby': deskripsi, 'aria-invalid': salah, ...props }: Props) {
  const [galat, setGalat] = useState('')
  const idGalat = `${props.id}-terlalu-besar`
  return (
    <>
      <input
        {...props}
        type="file"
        data-maks-byte={maks}
        aria-invalid={galat ? true : salah}
        aria-describedby={galat ? idGalat : deskripsi}
        onChange={(e) => {
          const besar = [...(e.currentTarget.files ?? [])].find((f) => f.size > maks)
          if (besar) {
            setGalat(`Berkas ${besar.name} berukuran ${ukuran(besar.size)}, paling besar ${ukuran(maks)}. Pilih berkas yang lebih kecil; isian lain tidak berubah.`)
            e.currentTarget.value = ''
            return
          }
          setGalat('')
          onChange?.(e)
        }}
      />
      {galat ? (
        <small id={idGalat} className="galat-kolom" role="alert">
          {galat}
        </small>
      ) : null}
    </>
  )
}
