'use client'
// Bagian formulir bersama. Nilai awal kolom diambil dari isian terakhir saat galat (KONTRAK 6), jadi formulir yang
// dipasang ulang dengan key={hasil.n} tetap memuat apa yang diketik pengguna.
import { useFormStatus } from 'react-dom'
import type { HasilAksi } from '@/lib/aksi'

export function nilaiAwal(hasil: HasilAksi, nama: string, awal = '') {
  return !hasil.ok && hasil.isian && nama in hasil.isian ? hasil.isian[nama] : awal
}

export function galatKolom(hasil: HasilAksi, nama: string) {
  return !hasil.ok ? hasil.galat?.[nama] : undefined
}

export function PesanHasil({ hasil }: { hasil: HasilAksi }) {
  if (hasil.ok) return hasil.pesan ? <p className="pesan sukses" role="status">{hasil.pesan}</p> : null
  return (
    <p className="pesan galat" role="alert">
      {hasil.pesan}
    </p>
  )
}

type PropKolom = {
  nama: string
  label: string
  hasil: HasilAksi
  awal?: string
  tipe?: string
  wajib?: boolean
  bantuan?: string
  autoComplete?: string
  maxLength?: number
  disabled?: boolean
}

export function Kolom({ nama, label, hasil, awal = '', tipe = 'text', wajib, bantuan, autoComplete, maxLength, disabled }: PropKolom) {
  const galat = galatKolom(hasil, nama)
  const id = `k-${nama}`
  const sandi = tipe === 'password'
  return (
    <div className={`kolom${galat ? ' salah' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={nama}
        type={tipe}
        defaultValue={sandi ? undefined : nilaiAwal(hasil, nama, awal)}
        required={wajib}
        autoComplete={autoComplete}
        maxLength={maxLength}
        disabled={disabled}
        aria-invalid={galat ? true : undefined}
        aria-describedby={galat ? `${id}-g` : bantuan ? `${id}-b` : undefined}
      />
      {galat ? (
        <small id={`${id}-g`} className="galat-kolom">
          {galat}
        </small>
      ) : bantuan ? (
        <small id={`${id}-b`}>{bantuan}</small>
      ) : null}
    </div>
  )
}

type PropPilih = { nama: string; label: string; hasil: HasilAksi; awal?: string; pilihan: { nilai: string; label: string }[]; wajib?: boolean; bantuan?: string }

export function Pilih({ nama, label, hasil, awal = '', pilihan, wajib, bantuan }: PropPilih) {
  const galat = galatKolom(hasil, nama)
  const id = `k-${nama}`
  return (
    <div className={`kolom${galat ? ' salah' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <select id={id} name={nama} defaultValue={nilaiAwal(hasil, nama, awal)} required={wajib} aria-invalid={galat ? true : undefined} aria-describedby={galat ? `${id}-g` : undefined}>
        {pilihan.map((p) => (
          <option key={p.nilai} value={p.nilai}>
            {p.label}
          </option>
        ))}
      </select>
      {galat ? (
        <small id={`${id}-g`} className="galat-kolom">
          {galat}
        </small>
      ) : bantuan ? (
        <small>{bantuan}</small>
      ) : null}
    </div>
  )
}

export function TombolKirim({ children, kelas = 'btn', konfirmasi }: { children: React.ReactNode; kelas?: string; konfirmasi?: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      className={kelas}
      disabled={pending}
      aria-busy={pending || undefined}
      onClick={(e) => {
        if (konfirmasi && !window.confirm(konfirmasi)) e.preventDefault()
      }}
    >
      {pending ? 'Menyimpan...' : children}
    </button>
  )
}
