// Komponen server halaman laporan: tabel dari spesifikasi kolom (sama dengan CSV), saringan, dan tautan unduh CSV.
// Di layar lebar tabel digulir di dalam kartunya; di HP setiap baris menjadi kartu berlabel (globals.css).
import Link from 'next/link'
import type { JenisNilai, Tabel } from '@/lib/laporan-kolom'
import type { SaringLaporan } from '@/lib/laporan'
import { formatWaktu } from '@/lib/waktu'
import '@/app/(admin)/laporan/laporan.css'

const ribuan = (n: number) => Math.abs(n).toLocaleString('id-ID')

export function nilaiTampil(v: string | number | null, jenis: JenisNilai = 'teks') {
  if (v === null || v === '') return '-'
  if (typeof v === 'string') return v
  if (jenis === 'uang') return `${v < 0 ? '-' : ''}Rp ${ribuan(v)}`
  if (jenis === 'selisih') return v === 0 ? 'Rp 0' : `${v < 0 ? '-' : '+'}Rp ${ribuan(v)}`
  if (jenis === 'persen') return `${v.toLocaleString('id-ID')}%`
  return v.toLocaleString('id-ID')
}

const kanan = (j?: JenisNilai) => j && j !== 'teks'

export function TabelLaporan<T>({ tabel, judul, kunci, kosong }: { tabel: Tabel<T>; judul: string; kunci: (b: T, i: number) => string; kosong: string }) {
  if (!tabel.baris.length) return <p className="kosong">{kosong}</p>
  return (
    <>
    {tabel.kolom.length > 9 ? <p className="lap-petunjuk">Tabel ini lebar. Geser ke samping di dalam tabel untuk melihat semua kolom.</p> : null}
    <div className="kartu tanpa-isi lap-gulir" role="region" aria-label={judul} tabIndex={0}>
      <table className="tabel lap-tabel">
        <caption className="sr">{judul}</caption>
        <thead>
          <tr>
            {tabel.kolom.map((k) => (
              <th key={k.h} scope="col" className={kanan(k.jenis) ? 'angka' : undefined}>
                {k.h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tabel.baris.map((b, i) => (
            <tr key={kunci(b, i)}>
              {tabel.kolom.map((k, j) => {
                const v = k.v(b)
                const href = k.href?.(b)
                const isi = nilaiTampil(v, k.jenis)
                const merah = k.jenis === 'selisih' && typeof v === 'number' && v !== 0
                return (
                  <td key={k.h} data-label={k.h} className={[kanan(k.jenis) ? 'angka' : '', merah ? 'lap-merah' : '', j === 0 ? 'tebal' : ''].filter(Boolean).join(' ') || undefined}>
                    {href ? <Link href={href}>{isi}</Link> : isi}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        {tabel.jumlah ? (
          <tfoot>
            <tr>
              {tabel.kolom.map((k) => (
                <td key={k.h} data-label={k.h} className={kanan(k.jenis) ? 'angka' : undefined}>
                  {k.v(tabel.jumlah!) === '' ? '' : nilaiTampil(k.v(tabel.jumlah!), k.jenis)}
                </td>
              ))}
            </tr>
          </tfoot>
        ) : null}
      </table>
    </div>
    </>
  )
}

export function RingkasLaporan({ isi }: { isi: { label: string; nilai: string; catatan?: string }[] }) {
  return (
    <dl className="lap-ringkas">
      {isi.map((x) => (
        <div key={x.label}>
          <dt>{x.label}</dt>
          <dd>{x.nilai}</dd>
          {x.catatan ? <small className="redup">{x.catatan}</small> : null}
        </div>
      ))}
    </dl>
  )
}

type Pilihan = { nilai: string; label: string }
export type OpsiSaring = {
  rentang?: boolean
  tanggal?: boolean
  kasir?: Pilihan[]
  shift?: Pilihan[]
  mode?: Pilihan[]
  metode?: Pilihan[]
  kategori?: Pilihan[]
  kelompok?: Pilihan[]
  setoran?: boolean
  q?: string
}

const KUNCI: (keyof SaringLaporan)[] = ['dari', 'sampai', 'tanggal', 'kasir', 'shift', 'mode', 'metode', 'kategori', 'kelompok', 'setoran', 'q']

// Alamat unduh CSV memakai saringan yang sedang berlaku.
export function alamatCsv(jenis: string, s: SaringLaporan) {
  const q = new URLSearchParams({ jenis })
  for (const k of KUNCI) if (s[k]) q.set(k, String(s[k]))
  return `/laporan/unduh?${q.toString()}`
}

function PilihSaring({ id, nama, label, semua, pilihan, nilai }: { id: string; nama: string; label: string; semua?: string; pilihan: Pilihan[]; nilai?: string }) {
  return (
    <div className="kolom">
      <label htmlFor={id}>{label}</label>
      <select id={id} name={nama} defaultValue={nilai ?? ''}>
        {semua ? <option value="">{semua}</option> : null}
        {pilihan.map((p) => (
          <option key={p.nilai} value={p.nilai}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  )
}

// Saringan GET. Nilai tanggal yang ditampilkan adalah rentang yang benar-benar dipakai laporan.
export function SaringanLaporan({ dasar, jenis, s, opsi, berlaku }: { dasar: string; jenis: string; s: SaringLaporan; opsi: OpsiSaring; berlaku: { dari?: string; sampai?: string; tanggal?: string } }) {
  const disaring = KUNCI.some((k) => s[k])
  return (
    <form className="saring lap-saring" method="get" role="search" aria-label="Saring laporan">
      {opsi.rentang ? (
        <>
          <div className="kolom">
            <label htmlFor="s-dari">Dari tanggal</label>
            <input id="s-dari" name="dari" type="date" defaultValue={berlaku.dari} />
          </div>
          <div className="kolom">
            <label htmlFor="s-sampai">Sampai tanggal</label>
            <input id="s-sampai" name="sampai" type="date" defaultValue={berlaku.sampai} />
          </div>
        </>
      ) : null}
      {opsi.tanggal ? (
        <div className="kolom">
          <label htmlFor="s-tanggal">Tanggal</label>
          <input id="s-tanggal" name="tanggal" type="date" defaultValue={berlaku.tanggal} />
        </div>
      ) : null}
      {opsi.kelompok ? <PilihSaring id="s-kelompok" nama="kelompok" label="Kelompokkan" pilihan={opsi.kelompok} nilai={s.kelompok} /> : null}
      {opsi.kasir ? <PilihSaring id="s-kasir" nama="kasir" label="Kasir" semua="Semua kasir" pilihan={opsi.kasir} nilai={s.kasir} /> : null}
      {opsi.shift ? <PilihSaring id="s-shift" nama="shift" label="Shift" semua="Semua shift" pilihan={opsi.shift} nilai={s.shift} /> : null}
      {opsi.mode ? <PilihSaring id="s-mode" nama="mode" label="Mode" semua="Semua mode" pilihan={opsi.mode} nilai={s.mode} /> : null}
      {opsi.metode ? <PilihSaring id="s-metode" nama="metode" label="Metode bayar" semua="Semua metode" pilihan={opsi.metode} nilai={s.metode} /> : null}
      {opsi.kategori ? <PilihSaring id="s-kategori" nama="kategori" label="Kategori" semua="Semua kategori" pilihan={opsi.kategori} nilai={s.kategori} /> : null}
      {opsi.setoran ? (
        <PilihSaring
          id="s-setoran"
          nama="setoran"
          label="Status setoran"
          semua="Semua"
          pilihan={[
            { nilai: 'sudah', label: 'Sudah disetor' },
            { nilai: 'belum', label: 'Belum disetor' },
          ]}
          nilai={s.setoran}
        />
      ) : null}
      {opsi.q !== undefined ? (
        <div className="kolom">
          <label htmlFor="s-q">Cari menu</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder={opsi.q} maxLength={60} />
        </div>
      ) : null}
      <div className="saring-tombol">
        <button type="submit" className="btn sekunder">
          Tampilkan
        </button>
        {disaring ? <Link href={dasar}>Hapus saringan</Link> : null}
        <a href={alamatCsv(jenis, s)} className="lap-unduh" download>
          Unduh CSV
        </a>
      </div>
    </form>
  )
}

export const pilihanShift = (shift: { id: number; openedAt: Date; user: { name: string } }[]) => shift.map((x) => ({ nilai: String(x.id), label: `#${x.id} ${x.user.name}, ${formatWaktu(x.openedAt)}` }))
