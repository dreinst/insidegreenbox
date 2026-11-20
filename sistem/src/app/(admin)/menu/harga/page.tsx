import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanMaster } from '@/components/master'
import { KepalaHalaman } from '@/components/umum'
import { GalatAturan } from '@/lib/aksi'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { formatRupiah } from '@/lib/master'
import { rencanaHarga, type BarisRencana } from '@/lib/menu'
import { ZodError } from 'zod'
import { hargaMassalAksi } from '../aksi'
import { FormHargaMassal } from './form'

export const metadata: Metadata = { title: 'Ubah harga massal' }

type Query = { kategori?: string; mode?: string; arah?: string; nilai?: string; bulat?: string }

export default async function UbahHarga({ searchParams }: { searchParams: Promise<Query> }) {
  await wajibIzin('menu.menu', 'U')
  const s = await searchParams
  const kategori = await db.menuCategory.findMany({ orderBy: [{ sort: 'asc' }, { name: 'asc' }] })
  const dicoba = !!(s.nilai?.trim() || s.mode || s.arah)
  let rencana: { baris: BarisRencana[]; ringkas: string } | null = null
  let galat: { pesan: string; kolom?: string } | null = null
  if (dicoba) {
    try {
      rencana = await rencanaHarga(db, { kategori: s.kategori ?? '', mode: s.mode, arah: s.arah, nilai: s.nilai ?? '', bulat: s.bulat || '500' })
    } catch (e) {
      if (e instanceof GalatAturan) galat = { pesan: e.message, kolom: e.kolom }
      else if (e instanceof ZodError) galat = { pesan: e.issues[0]?.message ?? 'Isian belum lengkap.', kolom: String(e.issues[0]?.path[0] ?? '') }
      else throw e
    }
  }
  const berubah = rencana?.baris.filter((b) => b.baru !== b.lama) ?? []
  const kolomSalah = (k: string) => (galat?.kolom === k ? ' salah' : '')
  return (
    <>
      <KepalaHalaman judul="Ubah harga massal" keterangan="Naikkan atau turunkan harga banyak menu aktif sekaligus. Periksa pratinjau dulu, perubahan baru berlaku setelah kamu menerapkannya." />
      <PesanMaster />

      <form className="saring saring-harga" method="get" aria-label="Aturan perubahan harga">
        <div className={`kolom${kolomSalah('kategori')}`}>
          <label htmlFor="h-kategori">Kategori</label>
          <select id="h-kategori" name="kategori" defaultValue={s.kategori ?? ''}>
            <option value="">Semua kategori</option>
            {kategori.map((c) => (
              <option key={c.id} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className={`kolom${kolomSalah('arah')}`}>
          <label htmlFor="h-arah">Arah</label>
          <select id="h-arah" name="arah" defaultValue={s.arah ?? 'naik'}>
            <option value="naik">Naik</option>
            <option value="turun">Turun</option>
          </select>
        </div>
        <div className={`kolom${kolomSalah('mode')}`}>
          <label htmlFor="h-mode">Cara</label>
          <select id="h-mode" name="mode" defaultValue={s.mode ?? 'persen'}>
            <option value="persen">Persen (%)</option>
            <option value="nominal">Nominal (Rp)</option>
          </select>
        </div>
        <div className={`kolom${kolomSalah('nilai')}`}>
          <label htmlFor="h-nilai">Besarnya</label>
          <input id="h-nilai" name="nilai" type="text" inputMode="decimal" defaultValue={s.nilai ?? ''} placeholder="5" autoComplete="off" aria-invalid={galat?.kolom === 'nilai' ? true : undefined} aria-describedby={galat?.kolom === 'nilai' ? 'h-nilai-g' : undefined} />
          {galat?.kolom === 'nilai' ? (
            <small id="h-nilai-g" className="galat-kolom">
              {galat.pesan}
            </small>
          ) : null}
        </div>
        <div className={`kolom${kolomSalah('bulat')}`}>
          <label htmlFor="h-bulat">Pembulatan</label>
          <select id="h-bulat" name="bulat" defaultValue={s.bulat ?? '500'}>
            <option value="1">Tanpa pembulatan</option>
            <option value="100">Ke Rp 100</option>
            <option value="500">Ke Rp 500</option>
            <option value="1000">Ke Rp 1.000</option>
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Lihat pratinjau
          </button>
          {dicoba ? <Link href="/menu/harga">Mulai ulang</Link> : null}
        </div>
      </form>

      {galat && galat.kolom !== 'nilai' ? (
        <p className="pesan galat" role="alert">
          {galat.pesan}
        </p>
      ) : null}

      {rencana ? (
        <>
          <section className="kartu tanpa-isi" aria-labelledby="j-pratinjau">
            <div className="kartu-judul-dalam">
              <div className="kartu-kepala">
                <h2 id="j-pratinjau">Pratinjau: {rencana.ringkas}</h2>
                <span className="redup kecil">
                  {berubah.length} dari {rencana.baris.length} menu aktif berubah
                </span>
              </div>
            </div>
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Menu</th>
                  <th scope="col">Kategori</th>
                  <th scope="col" className="angka">
                    Harga sekarang
                  </th>
                  <th scope="col" className="angka">
                    Harga baru
                  </th>
                </tr>
              </thead>
              <tbody>
                {rencana.baris.map((b) => (
                  <tr key={b.id}>
                    <td data-label="Menu">{b.name}</td>
                    <td data-label="Kategori">{b.category}</td>
                    <td data-label="Harga sekarang" className="angka">
                      {formatRupiah(b.lama)}
                    </td>
                    <td data-label="Harga baru" className={`angka ${b.baru > b.lama ? 'naik' : b.baru < b.lama ? 'turun' : ''}`}>
                      {formatRupiah(b.baru)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {berubah.length ? (
            <section className="kartu" aria-labelledby="j-terapkan">
              <h2 id="j-terapkan">Terapkan perubahan</h2>
              <FormHargaMassal aksi={hargaMassalAksi} jumlah={berubah.length} aturan={{ kategori: s.kategori ?? '', mode: s.mode ?? '', arah: s.arah ?? '', nilai: s.nilai ?? '', bulat: s.bulat || '500' }} />
            </section>
          ) : (
            <p className="catatan">Dengan aturan ini tidak ada harga yang berubah. Ubah besarnya atau pembulatannya.</p>
          )}
        </>
      ) : null}
    </>
  )
}
