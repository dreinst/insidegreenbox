import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanMaster } from '@/components/master'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarMember, formatWa, potonganMember, type SaringMember } from '@/lib/member'

export const metadata: Metadata = { title: 'Member' }

export default async function DaftarMember({ searchParams }: { searchParams: Promise<SaringMember & { pesan?: string }> }) {
  const p = await wajibIzin('menu.member', 'L')
  const s = await searchParams
  const [hasil, tingkat] = await Promise.all([daftarMember(db, s), db.memberTier.findMany({ orderBy: { minVisits: 'asc' } })])
  const disaring = !!(s.q || s.tingkat || s.status)
  const bolehUbah = punyaIzin(p.izin, 'menu.member', 'U')
  return (
    <>
      <KepalaHalaman judul="Member" keterangan="Pelanggan Greenbox Key. Tingkatnya mengikuti jumlah kunjungan. Member tidak dihapus, cukup dinonaktifkan.">
        {punyaIzin(p.izin, 'menu.member', 'T') ? (
          <Link href="/member/baru" className="btn">
            Tambah member
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanMaster kode={s.pesan} />

      <form className="saring" method="get" role="search" aria-label="Saring member">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Nama atau nomor WA" maxLength={64} />
        </div>
        <div className="kolom">
          <label htmlFor="s-tingkat">Tingkat</label>
          <select id="s-tingkat" name="tingkat" defaultValue={s.tingkat ?? ''}>
            <option value="">Semua tingkat</option>
            {tingkat.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            <option value="aktif">Aktif</option>
            <option value="nonaktif">Nonaktif</option>
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/member">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">WhatsApp</th>
                <th scope="col">Tingkat</th>
                <th scope="col" className="angka">
                  Kunjungan
                </th>
                <th scope="col" className="angka">
                  Potongan
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((m) => (
                <tr key={m.id}>
                  <td data-label="Nama">
                    <Link href={`/member/${m.id}`} className="tebal">
                      {m.name}
                    </Link>
                  </td>
                  <td data-label="WhatsApp" className="nowrap">
                    {formatWa(m.wa)}
                  </td>
                  <td data-label="Tingkat">{m.tier?.name ?? '-'}</td>
                  <td data-label="Kunjungan" className="angka">
                    {m.visits}
                  </td>
                  <td data-label="Potongan" className="angka">
                    {potonganMember(m) ? `${String(potonganMember(m)).replace('.', ',')}%` : m.discountOn ? '-' : 'Dimatikan'}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={m.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/member/${m.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada member yang cocok dengan saringan.' : 'Belum ada member.'}</p>
      )}
      <Halaman {...hasil} dasar="/member" query={s} />
    </>
  )
}
