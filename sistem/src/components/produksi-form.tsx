'use client'
// Formulir qty per baris dokumen produksi tahap 4B (pengeluaran bahan dan produksi cepat). Nama kolom qty_<id>.
import { useActionState } from 'react'
import { galatKolom, nilaiAwal, PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

export type BarisQty = { id: number; nama: string; kode: string; satuan: string; sel: string[]; qty: string; tandai?: boolean }

export function FormQty({ aksi, kolom, baris, labelQty, tombol }: { aksi: Aksi; kolom: string[]; baris: BarisQty[]; labelQty: string; tombol: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kartu tanpa-isi">
        <table className="tabel tabel-qty">
          <thead>
            <tr>
              <th scope="col">Bahan</th>
              {kolom.map((k) => (
                <th scope="col" key={k} className="angka">
                  {k}
                </th>
              ))}
              <th scope="col">{labelQty}</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const nama = `qty_${b.id}`
              const g = galatKolom(hasil, nama)
              return (
                <tr key={b.id} className={b.tandai ? 'menyimpang' : undefined}>
                  <td data-label="Bahan">
                    <span className="tebal">{b.nama}</span>
                    <small className="redup blok">{b.kode}</small>
                  </td>
                  {b.sel.map((isi, i) => (
                    <td key={kolom[i]} data-label={kolom[i]} className="angka">
                      {isi}
                    </td>
                  ))}
                  <td data-label={labelQty}>
                    <div className={`kolom${g ? ' salah' : ''}`}>
                      <label htmlFor={`k-${nama}`} className="sr">
                        {labelQty} {b.nama} ({b.satuan})
                      </label>
                      <input id={`k-${nama}`} name={nama} inputMode="decimal" autoComplete="off" defaultValue={nilaiAwal(hasil, nama, b.qty)} aria-invalid={g ? true : undefined} aria-describedby={g ? `k-${nama}-g` : undefined} />
                      {g ? (
                        <small id={`k-${nama}-g`} className="galat-kolom">
                          {g}
                        </small>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="tombol-baris">
        <TombolKirim kelas="btn sekunder">{tombol}</TombolKirim>
      </div>
    </form>
  )
}
