'use client'
import { useActionState } from 'react'
import { PesanHasil, TombolKirim } from '@/components/form'
import { KolomPin } from '@/components/kasir-form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

export function FormPin({ aksi, ada }: { aksi: Aksi; ada: boolean }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        <KolomPin nama="pin" label={ada ? 'PIN baru' : 'PIN'} hasil={hasil} wajib bantuan="4 sampai 6 angka." />
        <KolomPin nama="ulangiPin" label="Ulangi PIN" hasil={hasil} wajib />
      </div>
      <div className="tombol-baris">
        <TombolKirim>{ada ? 'Ganti PIN' : 'Simpan PIN'}</TombolKirim>
      </div>
    </form>
  )
}

export function FormHapusPin({ aksi, nama }: { aksi: Aksi; nama: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} className="form">
      <PesanHasil hasil={hasil} />
      <TombolKirim kelas="btn sekunder" konfirmasi={`Hapus PIN ${nama}? Ia tidak bisa lagi masuk atau menyetujui dengan PIN.`}>
        Hapus PIN
      </TombolKirim>
    </form>
  )
}
