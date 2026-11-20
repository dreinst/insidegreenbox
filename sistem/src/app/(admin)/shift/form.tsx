'use client'
import { useActionState, useState } from 'react'
import { galatKolom, nilaiAwal, PesanHasil, TombolKirim } from '@/components/form'
import { KolomAngka, KolomTeks } from '@/components/kasir-form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'
import { PECAHAN, rupiah } from '@/lib/hitung-kasir'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

export function FormBuka({ aksi }: { aksi: Aksi }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        <KolomAngka nama="modal" label="Modal awal laci" hasil={hasil} awal="200000" wajib bantuan="Uang yang ada di laci saat shift dimulai." />
      </div>
      <div className="tombol-baris">
        <TombolKirim>Buka shift</TombolKirim>
      </div>
    </form>
  )
}

export function FormKas({ aksi }: { aksi: Aksi }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const galat = galatKolom(hasil, 'jenis')
  const jenis = nilaiAwal(hasil, 'jenis', 'keluar')
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <fieldset className={`pilih-jenis${galat ? ' salah' : ''}`}>
        <legend>Jenis</legend>
        <label>
          <input type="radio" name="jenis" value="keluar" defaultChecked={jenis === 'keluar'} /> Kas keluar
        </label>
        <label>
          <input type="radio" name="jenis" value="masuk" defaultChecked={jenis === 'masuk'} /> Kas masuk
        </label>
        {galat ? <small className="galat-kolom">{galat}</small> : null}
      </fieldset>
      <div className="kisi-form jarak-atas">
        <KolomAngka nama="jumlah" label="Jumlah" hasil={hasil} wajib />
        <KolomTeks nama="alasan" label="Alasan" hasil={hasil} wajib maxLength={120} bantuan="Contoh: beli es batu, tambah uang receh." />
      </div>
      <div className="tombol-baris">
        <TombolKirim kelas="btn sekunder">Catat kas laci</TombolKirim>
      </div>
    </form>
  )
}

export function FormTutup({ aksi }: { aksi: Aksi }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return <IsiTutup key={hasil.n} hasil={hasil} kirim={kirim} />
}

function IsiTutup({ hasil, kirim }: { hasil: HasilAksi; kirim: (fd: FormData) => void }) {
  const awal = Object.fromEntries(PECAHAN.map((p) => [p, Number(nilaiAwal(hasil, `pecahan_${p}`, '').replace(/\D/g, '')) || 0]))
  const [lembar, setLembar] = useState<Record<number, number>>(awal)
  const total = PECAHAN.reduce((a, p) => a + p * (lembar[p] ?? 0), 0)
  const pakaiPecahan = total > 0
  return (
    <form action={kirim} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <p className="redup">Hitung uang di laci lalu isi jumlahnya. Kas seharusnya baru tampil sesudah shift ditutup.</p>
      <div className="kisi-form">
        <KolomAngka nama="kasDihitung" label="Kas dihitung" hasil={hasil} bantuan={pakaiPecahan ? 'Diabaikan karena hitung pecahan diisi.' : 'Atau isi hitung per pecahan di bawah.'} />
      </div>
      <details className="pecahan" open={pakaiPecahan || undefined}>
        <summary>Hitung per pecahan</summary>
        <div className="pecahan-kisi">
          {PECAHAN.map((p) => (
            <label key={p} className="pecahan-baris">
              <span>{rupiah(p)}</span>
              <input
                name={`pecahan_${p}`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                defaultValue={awal[p] ? String(awal[p]) : ''}
                aria-label={`Jumlah lembar atau keping ${rupiah(p)}`}
                onChange={(e) => {
                  const n = Number(e.target.value.replace(/\D/g, '')) || 0
                  setLembar((l) => ({ ...l, [p]: n }))
                }}
              />
            </label>
          ))}
        </div>
        <p className="pecahan-total" role="status">
          Total pecahan <b>{rupiah(total)}</b>
        </p>
      </details>
      <div className="kisi-form jarak-atas">
        <KolomTeks nama="catatan" label="Catatan untuk Owner (boleh kosong)" hasil={hasil} maxLength={200} bantuan="Tulis alasan bila kamu tahu ada uang yang kurang atau lebih." />
      </div>
      <div className="tombol-baris">
        <TombolKirim konfirmasi="Tutup shift sekarang? Sesudah ditutup tidak ada penjualan lagi di shift ini.">Tutup shift</TombolKirim>
      </div>
    </form>
  )
}

export function FormSetujui({ aksi }: { aksi: Aksi }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <KolomTeks nama="catatan" label="Catatan persetujuan" hasil={hasil} wajib maxLength={200} bantuan="Contoh: selisih sudah dibicarakan dan dipotong dari gaji." />
      <div className="tombol-baris">
        <TombolKirim>Setujui selisih</TombolKirim>
      </div>
    </form>
  )
}
