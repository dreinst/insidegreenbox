'use client'
// Formulir modul pembelian tahap 4C: isian per baris (qty, harga, jumlah bayar) dalam satu tabel, dan formulir alasan
// untuk batal atau tutup sisa. Nama isian <awalan>_<id> dibaca modul di src/lib/beli. Isian terjaga saat galat (KONTRAK 6).
import { useActionState } from 'react'
import { galatKolom, nilaiAwal, PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

export type KolomTampil = { kunci: string; label: string; angka?: boolean }
export type KolomIsian = { awalan: string; label: string; inputMode?: 'decimal' | 'numeric'; placeholder?: string }
export type BarisIsian = { id: string; judul: string; kecil?: string; sel: Record<string, string>; nilai: Record<string, string>; mati?: string[] }

// Tabel dengan isian per baris. Di layar sempit tabel menjadi kartu per baris (globals.css), jadi tiap isian punya label.
export function FormIsianBaris({
  aksi,
  kolom,
  isian,
  baris,
  tombol,
  judulKolom = 'Produk',
  catatan,
}: {
  aksi: Aksi
  kolom: KolomTampil[]
  isian: KolomIsian[]
  baris: BarisIsian[]
  tombol: string
  judulKolom?: string
  catatan?: string
}) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kartu tanpa-isi">
        <table className="tabel bl-tabel">
          <thead>
            <tr>
              <th scope="col">{judulKolom}</th>
              {kolom.map((k) => (
                <th key={k.kunci} scope="col" className={k.angka ? 'angka' : undefined}>
                  {k.label}
                </th>
              ))}
              {isian.map((i) => (
                <th key={i.awalan} scope="col" className="angka">
                  {i.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => (
              <tr key={b.id}>
                <td data-label={judulKolom}>
                  <span className="tebal">{b.judul}</span>
                  {b.kecil ? <small className="redup blok">{b.kecil}</small> : null}
                </td>
                {kolom.map((k) => (
                  <td key={k.kunci} data-label={k.label} className={k.angka ? 'angka' : undefined}>
                    {b.sel[k.kunci] ?? '-'}
                  </td>
                ))}
                {isian.map((i) => {
                  const nama = `${i.awalan}_${b.id}`
                  const g = galatKolom(hasil, nama)
                  return (
                    <td key={i.awalan} data-label={i.label}>
                      <label htmlFor={`k-${nama}`} className="sr">
                        {i.label} {b.judul}
                      </label>
                      <input
                        id={`k-${nama}`}
                        name={nama}
                        className="bl-isian"
                        inputMode={i.inputMode ?? 'decimal'}
                        autoComplete="off"
                        placeholder={i.placeholder}
                        defaultValue={nilaiAwal(hasil, nama, b.nilai[i.awalan] ?? '')}
                        disabled={b.mati?.includes(i.awalan)}
                        aria-invalid={g ? true : undefined}
                        aria-describedby={g ? `k-${nama}-g` : undefined}
                      />
                      {g ? (
                        <small id={`k-${nama}-g`} className="bl-galat">
                          {g}
                        </small>
                      ) : null}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {catatan ? <p className="redup kecil">{catatan}</p> : null}
      <div className="tombol-baris">
        <TombolKirim kelas="btn sekunder">{tombol}</TombolKirim>
      </div>
    </form>
  )
}

// Formulir alasan untuk batal atau tutup sisa. idAwal membedakan beberapa formulir alasan di satu halaman.
export function FormAlasan({ aksi, idAwal, label, wajib, konfirmasi, kelas = 'btn bahaya', petunjuk }: { aksi: Aksi; idAwal: string; label: string; wajib: boolean; konfirmasi: string; kelas?: string; petunjuk?: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const salah = galatKolom(hasil, 'alasan')
  const id = `k-${idAwal}-alasan`
  return (
    <form action={kirim} key={hasil.n} className="form form-batal" noValidate>
      <PesanHasil hasil={hasil} />
      <div className={`kolom${salah ? ' salah' : ''}`}>
        <label htmlFor={id}>{wajib ? 'Alasan' : 'Alasan (boleh kosong)'}</label>
        <textarea id={id} name="alasan" rows={2} maxLength={300} defaultValue={nilaiAwal(hasil, 'alasan')} aria-invalid={salah ? true : undefined} aria-describedby={salah ? `${id}-g` : petunjuk ? `${id}-b` : undefined} />
        {salah ? (
          <small id={`${id}-g`} className="galat-kolom">
            {salah}
          </small>
        ) : petunjuk ? (
          <small id={`${id}-b`}>{petunjuk}</small>
        ) : null}
      </div>
      <div className="tombol-baris">
        <TombolKirim kelas={kelas} konfirmasi={konfirmasi}>
          {label}
        </TombolKirim>
      </div>
    </form>
  )
}
