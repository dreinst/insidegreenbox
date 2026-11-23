import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanAset } from '@/components/aset'
import { LencanaStatus } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { daftarAnggaran, type SaringAnggaran } from '@/lib/anggaran/anggaran'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { formatRupiah } from '@/lib/master'

export const metadata: Metadata = { title: 'Anggaran' }

export default async function DaftarAnggaran({ searchParams }: { searchParams: Promise<SaringAnggaran & { pesan?: string }> }) {
  const p = await wajibIzin('anggaran.anggaran', 'L')
  const s = await searchParams
  const h = await daftarAnggaran(db, s)
  const disaring = !!(s.tahun || s.status)
  return (
    <>
      <KepalaHalaman judul="Anggaran" keterangan="Anggaran tahunan per akun pendapatan, HPP, dan beban, dirinci per bulan. Anggaran yang sudah disetujui direvisi dengan menyalinnya menjadi versi baru.">
        {punyaIzin(p.izin, 'anggaran.anggaran', 'T') ? (
          <Link href="/anggaran/baru" className="btn">
            Buat anggaran
          </Link>
        ) : null}
        <Link href="/realisasi-anggaran" className="btn sekunder">
          Realisasi
        </Link>
      </KepalaHalaman>
      <PesanAset kode={s.pesan} />
      <form className="saring" method="get" role="search" aria-label="Saring anggaran">
        <div className="kolom">
          <label htmlFor="s-tahun">Tahun</label>
          <input id="s-tahun" name="tahun" inputMode="numeric" defaultValue={s.tahun ?? ''} placeholder="2027" maxLength={4} />
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            {['Draft', 'Disetujui', 'Batal'].map((x) => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/anggaran">Hapus saringan</Link> : null}
        </div>
      </form>
      {h.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel as-tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Nama</th>
                <th scope="col">Tahun</th>
                <th scope="col">Versi</th>
                <th scope="col" className="angka">
                  Jumlah setahun
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {h.baris.map((b) => (
                <tr key={b.id}>
                  <td data-label="Nomor">
                    <Link href={`/anggaran/${b.id}`} className="tebal">
                      {b.no}
                    </Link>
                  </td>
                  <td data-label="Nama">{b.name}</td>
                  <td data-label="Tahun">{b.year}</td>
                  <td data-label="Versi">{b.version}</td>
                  <td data-label="Jumlah setahun" className="angka">
                    {formatRupiah(b.jumlah)}
                  </td>
                  <td data-label="Status">
                    <LencanaStatus status={b.status} /> {b.status === 'Disetujui' ? <span className={`lencana ${b.replacedAt ? 'abu' : 'biru'}`}>{b.replacedAt ? 'Digantikan' : 'Berlaku'}</span> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada anggaran yang cocok.' : 'Belum ada anggaran.'}</p>
      )}
      <Halaman {...h} dasar="/anggaran" query={s} />
    </>
  )
}
