'use client'
// Formulir pemetaan akun (tahap 5B): satu pilihan akun per kunci, disimpan sekaligus. Isian terjaga saat galat (KONTRAK 6).
import { useActionState } from 'react'
import { galatKolom, nilaiAwal, PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>
export type BarisFormPeta = { kunci: string; nama: string; keterangan: string; akunId: number | null; wajib: boolean; pilihan: { nilai: string; label: string }[]; kosong?: string }
export type KelompokFormPeta = { judul: string; keterangan?: string; baris: BarisFormPeta[] }

export function FormPemetaan({ aksi, kelompok }: { aksi: Aksi; kelompok: KelompokFormPeta[] }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      {kelompok.map((k) => (
        <div key={k.judul} className="peta-kelompok">
          <h3>{k.judul}</h3>
          {k.keterangan ? <p className="redup kecil">{k.keterangan}</p> : null}
          {k.baris.map((b) => {
            const id = `k-${b.kunci.replace('.', '-')}`
            const g = galatKolom(hasil, b.kunci)
            return (
              <div key={b.kunci} className={`peta-baris${g ? ' salah' : ''}`}>
                <label htmlFor={id}>
                  {b.nama}
                  <small>
                    <code>{b.kunci}</code>
                    {b.keterangan ? ` · ${b.keterangan}` : ''}
                  </small>
                </label>
                <select id={id} name={b.kunci} defaultValue={nilaiAwal(hasil, b.kunci, b.akunId ? String(b.akunId) : '')} aria-invalid={g ? true : undefined} aria-describedby={g ? `${id}-g` : undefined}>
                  {!b.wajib || !b.akunId ? <option value="">{b.kosong ?? 'Pilih akun'}</option> : null}
                  {b.pilihan.map((p) => (
                    <option key={p.nilai} value={p.nilai}>
                      {p.label}
                    </option>
                  ))}
                </select>
                {g ? (
                  <small id={`${id}-g`} className="galat-kolom">
                    {g}
                  </small>
                ) : null}
              </div>
            )
          })}
        </div>
      ))}
      <div className="tombol-baris">
        <TombolKirim>Simpan pemetaan</TombolKirim>
      </div>
    </form>
  )
}
