'use client'
// Formulir klien Rekonsiliasi Bank (tahap 5C): impor mutasi dengan berkas CSV dan pemetaan kolom, serta pencocokan satu
// baris mutasi dengan satu atau beberapa baris jurnal. Isian terjaga saat galat (KONTRAK 6).
import { useActionState } from 'react'
import { galatKolom, PesanHasil, TombolKirim } from '@/components/form'
import { IsiMedan, type Medan } from '@/components/form-master'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

export function FormImpor({ aksi, medan, kelompok }: { aksi: Aksi; medan: Medan[]; kelompok: { judul: string; nama: string[] }[] }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const salah = galatKolom(hasil, 'berkas')
  const peta = new Map(medan.map((m) => [m.nama, m]))
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        {medan
          .filter((m) => !kelompok.some((g) => g.nama.includes(m.nama)))
          .map((m) => (
            <IsiMedan key={m.nama} m={m} hasil={hasil} />
          ))}
        <div className={`kolom lebar${salah ? ' salah' : ''}`}>
          <label htmlFor="k-berkas">Berkas CSV mutasi</label>
          <input id="k-berkas" name="berkas" type="file" accept=".csv,text/csv,text/plain" required aria-invalid={salah ? true : undefined} aria-describedby={salah ? 'k-berkas-g' : 'k-berkas-b'} />
          {salah ? (
            <small id="k-berkas-g" className="galat-kolom">
              {salah}
            </small>
          ) : (
            <small id="k-berkas-b">Paling besar 1 MB. Baris yang sudah pernah diimpor dilewati.</small>
          )}
        </div>
      </div>
      {kelompok.map((g) => (
        <fieldset key={g.judul} className="rk-kelompok">
          <legend>{g.judul}</legend>
          <div className="kisi-form">
            {g.nama.map((n) => {
              const m = peta.get(n)
              return m ? <IsiMedan key={n} m={m} hasil={hasil} /> : null
            })}
          </div>
        </fieldset>
      ))}
      <div className="tombol-baris">
        <TombolKirim>Impor mutasi</TombolKirim>
      </div>
    </form>
  )
}

export type Calon = { id: number; judul: string; rinci: string; nilai: string; saran: boolean }

// Pencocokan satu baris mutasi. Saran sudah tercentang; jumlah yang dipilih harus sama dengan mutasi (diperiksa server).
export function FormCocok({ aksi, idMutasi, calon }: { aksi: Aksi; idMutasi: number; calon: Calon[] }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const salah = galatKolom(hasil, 'jl')
  const dipilih = !hasil.ok && hasil.isian ? new Set(Object.keys(hasil.isian).filter((k) => k.startsWith('jl_')).map((k) => Number(k.slice(3)))) : null
  return (
    <form action={kirim} key={hasil.n} className="form rk-pilih" noValidate>
      <PesanHasil hasil={hasil} />
      <fieldset aria-describedby={salah ? `rk-g-${idMutasi}` : undefined}>
        <legend>Pilih jurnal bank yang cocok</legend>
        {calon.map((c) => (
          <label key={c.id} className={`rk-calon${c.saran ? ' saran' : ''}`}>
            <input type="checkbox" name={`jl_${c.id}`} value="1" defaultChecked={dipilih ? dipilih.has(c.id) : c.saran} />
            <span>
              <b>
                {c.judul} · {c.nilai}
              </b>
              <span>{c.rinci}</span>
              {c.saran ? <span className="redup">Saran sistem</span> : null}
            </span>
          </label>
        ))}
        {salah ? (
          <small id={`rk-g-${idMutasi}`} className="galat-kolom">
            {salah}
          </small>
        ) : null}
      </fieldset>
      <div className="rk-tombol">
        <TombolKirim kelas="btn kecil">Cocokkan</TombolKirim>
      </div>
    </form>
  )
}
