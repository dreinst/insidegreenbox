import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanMaster } from '@/components/master'
import { Halaman, KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarRekening, type SaringRekening } from '@/lib/rekening'

export const metadata: Metadata = { title: 'Rekening Bank' }

export default async function DaftarRekening({ searchParams }: { searchParams: Promise<SaringRekening & { pesan?: string }> }) {
  const p = await wajibIzin('kas.rekening', 'L')
  const s = await searchParams
  const hasil = await daftarRekening(db, s)
  const disaring = !!(s.q || s.status)
  const bolehUbah = punyaIzin(p.izin, 'kas.rekening', 'U')
  return (
    <>
      <KepalaHalaman judul="Rekening Bank" keterangan="Rekening tujuan setoran POS. Rekening tidak dihapus, cukup dinonaktifkan. Akun buku besarnya menyusul bersama modul akuntansi.">
        {punyaIzin(p.izin, 'kas.rekening', 'T') ? (
          <Link href="/rekening/baru" className="btn">
            Tambah rekening
          </Link>
        ) : null}
      </KepalaHalaman>
      <PesanMaster kode={s.pesan} />

      <form className="saring" method="get" role="search" aria-label="Saring rekening">
        <div className="kolom">
          <label htmlFor="s-q">Cari</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Bank, nomor, atau nama" maxLength={40} />
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
          {disaring ? <Link href="/rekening">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Bank</th>
                <th scope="col">Nomor rekening</th>
                <th scope="col">Atas nama</th>
                <th scope="col" className="angka">
                  Setoran
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((r) => (
                <tr key={r.id}>
                  <td data-label="Bank">
                    <Link href={`/rekening/${r.id}`} className="tebal">
                      {r.bankName}
                    </Link>
                  </td>
                  <td data-label="Nomor rekening" className="nowrap">
                    {r.accountNo}
                  </td>
                  <td data-label="Atas nama" className="pecah">
                    {r.holderName}
                  </td>
                  <td data-label="Setoran" className="angka">
                    {r._count.posSettlements}
                  </td>
                  <td data-label="Status">
                    <Lencana aktif={r.active} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/rekening/${r.id}`}>{bolehUbah ? 'Ubah' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada rekening yang cocok dengan saringan.' : 'Belum ada rekening bank.'}</p>
      )}
      <Halaman {...hasil} dasar="/rekening" query={s} />
    </>
  )
}
