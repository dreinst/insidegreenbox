'use client'
// Formulir Aturan Persetujuan (KONTRAK 11 butir 156). Satu formulir untuk semua baris, seperti Saklar Fitur.
import { useActionState } from 'react'
import { PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>
export type BarisForm = {
  docType: string
  nama: string
  keterangan: string
  batas?: 'nominal' | 'persen'
  tetap?: string
  dikenal: boolean
  wajib: boolean
  nominal: string
  persen: string
  diubah: string
}

export function FormAturan({ aksi, baris, bisaUbah }: { aksi: Aksi; baris: BarisForm[]; bisaUbah: boolean }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const isian = !hasil.ok ? hasil.isian : undefined
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <ul className="daftar-saklar">
        {baris.map((b, i) => {
          // Nama isian memakai nomor urut, bukan jenis dokumen (lihat namaIsian di lib/persetujuan.ts).
          const namaBatas = b.batas === 'nominal' ? `nominal:${i}` : `persen:${i}`
          const namaWajib = `wajib:${i}`
          const galat = !hasil.ok ? hasil.galat?.[namaBatas] : undefined
          const kunci = !bisaUbah || !!b.tetap || !b.dikenal
          const id = `a-${b.docType.replace(/\W/g, '-')}`
          return (
            <li key={b.docType} className={galat ? 'salah' : undefined}>
              <input type="hidden" name={`jenis:${i}`} value={b.docType} />
              <label className="saklar">
                <input type="checkbox" name={namaWajib} value="1" defaultChecked={isian ? namaWajib in isian : b.wajib} disabled={kunci} aria-describedby={`${id}-k`} />
                <span className="saklar-tuas" aria-hidden="true" />
                <span className="saklar-teks">
                  <b>{b.nama}</b>
                  <small id={`${id}-k`}>
                    {b.keterangan}
                    {b.tetap ? ` ${b.tetap}` : ''}
                    {!b.dikenal ? ' Jenis dokumen ini tidak dibaca modul mana pun, jadi tidak bisa diubah di sini.' : ''}
                  </small>
                  <code className="redup">
                    {b.docType}
                    {b.diubah ? ` · ${b.diubah}` : ''}
                  </code>
                </span>
              </label>
              {b.batas && b.dikenal && !b.tetap ? (
                <div className="kolom batas">
                  <label htmlFor={`${id}-b`}>{b.batas === 'nominal' ? 'Batas nominal (Rp)' : 'Batas selisih (%)'}</label>
                  <input
                    id={`${id}-b`}
                    name={namaBatas}
                    inputMode={b.batas === 'nominal' ? 'numeric' : 'decimal'}
                    autoComplete="off"
                    defaultValue={isian ? (isian[namaBatas] ?? '') : b.batas === 'nominal' ? b.nominal : b.persen}
                    disabled={!bisaUbah}
                    placeholder={b.batas === 'nominal' ? 'semua nilai' : 'semua faktur'}
                    aria-invalid={galat ? true : undefined}
                    aria-describedby={galat ? `${id}-g` : undefined}
                  />
                  {galat ? (
                    <small id={`${id}-g`} className="galat-kolom">
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
          <TombolKirim>Simpan aturan</TombolKirim>
        </div>
      ) : null}
    </form>
  )
}
