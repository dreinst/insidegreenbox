'use client'
// tahap 3B: masuk kasir dengan nama dan PIN.
import { useActionState } from 'react'
import { PesanHasil, Pilih, TombolKirim } from '@/components/form'
import { KolomPin } from '@/components/kasir-form'
import { HASIL_AWAL } from '@/lib/aksi'
import { masukPinAksi } from './aksi'

export function FormMasukPin({ kasir }: { kasir: { id: number; name: string }[] }) {
  const [hasil, aksi] = useActionState(masukPinAksi, HASIL_AWAL)
  return (
    <form action={aksi} key={hasil.n} className="form-masuk" noValidate>
      <PesanHasil hasil={hasil} />
      <Pilih nama="userId" label="Nama kasir" hasil={hasil} wajib pilihan={[{ nilai: '', label: 'Pilih nama' }, ...kasir.map((k) => ({ nilai: String(k.id), label: k.name }))]} />
      <KolomPin nama="pin" label="PIN" hasil={hasil} wajib />
      <TombolKirim kelas="btn lebar">Masuk</TombolKirim>
    </form>
  )
}
