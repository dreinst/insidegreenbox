'use client'
// Formulir bersama untuk modul master tahap 3A. Isinya digerakkan daftar medan (bisa dikirim dari halaman server),
// jadi tiap modul tidak perlu menulis ulang formulir. Isian tetap terjaga saat galat lewat nilaiAwal (KONTRAK 6).
import { useActionState, useState } from 'react'
import { InputBerkas, MB } from '@/components/berkas'
import { galatKolom, nilaiAwal, PesanHasil, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'
import { idMedan } from '@/lib/medan'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>
type Pilihan = { nilai: string; label: string }

// id (opsional) menggantikan nama sebagai dasar id elemen, untuk halaman yang memuat dua formulir dengan nama medan
// sama (misalnya "memo" di kepala dan di baris jurnal). Nama tetap dipakai untuk isian yang dikirim dan untuk galat.
export type Medan = { id?: string } & (
  | { jenis: 'teks' | 'angka' | 'tanggal'; nama: string; label: string; awal?: string; wajib?: boolean; bantuan?: string; maxLength?: number; inputMode?: 'numeric' | 'decimal' | 'tel'; placeholder?: string; lebar?: boolean }
  | { jenis: 'area'; nama: string; label: string; awal?: string; bantuan?: string; maxLength?: number; lebar?: boolean }
  | { jenis: 'pilih'; nama: string; label: string; awal?: string; pilihan: Pilihan[]; wajib?: boolean; bantuan?: string; lebar?: boolean }
  | { jenis: 'centang'; nama: string; label: string; awal?: boolean; bantuan?: string; lebar?: boolean }
  | { jenis: 'foto'; nama: string; label: string; awal?: string; foto: string[]; urlAwal?: string | null; bantuan?: string; lebar?: boolean }
)

function Galat({ hasil, nama, id }: { hasil: HasilAksi; nama: string; id: string }) {
  const g = galatKolom(hasil, nama)
  return g ? (
    <small id={`${id}-g`} className="galat-kolom">
      {g}
    </small>
  ) : null
}

function Bantuan({ hasil, nama, id, bantuan }: { hasil: HasilAksi; nama: string; id: string; bantuan?: string }) {
  return !galatKolom(hasil, nama) && bantuan ? <small id={`${id}-b`}>{bantuan}</small> : null
}

const deskripsi = (hasil: HasilAksi, nama: string, id: string, bantuan?: string) => (galatKolom(hasil, nama) ? `${id}-g` : bantuan ? `${id}-b` : undefined)

// Satu medan formulir. Dipakai FormMaster dan formulir khusus yang mengatur medannya sendiri.
export function IsiMedan({ m, hasil }: { m: Medan; hasil: HasilAksi }) {
  const id = idMedan(m)
  const salah = !!galatKolom(hasil, m.nama)
  const kelas = `kolom${salah ? ' salah' : ''}${m.lebar ? ' lebar' : ''}`
  if (m.jenis === 'centang') {
    const nyala = !hasil.ok && hasil.isian ? hasil.isian[m.nama] === 'on' : (m.awal ?? false)
    return (
      <div className={`${kelas} centang`}>
        <label className="centang-baris" htmlFor={id}>
          <input id={id} name={m.nama} type="checkbox" defaultChecked={nyala} aria-describedby={deskripsi(hasil, m.nama, id, m.bantuan)} />
          <span>{m.label}</span>
        </label>
        <Galat hasil={hasil} nama={m.nama} id={id} />
        <Bantuan hasil={hasil} nama={m.nama} id={id} bantuan={m.bantuan} />
      </div>
    )
  }
  if (m.jenis === 'pilih') {
    return (
      <div className={kelas}>
        <label htmlFor={id}>{m.label}</label>
        <select id={id} name={m.nama} defaultValue={nilaiAwal(hasil, m.nama, m.awal)} required={m.wajib} aria-invalid={salah || undefined} aria-describedby={deskripsi(hasil, m.nama, id, m.bantuan)}>
          {m.pilihan.map((p) => (
            <option key={p.nilai} value={p.nilai}>
              {p.label}
            </option>
          ))}
        </select>
        <Galat hasil={hasil} nama={m.nama} id={id} />
        <Bantuan hasil={hasil} nama={m.nama} id={id} bantuan={m.bantuan} />
      </div>
    )
  }
  if (m.jenis === 'area') {
    return (
      <div className={kelas}>
        <label htmlFor={id}>{m.label}</label>
        <textarea id={id} name={m.nama} rows={3} defaultValue={nilaiAwal(hasil, m.nama, m.awal)} maxLength={m.maxLength} aria-invalid={salah || undefined} aria-describedby={deskripsi(hasil, m.nama, id, m.bantuan)} />
        <Galat hasil={hasil} nama={m.nama} id={id} />
        <Bantuan hasil={hasil} nama={m.nama} id={id} bantuan={m.bantuan} />
      </div>
    )
  }
  if (m.jenis === 'foto') {
    const pilih = nilaiAwal(hasil, m.nama, m.awal ?? '')
    const unggahan = m.awal?.startsWith('unggahan/') ? m.awal : null
    const galatBerkas = galatKolom(hasil, 'fotoUnggah')
    return (
      <div className={`${kelas} foto-medan`}>
        <label htmlFor={id}>{m.label}</label>
        <div className="foto-isi">
          {m.urlAwal ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={m.urlAwal} alt="Foto saat ini" className="foto-kecil" width={72} height={72} />
          ) : (
            <span className="foto-kecil kosong-foto" aria-hidden="true">
              Tanpa foto
            </span>
          )}
          <div className="foto-kontrol">
            <select id={id} name={m.nama} defaultValue={pilih} aria-invalid={salah || undefined} aria-describedby={deskripsi(hasil, m.nama, id, m.bantuan)}>
              <option value="">Tanpa foto</option>
              {unggahan ? <option value={unggahan}>Foto unggahan saat ini</option> : null}
              {m.foto.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-unggah`} className="sr">
              Unggah foto baru
            </label>
            <InputBerkas id={`${id}-unggah`} name="fotoUnggah" maks={2 * MB} accept="image/webp,image/png,image/jpeg" aria-invalid={galatBerkas ? true : undefined} aria-describedby={galatBerkas ? 'k-fotoUnggah-g' : undefined} />
          </div>
        </div>
        {galatBerkas ? (
          <small id="k-fotoUnggah-g" className="galat-kolom">
            {galatBerkas}
          </small>
        ) : null}
        <Galat hasil={hasil} nama={m.nama} id={id} />
        <Bantuan hasil={hasil} nama={m.nama} id={id} bantuan={m.bantuan ?? 'Pilih foto situs atau unggah WebP, PNG, atau JPG (maksimal 2 MB). Berkas unggahan menggantikan pilihan.'} />
      </div>
    )
  }
  return (
    <div className={kelas}>
      <label htmlFor={id}>{m.label}</label>
      <input
        id={id}
        name={m.nama}
        type={m.jenis === 'tanggal' ? 'date' : 'text'}
        inputMode={m.inputMode ?? (m.jenis === 'angka' ? 'numeric' : undefined)}
        defaultValue={nilaiAwal(hasil, m.nama, m.awal)}
        required={m.wajib}
        maxLength={m.maxLength}
        placeholder={m.placeholder}
        autoComplete="off"
        aria-invalid={salah || undefined}
        aria-describedby={deskripsi(hasil, m.nama, id, m.bantuan)}
      />
      <Galat hasil={hasil} nama={m.nama} id={id} />
      <Bantuan hasil={hasil} nama={m.nama} id={id} bantuan={m.bantuan} />
    </div>
  )
}

export function FormMaster({ aksi, medan, tombol, kelasTombol }: { aksi: Aksi; medan: Medan[]; tombol: string; kelasTombol?: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        {medan.map((m) => (
          <IsiMedan key={m.nama} m={m} hasil={hasil} />
        ))}
      </div>
      <div className="tombol-baris">
        <TombolKirim kelas={kelasTombol}>{tombol}</TombolKirim>
      </div>
    </form>
  )
}

// Tombol aktifkan atau nonaktifkan, dengan konfirmasi untuk nonaktif.
export function FormStatusMaster({ aksi, aktif, label, konfirmasi }: { aksi: Aksi; aktif: boolean; label: string; konfirmasi?: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} className="form">
      <PesanHasil hasil={hasil} />
      <TombolKirim kelas={`btn ${aktif ? 'bahaya' : ''}`} konfirmasi={konfirmasi}>
        {label}
      </TombolKirim>
    </form>
  )
}

// Formulir promo: medan nilai tergantung jenis yang dipilih, jadi jenis dipegang di state.
export function FormPromo({ aksi, awal, hadiah, tombol }: { aksi: Aksi; awal: Record<string, string>; hadiah: Pilihan[]; tombol: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return <IsiFormPromo key={hasil.n} aksi={kirim} hasil={hasil} awal={awal} hadiah={hadiah} tombol={tombol} />
}

function IsiFormPromo({ aksi, hasil, awal, hadiah, tombol }: { aksi: (fd: FormData) => void; hasil: HasilAksi; awal: Record<string, string>; hadiah: Pilihan[]; tombol: string }) {
  const [jenis, setJenis] = useState(nilaiAwal(hasil, 'kind', awal.kind ?? 'persen'))
  const a = (k: string) => nilaiAwal(hasil, k, awal[k] ?? '')
  return (
    <form action={aksi} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        <IsiMedan hasil={hasil} m={{ jenis: 'teks', nama: 'name', label: 'Nama promo', awal: awal.name, wajib: true, maxLength: 80, lebar: true }} />
        <div className={`kolom${galatKolom(hasil, 'kind') ? ' salah' : ''}`}>
          <label htmlFor="k-kind">Jenis promo</label>
          <select id="k-kind" name="kind" value={jenis} onChange={(e) => setJenis(e.target.value)}>
            <option value="persen">Diskon persen</option>
            <option value="nominal">Diskon nominal</option>
            <option value="hadiah">Hadiah menu</option>
          </select>
          {galatKolom(hasil, 'kind') ? <small className="galat-kolom">{galatKolom(hasil, 'kind')}</small> : null}
        </div>
        {jenis === 'persen' ? <IsiMedan hasil={hasil} m={{ jenis: 'teks', nama: 'percent', label: 'Persen diskon', awal: a('percent'), wajib: true, inputMode: 'decimal', placeholder: '10', bantuan: 'Contoh 10 atau 7,5.' }} /> : null}
        {jenis === 'nominal' ? <IsiMedan hasil={hasil} m={{ jenis: 'angka', nama: 'amount', label: 'Potongan (Rp)', awal: a('amount'), wajib: true, placeholder: '5000', bantuan: 'Rupiah bulat, misalnya 5000 atau 5.000.' }} /> : null}
        {jenis === 'hadiah' ? <IsiMedan hasil={hasil} m={{ jenis: 'pilih', nama: 'giftItemId', label: 'Menu hadiah', awal: a('giftItemId'), pilihan: hadiah, wajib: true }} /> : null}
        <IsiMedan hasil={hasil} m={{ jenis: 'angka', nama: 'minSpend', label: 'Belanja minimal (Rp)', awal: a('minSpend'), placeholder: '0', bantuan: 'Kosongkan bila tanpa minimal.' }} />
        <IsiMedan hasil={hasil} m={{ jenis: 'tanggal', nama: 'startsOn', label: 'Mulai berlaku', awal: a('startsOn'), bantuan: 'Kosong berarti langsung berlaku.' }} />
        <IsiMedan hasil={hasil} m={{ jenis: 'tanggal', nama: 'endsOn', label: 'Berakhir', awal: a('endsOn'), bantuan: 'Kosong berarti tanpa batas akhir. Tanggal ini masih berlaku.' }} />
        <IsiMedan hasil={hasil} m={{ jenis: 'area', nama: 'condition', label: 'Syarat atau keterangan', awal: a('condition'), maxLength: 200, lebar: true }} />
      </div>
      <div className="tombol-baris">
        <TombolKirim>{tombol}</TombolKirim>
      </div>
    </form>
  )
}
