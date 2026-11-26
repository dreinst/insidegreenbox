'use client'
import { useActionState } from 'react'
import { PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>
export type BarisSaklar = { kode: string; nama: string; keterangan: string; satuan?: string; nyala: boolean; batas: string; kunci: boolean }

export function FormSaklar({ aksi, baris, bisaUbah }: { aksi: Aksi; baris: BarisSaklar[]; bisaUbah: boolean }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const isian = !hasil.ok ? hasil.isian : undefined
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <ul className="daftar-saklar">
        {baris.map((s) => {
          const galat = !hasil.ok ? hasil.galat?.[`batas:${s.kode}`] : undefined
          return (
            <li key={s.kode} className={galat ? 'salah' : undefined}>
              <label className="saklar">
                <input type="checkbox" name={`nyala:${s.kode}`} value="1" defaultChecked={isian ? `nyala:${s.kode}` in isian : s.nyala} disabled={!bisaUbah || s.kunci} />
                <span className="saklar-tuas" aria-hidden="true" />
                <span className="saklar-teks">
                  <b>{s.nama}</b>
                  <small>{s.keterangan}</small>
                  <code className="redup">{s.kode}</code>
                </span>
                {s.kunci ? <input type="hidden" name={`nyala:${s.kode}`} value="1" /> : null}
              </label>
              {s.satuan ? (
                <div className="kolom batas">
                  <label htmlFor={`b-${s.kode}`}>Batas ({s.satuan})</label>
                  <input
                    id={`b-${s.kode}`}
                    name={`batas:${s.kode}`}
                    inputMode="numeric"
                    defaultValue={isian ? (isian[`batas:${s.kode}`] ?? '') : s.batas}
                    disabled={!bisaUbah}
                    placeholder="tanpa batas"
                    aria-invalid={galat ? true : undefined}
                    aria-describedby={galat ? `b-${s.kode}-g` : undefined}
                  />
                  {galat ? (
                    <small id={`b-${s.kode}-g`} className="galat-kolom">
                      {galat}
                    </small>
                  ) : null}
                </div>
              ) : null}
            </li>
          )
        })}
      </ul>
      {bisaUbah ? (
        <div className="tombol-baris lengket">
          <TombolKirim>Simpan saklar</TombolKirim>
        </div>
      ) : null}
    </form>
  )
}
