'use client'
import { useActionState } from 'react'
import { PesanHasil, Pilih, TombolKirim } from '@/components/form'
import { KolomPin, KolomTeks } from '@/components/kasir-form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

export function FormVoid({ aksi, penyetuju, no }: { aksi: Aksi; penyetuju: { id: number; name: string; peran: string }[] | null; no: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <KolomTeks nama="alasan" label="Alasan void" hasil={hasil} wajib maxLength={200} bantuan="Wajib diisi. Contoh: salah input menu, pelanggan batal." />
      {penyetuju ? (
        <>
          <p className="redup kecil jarak-atas">Kamu belum berhak void sendiri. Minta Admin atau Owner memasukkan PIN-nya.</p>
          <div className="kisi-form">
            <Pilih nama="penyetujuId" label="Penyetuju" hasil={hasil} wajib pilihan={[{ nilai: '', label: penyetuju.length ? 'Pilih penyetuju' : 'Belum ada penyetuju ber-PIN' }, ...penyetuju.map((u) => ({ nilai: String(u.id), label: `${u.name} (${u.peran})` }))]} />
            <KolomPin nama="pinPenyetuju" label="PIN penyetuju" hasil={hasil} wajib />
          </div>
        </>
      ) : null}
      <div className="tombol-baris">
        <TombolKirim kelas="btn bahaya" konfirmasi={`Void ${no}? Transaksi tetap tercatat dengan status Void.`}>
          Void transaksi
        </TombolKirim>
      </div>
    </form>
  )
}
