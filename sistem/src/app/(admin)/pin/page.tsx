import type { Metadata } from 'next'
import Link from 'next/link'
import { KepalaHalaman, Lencana } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarPinBisaDiatur } from '@/lib/pin'
import '@/components/kasir.css'

export const metadata: Metadata = { title: 'PIN Kasir' }

export default async function DaftarPin() {
  const p = await wajibIzin('kasir.pin', 'L')
  const baris = await daftarPinBisaDiatur(db, p)
  const bolehUbah = punyaIzin(p.izin, 'kasir.pin', 'U')
  return (
    <>
      <KepalaHalaman
        judul="PIN Kasir"
        keterangan="Kasir masuk ke layar kasir dengan nama dan PIN. PIN Admin dan Owner hanya dipakai untuk menyetujui void, karena keduanya tetap masuk dengan sandi."
      />
      {baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nama</th>
                <th scope="col">Peran</th>
                <th scope="col">PIN</th>
                <th scope="col">Pemakaian</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {baris.map((u) => (
                <tr key={u.id}>
                  <td data-label="Nama">
                    <span>
                      <Link href={`/pin/${u.id}`} className="tebal">
                        {u.name}
                      </Link>
                      {u.id === p.id ? <small className="redup"> (kamu)</small> : null}
                      <br />
                      <small className="redup">{u.username}</small>
                    </span>
                  </td>
                  <td data-label="Peran">{u.peran}</td>
                  <td data-label="PIN">
                    <Lencana aktif={u.adaPin} teksAktif="Terpasang" teksMati="Belum ada" />
                  </td>
                  <td data-label="Pemakaian">{u.masukPin ? 'Masuk ke layar kasir' : 'Menyetujui void'}</td>
                  <td className="sel-aksi">
                    <Link href={`/pin/${u.id}`}>{bolehUbah ? 'Atur PIN' : 'Lihat'}</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">Belum ada pengguna aktif yang PIN-nya bisa kamu atur.</p>
      )}
    </>
  )
}
