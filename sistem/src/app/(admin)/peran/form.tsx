'use client'
import { useActionState } from 'react'
import { Kolom, PesanHasil, Pilih, TombolKirim } from '@/components/form'
import { HASIL_AWAL, type HasilAksi } from '@/lib/aksi'
import { AKSI, NAMA_AKSI } from '@/lib/katalog'

type Aksi = (sebelum: HasilAksi, fd: FormData) => Promise<HasilAksi>

export function FormPeranBaru({ aksi, sumber }: { aksi: Aksi; sumber: { nilai: string; label: string }[] }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        <Kolom nama="name" label="Nama peran" hasil={hasil} wajib maxLength={60} autoComplete="off" />
        <Kolom nama="code" label="Kode peran" hasil={hasil} wajib maxLength={32} autoComplete="off" bantuan="Huruf kecil tanpa spasi, misalnya spv. Kode tidak bisa diganti sesudah disimpan." />
        <Pilih nama="salinDari" label="Salin izin dan saklar dari" hasil={hasil} pilihan={[{ nilai: '', label: 'Mulai tanpa izin' }, ...sumber]} />
      </div>
      <div className="tombol-baris">
        <TombolKirim>Simpan peran</TombolKirim>
      </div>
    </form>
  )
}

export function FormNamaPeran({ aksi, nama }: { aksi: Aksi; nama: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      <div className="kisi-form">
        <Kolom nama="name" label="Nama peran" hasil={hasil} awal={nama} wajib maxLength={60} autoComplete="off" />
      </div>
      <div className="tombol-baris">
        <TombolKirim kelas="btn sekunder">Simpan nama</TombolKirim>
      </div>
    </form>
  )
}

export function FormStatusPeran({ aksi, aktif, label }: { aksi: Aksi; aktif: boolean; label: string }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  return (
    <form action={kirim} className="form">
      <PesanHasil hasil={hasil} />
      <TombolKirim kelas={`btn ${aktif ? 'bahaya' : ''}`} konfirmasi={aktif ? 'Nonaktifkan peran ini? Pengguna berperan ini tidak bisa masuk selama perannya nonaktif.' : undefined}>
        {label}
      </TombolKirim>
    </form>
  )
}

type GrupMatriks = { grup: string; menu: { kode: string; nama: string; aksi: string; punya: string; kunci: boolean }[] }[]

export function FormMatriks({ aksi, grup, bisaUbah }: { aksi: Aksi; grup: GrupMatriks; bisaUbah: boolean }) {
  const [hasil, kirim] = useActionState(aksi, HASIL_AWAL)
  const dicentang = (kode: string, a: string, punya: string) => (!hasil.ok && hasil.isian ? `izin:${kode}:${a}` in hasil.isian : punya.includes(a))
  return (
    <form action={kirim} key={hasil.n} className="form" noValidate>
      <PesanHasil hasil={hasil} />
      {grup.map((g) => (
        <fieldset key={g.grup} className="matriks">
          <legend>{g.grup}</legend>
          <div className="matriks-kepala" aria-hidden="true">
            <span>Menu</span>
            {AKSI.map((a) => (
              <span key={a}>{NAMA_AKSI[a]}</span>
            ))}
          </div>
          {g.menu.map((m) => (
            <div key={m.kode} className="matriks-baris">
              <span className="matriks-menu">{m.nama}</span>
              {AKSI.map((a) =>
                m.aksi.includes(a) ? (
                  <label key={a} className="cek">
                    <input
                      type="checkbox"
                      name={`izin:${m.kode}:${a}`}
                      value="1"
                      defaultChecked={dicentang(m.kode, a, m.punya)}
                      disabled={!bisaUbah || m.kunci}
                      aria-label={`${NAMA_AKSI[a]} ${m.nama}`}
                    />
                    <span className="cek-teks">{NAMA_AKSI[a]}</span>
                    {m.kunci ? <input type="hidden" name={`izin:${m.kode}:${a}`} value="1" /> : null}
                  </label>
                ) : (
                  <span key={a} className="cek kosong" aria-hidden="true" />
                ),
              )}
            </div>
          ))}
        </fieldset>
      ))}
      {bisaUbah ? (
        <div className="tombol-baris lengket">
          <TombolKirim>Simpan izin</TombolKirim>
        </div>
      ) : null}
    </form>
  )
}
