'use client'
// Kolom formulir modul kasir (tahap 3B): angka rupiah, PIN, dan teks panjang. Nilai awal ikut isian terakhir saat
// galat, sama dengan komponen di form.tsx (KONTRAK 6).
import { galatKolom, nilaiAwal } from '@/components/form'
import type { HasilAksi } from '@/lib/aksi'

type Dasar = { nama: string; label: string; hasil: HasilAksi; awal?: string; wajib?: boolean; bantuan?: string; id?: string }

function Bawah({ id, galat, bantuan }: { id: string; galat?: string; bantuan?: string }) {
  if (galat)
    return (
      <small id={`${id}-g`} className="galat-kolom">
        {galat}
      </small>
    )
  return bantuan ? <small id={`${id}-b`}>{bantuan}</small> : null
}

export function KolomAngka({ nama, label, hasil, awal = '', wajib, bantuan, id: idLain, awalan = 'Rp' }: Dasar & { awalan?: string }) {
  const galat = galatKolom(hasil, nama)
  const id = idLain ?? `k-${nama}`
  return (
    <div className={`kolom${galat ? ' salah' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <span className="kolom-awalan">
        {awalan ? <span aria-hidden="true">{awalan}</span> : null}
        <input
          id={id}
          name={nama}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          defaultValue={nilaiAwal(hasil, nama, awal)}
          required={wajib}
          maxLength={15}
          aria-invalid={galat ? true : undefined}
          aria-describedby={galat ? `${id}-g` : bantuan ? `${id}-b` : undefined}
        />
      </span>
      <Bawah id={id} galat={galat} bantuan={bantuan} />
    </div>
  )
}

export function KolomPin({ nama, label, hasil, wajib, bantuan, id: idLain }: Dasar) {
  const galat = galatKolom(hasil, nama)
  const id = idLain ?? `k-${nama}`
  return (
    <div className={`kolom${galat ? ' salah' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={nama}
        type="password"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        maxLength={6}
        required={wajib}
        aria-invalid={galat ? true : undefined}
        aria-describedby={galat ? `${id}-g` : bantuan ? `${id}-b` : undefined}
      />
      <Bawah id={id} galat={galat} bantuan={bantuan} />
    </div>
  )
}

export function KolomTeks({ nama, label, hasil, awal = '', wajib, bantuan, id: idLain, maxLength = 200 }: Dasar & { maxLength?: number }) {
  const galat = galatKolom(hasil, nama)
  const id = idLain ?? `k-${nama}`
  return (
    <div className={`kolom${galat ? ' salah' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <textarea
        id={id}
        name={nama}
        rows={2}
        defaultValue={nilaiAwal(hasil, nama, awal)}
        required={wajib}
        maxLength={maxLength}
        aria-invalid={galat ? true : undefined}
        aria-describedby={galat ? `${id}-g` : bantuan ? `${id}-b` : undefined}
      />
      <Bawah id={id} galat={galat} bantuan={bantuan} />
    </div>
  )
}
