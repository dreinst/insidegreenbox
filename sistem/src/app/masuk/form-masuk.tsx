'use client'
import { useActionState } from 'react'
import { Kolom, PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL } from '@/lib/aksi'
import { masukAksi } from './aksi'

export function FormMasuk({ ke }: { ke?: string }) {
  const [hasil, aksi] = useActionState(masukAksi, HASIL_AWAL)
  return (
    <form action={aksi} key={hasil.n} className="form-masuk" noValidate>
      <PesanHasil hasil={hasil} />
      <input type="hidden" name="ke" value={ke ?? ''} />
      <Kolom nama="username" label="Nama pengguna" hasil={hasil} autoComplete="username" wajib maxLength={64} />
      <Kolom nama="password" label="Sandi" tipe="password" hasil={hasil} autoComplete="current-password" wajib />
      <TombolKirim kelas="btn lebar">Masuk</TombolKirim>
    </form>
  )
}
