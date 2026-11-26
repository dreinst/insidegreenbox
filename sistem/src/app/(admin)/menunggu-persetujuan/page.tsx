import type { Metadata } from 'next'
import Link from 'next/link'
import { formatTanggal } from '@/components/stok'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzinSalahSatu } from '@/lib/izin'
import { formatRupiah } from '@/lib/master'
import { SYARAT_MENUNGGU, daftarMenunggu, lamaMenunggu, type SaringMenunggu } from '@/lib/menunggu'

export const metadata: Metadata = { title: 'Menunggu Persetujuan' }

// Antrean dokumen dari semua modul yang menunggu Setujui atau Posting (KONTRAK 11 butir 158). Persetujuan tetap
// dilakukan di rincian dokumennya, jadi halaman ini hanya membaca.
export default async function MenungguPersetujuan({ searchParams }: { searchParams: Promise<SaringMenunggu> }) {
  const p = await wajibIzinSalahSatu('menunggu_persetujuan', SYARAT_MENUNGGU, 'S')
  const s = await searchParams
  const h = await daftarMenunggu(db, p, s)
  const sekarang = new Date()
  return (
    <>
      <KepalaHalaman
        judul="Menunggu Persetujuan"
        keterangan="Dokumen dari semua modul yang sudah diajukan dan menunggu disetujui, pembayaran atau kas yang sudah disetujui tetapi belum diposting, dan shift lama yang perlu persetujuan. Buka nomornya untuk menyetujui di rincian dokumen."
      />
      <p className="ringkas-menunggu">
        <b>{h.bisa}</b> dokumen bisa kamu tindak lanjuti sekarang.
      </p>
      <form className="saring" method="get" role="search" aria-label="Saring dokumen menunggu persetujuan">
        <div className="kolom">
          <label htmlFor="s-jenis">Jenis dokumen</label>
          <select id="s-jenis" name="jenis" defaultValue={h.jenis ?? ''}>
            <option value="">Semua jenis ({h.pilihan.reduce((a, x) => a + x.jumlah, 0)})</option>
            {h.pilihan.map((x) => (
              <option key={x.kunci} value={x.kunci}>
                {x.nama} ({x.jumlah})
              </option>
            ))}
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {h.jenis ? <Link href="/menunggu-persetujuan">Hapus saringan</Link> : null}
        </div>
      </form>
      {h.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Jenis dokumen</th>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Pengaju</th>
                <th scope="col" className="angka">
                  Nilai
                </th>
                <th scope="col">Menunggu</th>
                <th scope="col">Tindakan</th>
              </tr>
            </thead>
            <tbody>
              {h.baris.map((d) => (
                <tr key={`${d.jenis}-${d.id}`}>
                  <td data-label="Jenis dokumen">{d.nama}</td>
                  <td data-label="Nomor">
                    <Link href={d.href} className="tebal">
                      {d.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{formatTanggal(d.tanggal)}</td>
                  <td data-label="Pengaju">{d.pengaju ?? '-'}</td>
                  <td data-label="Nilai" className="angka">
                    {d.nilai === null ? '-' : formatRupiah(d.nilai)}
                  </td>
                  <td data-label="Menunggu">{lamaMenunggu(d.sejak, sekarang)}</td>
                  <td data-label="Tindakan">
                    {d.bisa ? (
                      <Link href={d.href} className="btn kecil">
                        {d.aksi === 'P' ? 'Posting' : 'Setujui'}
                      </Link>
                    ) : (
                      <span className="redup">Menunggu pemegang izin {d.aksi === 'P' ? 'Posting' : 'Setujui'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{h.jenis ? 'Tidak ada dokumen jenis ini yang menunggu.' : 'Tidak ada dokumen yang menunggu persetujuan.'}</p>
      )}
      <Halaman {...h} dasar="/menunggu-persetujuan" query={s} />
    </>
  )
}
