import type { Metadata } from 'next'
import Link from 'next/link'
import { PesanMaster } from '@/components/master'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { formatRupiah } from '@/lib/master'
import { riwayatHarga } from '@/lib/menu'
import { formatWaktu } from '@/lib/waktu'

export const metadata: Metadata = { title: 'Riwayat harga' }

export default async function RiwayatHarga({ searchParams }: { searchParams: Promise<{ hal?: string; pesan?: string }> }) {
  await wajibIzin('menu.menu', 'L')
  const s = await searchParams
  const hasil = await riwayatHarga(db, s.hal)
  return (
    <>
      <KepalaHalaman judul="Riwayat harga" keterangan="Setiap perubahan harga, satuan maupun massal, beserta harga lama dan barunya." />
      <PesanMaster kode={s.pesan} />
      {hasil.baris.length ? (
        hasil.baris.map((b) => (
          <section key={b.id} className="kartu" aria-label={`Perubahan harga ${b.label}`}>
            <div className="kartu-kepala">
              <h2>{b.label}</h2>
              <span className="redup kecil">
                {formatWaktu(b.createdAt)} · {b.rows.length} menu
              </span>
            </div>
            {b.rule ? <p className="redup kecil">Aturan: {b.rule}</p> : null}
            <table className="tabel">
              <thead>
                <tr>
                  <th scope="col">Menu</th>
                  <th scope="col" className="angka">
                    Harga lama
                  </th>
                  <th scope="col" className="angka">
                    Harga baru
                  </th>
                </tr>
              </thead>
              <tbody>
                {b.rows.map((r) => (
                  <tr key={r.id}>
                    <td data-label="Menu">
                      <Link href={`/menu/${r.menuItemId}`}>{r.menuItem.name}</Link>
                    </td>
                    <td data-label="Harga lama" className="angka">
                      {formatRupiah(r.oldPrice)}
                    </td>
                    <td data-label="Harga baru" className={`angka ${r.newPrice > r.oldPrice ? 'naik' : 'turun'}`}>
                      {formatRupiah(r.newPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))
      ) : (
        <p className="kosong">Belum ada perubahan harga.</p>
      )}
      <Halaman {...hasil} dasar="/menu/riwayat" query={s} />
    </>
  )
}
