'use client'
// Formulir setoran POS. Isian terjaga saat galat lewat nilaiAwal dan key={hasil.n} (KONTRAK 6).
import { useActionState, useState } from 'react'
import { galatKolom, nilaiAwal, PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'
import { rupiah } from '@/lib/hitung-kasir'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

export function FormBuat({ aksi, awal, maks }: { aksi: Aksi; awal: string; maks: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const galat = galatKolom(hasil, 'tanggal')
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="st-buat">
        <div className={`kolom${galat ? ' salah' : ''}`}>
          <label htmlFor="k-tanggal">Tanggal shift</label>
          <input id="k-tanggal" name="tanggal" type="date" max={maks} defaultValue={nilaiAwal(hasil, 'tanggal', awal)} required aria-invalid={galat ? true : undefined} aria-describedby={galat ? 'k-tanggal-g' : undefined} />
          {galat ? (
            <small id="k-tanggal-g" className="galat-kolom">
              {galat}
            </small>
          ) : null}
        </div>
        <TombolKirim>Buat setoran hari ini</TombolKirim>
      </div>
    </form>
  )
}

type Baris = { id: number; shift: number; kasir: string; waktu: string; status: string; expected: number; actual: number; note: string }
type Kepala = { bankAccountId: number | null; mdrFee: number; note: string; bukti: { url: string; pdf: boolean } | null }

const angka = (t: string) => {
  const minus = t.trim().startsWith('-')
  const n = Number(t.replace(/[^\d]/g, '')) || 0
  return minus ? -n : n
}

export function FormUbah({ aksi, kepala, baris, rekening, tunai }: { aksi: Aksi; kepala: Kepala; baris: Baris[]; rekening: { id: number; label: string }[]; tunai: boolean }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return <IsiUbah key={hasil.n} hasil={hasil} kirim={kirim} kepala={kepala} baris={baris} rekening={rekening} tunai={tunai} />
}

function IsiUbah({ hasil, kirim, kepala, baris, rekening, tunai }: { hasil: HasilAksi; kirim: (fd: FormData) => void; kepala: Kepala; baris: Baris[]; rekening: { id: number; label: string }[]; tunai: boolean }) {
  const [nilai, setNilai] = useState<Record<number, number>>(() => Object.fromEntries(baris.map((b) => [b.id, angka(nilaiAwal(hasil, `actual_${b.id}`, String(b.actual)))])))
  const [mdr, setMdr] = useState(() => angka(nilaiAwal(hasil, 'mdrFee', String(kepala.mdrFee))))
  const sistem = baris.reduce((a, b) => a + b.expected, 0)
  const disetor = baris.reduce((a, b) => a + (nilai[b.id] ?? 0), 0)
  const selisih = disetor + mdr - sistem
  const g = (k: string) => galatKolom(hasil, k)
  return (
    <form action={kirim} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        <div className={`kolom${g('bankAccountId') ? ' salah' : ''}`}>
          <label htmlFor="k-bankAccountId">Rekening tujuan</label>
          <select id="k-bankAccountId" name="bankAccountId" defaultValue={nilaiAwal(hasil, 'bankAccountId', kepala.bankAccountId ? String(kepala.bankAccountId) : '')} aria-invalid={g('bankAccountId') ? true : undefined}>
            <option value="">{tunai ? 'Kas Besar (tanpa rekening)' : 'Pilih rekening'}</option>
            {rekening.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
          {g('bankAccountId') ? <small className="galat-kolom">{g('bankAccountId')}</small> : <small>{tunai ? 'Kosongkan bila uang disimpan di Kas Besar.' : 'Wajib diisi sebelum posting.'}</small>}
        </div>
        <div className={`kolom${g('mdrFee') ? ' salah' : ''}`}>
          <label htmlFor="k-mdrFee">Biaya MDR</label>
          <input id="k-mdrFee" name="mdrFee" type="text" inputMode="numeric" autoComplete="off" defaultValue={nilaiAwal(hasil, 'mdrFee', String(kepala.mdrFee))} onChange={(e) => setMdr(angka(e.target.value))} aria-invalid={g('mdrFee') ? true : undefined} />
          {g('mdrFee') ? <small className="galat-kolom">{g('mdrFee')}</small> : <small>Bawaan dari persen MDR metode, boleh diubah sesuai mutasi.</small>}
        </div>
        <div className={`kolom lebar${g('note') ? ' salah' : ''}`}>
          <label htmlFor="k-note">Catatan</label>
          <input id="k-note" name="note" type="text" maxLength={300} defaultValue={nilaiAwal(hasil, 'note', kepala.note)} aria-invalid={g('note') ? true : undefined} />
          {g('note') ? <small className="galat-kolom">{g('note')}</small> : null}
        </div>
        <div className={`kolom lebar${g('bukti') ? ' salah' : ''}`}>
          <label htmlFor="k-bukti">Bukti setor (boleh kosong)</label>
          <input id="k-bukti" name="bukti" type="file" accept="image/webp,image/png,image/jpeg,application/pdf" aria-invalid={g('bukti') ? true : undefined} />
          {g('bukti') ? <small className="galat-kolom">{g('bukti')}</small> : <small>Foto atau PDF slip setor, paling besar 2 MB. Berkas baru menggantikan yang lama.</small>}
          {kepala.bukti ? (
            <label className="st-centang">
              <input type="checkbox" name="hapusBukti" /> Hapus bukti yang sekarang
            </label>
          ) : null}
        </div>
      </div>

      <div className="lap-gulir st-jarak" role="region" aria-label="Baris shift" tabIndex={0}>
        <table className="tabel lap-tabel">
          <thead>
            <tr>
              <th scope="col">Shift</th>
              <th scope="col">Kasir</th>
              <th scope="col" className="angka">
                Nilai sistem
              </th>
              <th scope="col" className="angka">
                Nilai disetor
              </th>
              <th scope="col" className="angka">
                Selisih
              </th>
              <th scope="col">Catatan</th>
            </tr>
          </thead>
          <tbody>
            {baris.map((b) => {
              const ga = g(`actual_${b.id}`)
              const gc = g(`catatan_${b.id}`)
              const beda = (nilai[b.id] ?? 0) - b.expected
              return (
                <tr key={b.id}>
                  <td data-label="Shift" className="tebal">
                    <span>
                      #{b.shift} <small className="redup">{b.status}</small>
                    </span>
                  </td>
                  <td data-label="Kasir">
                    <span>
                      {b.kasir} <small className="redup">{b.waktu}</small>
                    </span>
                  </td>
                  <td data-label="Nilai sistem" className="angka">
                    {rupiah(b.expected).replace('Rp -', '-Rp ')}
                  </td>
                  <td data-label="Nilai disetor" className="angka">
                    <input
                      className="st-baris-input"
                      name={`actual_${b.id}`}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      aria-label={`Nilai disetor shift #${b.shift}`}
                      defaultValue={nilaiAwal(hasil, `actual_${b.id}`, String(b.actual))}
                      onChange={(e) => setNilai((n) => ({ ...n, [b.id]: angka(e.target.value) }))}
                      aria-invalid={ga ? true : undefined}
                    />
                    {ga ? <small className="galat-kolom st-galat">{ga}</small> : null}
                  </td>
                  <td data-label="Selisih" className={`angka${beda ? ' lap-merah' : ''}`}>
                    {beda === 0 ? 'Rp 0' : `${beda < 0 ? '-' : '+'}${rupiah(Math.abs(beda))}`}
                  </td>
                  <td data-label="Catatan">
                    <input className="st-baris-input teks" name={`catatan_${b.id}`} type="text" maxLength={120} aria-label={`Catatan shift #${b.shift}`} defaultValue={nilaiAwal(hasil, `catatan_${b.id}`, b.note)} aria-invalid={gc ? true : undefined} />
                    {gc ? <small className="galat-kolom st-galat">{gc}</small> : null}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <dl className="lap-ringkas st-jarak" aria-live="polite">
        <div>
          <dt>Nilai sistem</dt>
          <dd>{rupiah(sistem).replace('Rp -', '-Rp ')}</dd>
        </div>
        <div>
          <dt>Disetor + MDR</dt>
          <dd>{rupiah(disetor + mdr).replace('Rp -', '-Rp ')}</dd>
        </div>
        <div>
          <dt>Selisih</dt>
          <dd className={selisih ? 'lap-merah' : undefined}>{selisih === 0 ? 'Rp 0' : `${selisih < 0 ? '-' : '+'}${rupiah(Math.abs(selisih))}`}</dd>
        </div>
      </dl>
      <div className="tombol-baris">
        <TombolKirim>Simpan setoran</TombolKirim>
      </div>
    </form>
  )
}

export function FormTombol({ aksi, label, kelas = 'btn', konfirmasi }: { aksi: Aksi; label: string; kelas?: string; konfirmasi?: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} className="form">
      <PesanHasil hasil={hasil} />
      <TombolKirim kelas={kelas} konfirmasi={konfirmasi}>
        {label}
      </TombolKirim>
    </form>
  )
}

export function FormAlasan({ aksi, nama, label, tombol, kelas = 'btn bahaya', wajib, bantuan, konfirmasi }: { aksi: Aksi; nama: string; label: string; tombol: string; kelas?: string; wajib?: boolean; bantuan?: string; konfirmasi?: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const galat = galatKolom(hasil, nama)
  const id = `k-${nama}`
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className={`kolom${galat ? ' salah' : ''}`}>
        <label htmlFor={id}>{label}</label>
        <input id={id} name={nama} type="text" maxLength={200} required={wajib} defaultValue={nilaiAwal(hasil, nama)} aria-invalid={galat ? true : undefined} aria-describedby={galat ? `${id}-g` : bantuan ? `${id}-b` : undefined} />
        {galat ? (
          <small id={`${id}-g`} className="galat-kolom">
            {galat}
          </small>
        ) : bantuan ? (
          <small id={`${id}-b`}>{bantuan}</small>
        ) : null}
      </div>
      <div className="tombol-baris">
        <TombolKirim kelas={kelas} konfirmasi={konfirmasi}>
          {tombol}
        </TombolKirim>
      </div>
    </form>
  )
}
