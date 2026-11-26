'use client'
// Formulir rincian anggaran tahap 6B: satu baris per akun dengan 12 isian bulan (nama n_<id akun>_<bulan>). Di layar
// lebar tabel digulir di dalam kartunya; di HP setiap akun menjadi kartu berlabel. Isian terjaga saat galat (KONTRAK 6).
import { useActionState } from 'react'
import { galatKolom, nilaiAwal, PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>
export type BarisAnggaran = { id: number; code: string; name: string; jenis: string; bulan: string[]; total: string }

export function FormRincianAnggaran({ aksi, baris, namaBulan }: { aksi: Aksi; baris: BarisAnggaran[]; namaBulan: string[] }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <p className="ag-petunjuk">Isi rupiah bulat per bulan. Geser tabel ke samping untuk melihat semua bulan.</p>
      <div className="kartu tanpa-isi ag-gulir" role="region" aria-label="Rincian anggaran per bulan" tabIndex={0}>
        <table className="tabel ag-tabel">
          <thead>
            <tr>
              <th scope="col">Akun</th>
              {namaBulan.map((b) => (
                <th key={b} scope="col" className="angka">
                  {b}
                </th>
              ))}
              <th scope="col" className="angka">
                Setahun
              </th>
            </tr>
          </thead>
          <tbody>
            {baris.map((a) => (
              <tr key={a.id}>
                <td data-label="Akun">
                  <span className="tebal">
                    {a.code} {a.name}
                  </span>
                  <small className="redup blok">{a.jenis}</small>
                </td>
                {namaBulan.map((b, i) => {
                  const nama = `n_${a.id}_${i + 1}`
                  const g = galatKolom(hasil, nama)
                  return (
                    <td key={b} data-label={b}>
                      <label htmlFor={`k-${nama}`} className="sr">
                        {a.code} {b}
                      </label>
                      <input
                        id={`k-${nama}`}
                        name={nama}
                        className="bl-isian"
                        inputMode="numeric"
                        autoComplete="off"
                        defaultValue={nilaiAwal(hasil, nama, a.bulan[i])}
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
                <td data-label="Setahun" className="ag-total">
                  {a.total}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="tombol-baris">
        <TombolKirim kelas="btn sekunder">Simpan angka anggaran</TombolKirim>
      </div>
    </form>
  )
}
