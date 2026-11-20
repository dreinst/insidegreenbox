'use client'
import { useActionState } from 'react'
import { Kolom, PesanHasil, Pilih, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>
type PilihanPeran = { nilai: string; label: string }[]

export function FormPenggunaBaru({ aksi, peran }: { aksi: Aksi; peran: PilihanPeran }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        <Kolom nama="name" label="Nama lengkap" hasil={hasil} wajib maxLength={80} autoComplete="off" />
        <Kolom nama="username" label="Nama pengguna" hasil={hasil} wajib maxLength={32} autoComplete="off" bantuan="Huruf kecil, angka, titik, garis bawah, atau tanda hubung." />
        <Pilih nama="roleId" label="Peran" hasil={hasil} pilihan={[{ nilai: '', label: 'Pilih peran' }, ...peran]} wajib />
        <span />
        <Kolom nama="sandi" label="Sandi" tipe="password" hasil={hasil} wajib autoComplete="new-password" bantuan="Minimal 8 karakter." />
        <Kolom nama="ulangiSandi" label="Ulangi sandi" tipe="password" hasil={hasil} wajib autoComplete="new-password" />
      </div>
      <div className="tombol-baris">
        <TombolKirim>Simpan pengguna</TombolKirim>
      </div>
    </form>
  )
}

export function FormUbahPengguna({ aksi, peran, awal, kunciPeran }: { aksi: Aksi; peran: PilihanPeran; awal: { name: string; username: string; roleId: string }; kunciPeran?: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        <Kolom nama="name" label="Nama lengkap" hasil={hasil} awal={awal.name} wajib maxLength={80} autoComplete="off" />
        <Kolom nama="username" label="Nama pengguna" hasil={hasil} awal={awal.username} wajib maxLength={32} autoComplete="off" />
        <Pilih nama="roleId" label="Peran" hasil={hasil} awal={awal.roleId} pilihan={peran} wajib bantuan={kunciPeran} />
      </div>
      <div className="tombol-baris">
        <TombolKirim>Simpan perubahan</TombolKirim>
      </div>
    </form>
  )
}

export function FormSandi({ aksi }: { aksi: Aksi }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        <Kolom nama="sandi" label="Sandi baru" tipe="password" hasil={hasil} wajib autoComplete="new-password" bantuan="Minimal 8 karakter." />
        <Kolom nama="ulangiSandi" label="Ulangi sandi baru" tipe="password" hasil={hasil} wajib autoComplete="new-password" />
      </div>
      <div className="tombol-baris">
        <TombolKirim kelas="btn sekunder">Atur ulang sandi</TombolKirim>
      </div>
    </form>
  )
}

export function FormStatus({ aksi, aktif, label, konfirmasi }: { aksi: Aksi; aktif: boolean; label: string; konfirmasi?: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} className="form">
      <PesanHasil hasil={hasil} />
      <TombolKirim kelas={`btn ${aktif ? 'bahaya' : ''}`} konfirmasi={konfirmasi}>
        {label}
      </TombolKirim>
    </form>
  )
}
