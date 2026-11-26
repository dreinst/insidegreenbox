import type { Metadata } from 'next'
import Link from 'next/link'
import { LencanaJual } from '@/components/kasir-umum'
import { Halaman, KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarPenjualan, MODE, type SaringJual } from '@/lib/penjualan'
import { lihatSemuaKasir } from '@/lib/shift'
import { formatWaktu } from '@/lib/waktu'
import '@/components/kasir.css'

export const metadata: Metadata = { title: 'Transaksi' }

export default async function DaftarTransaksi({ searchParams }: { searchParams: Promise<SaringJual> }) {
  const p = await wajibIzin('kasir.transaksi', 'L')
  const s = await searchParams
  const semua = lihatSemuaKasir(p)
  const [hasil, metode, shift] = await Promise.all([
    daftarPenjualan(db, p, s),
    db.paymentMethod.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.shift.findMany({ where: semua ? {} : { userId: p.id }, orderBy: { id: 'desc' }, take: 60, select: { id: true, openedAt: true, user: { select: { name: true } } } }),
  ])
  const disaring = !!(s.dari || s.sampai || s.shift || s.metode || s.status || s.q)
  // Hitung buta (KONTRAK 11 butir 17 dan 134, temuan audit A-4): jumlah penjualan per saringan hanya untuk pemegang Lihat
  // laporan.penjualan, supaya kasir tidak bisa menghitung kas seharusnya sebelum mengisi kas dihitung.
  const lihatJumlah = punyaIzin(p.izin, 'laporan.penjualan', 'L')
  return (
    <>
      <KepalaHalaman judul="Transaksi" keterangan={semua ? 'Penjualan semua kasir, struk, dan void.' : 'Penjualan di shift milikmu, struk, dan void.'} />
      {lihatJumlah ? (
        <div className="ringkas-angka" role="status">
          <div>
            <small>Transaksi selesai</small>
            <b>{hasil.selesai}</b>
          </div>
          <div>
            <small>Penjualan</small>
            <b>{rupiah(hasil.omzet)}</b>
          </div>
        </div>
      ) : null}
      <form className="saring" method="get" role="search" aria-label="Saring transaksi">
        <div className="kolom">
          <label htmlFor="s-dari">Dari tanggal</label>
          <input id="s-dari" name="dari" type="date" defaultValue={s.dari ?? ''} />
        </div>
        <div className="kolom">
          <label htmlFor="s-sampai">Sampai tanggal</label>
          <input id="s-sampai" name="sampai" type="date" defaultValue={s.sampai ?? ''} />
        </div>
        <div className="kolom">
          <label htmlFor="s-shift">Shift</label>
          <select id="s-shift" name="shift" defaultValue={s.shift ?? ''}>
            <option value="">Semua shift</option>
            {shift.map((x) => (
              <option key={x.id} value={x.id}>
                #{x.id} {x.user.name}, {formatWaktu(x.openedAt)}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-metode">Metode bayar</label>
          <select id="s-metode" name="metode" defaultValue={s.metode ?? ''}>
            <option value="">Semua metode</option>
            {metode.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            <option value="Selesai">Selesai</option>
            <option value="Void">Void</option>
          </select>
        </div>
        <div className="kolom">
          <label htmlFor="s-q">Nomor</label>
          <input id="s-q" name="q" type="search" defaultValue={s.q ?? ''} placeholder="Contoh: GB-2611" maxLength={30} />
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/transaksi">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Waktu</th>
                <th scope="col">Kasir</th>
                <th scope="col">Mode</th>
                <th scope="col">Bayar</th>
                <th scope="col" className="kanan">
                  Total
                </th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((j) => (
                <tr key={j.id} className={j.status === 'Void' ? 'baris-void' : undefined}>
                  <td data-label="Nomor">
                    <Link href={`/transaksi/${j.id}`} className="tebal nowrap">
                      {j.no}
                    </Link>
                  </td>
                  <td data-label="Waktu">{formatWaktu(j.at)}</td>
                  <td data-label="Kasir">
                    <span>
                      {j.shift.user.name} <small className="redup">shift #{j.shift.id}</small>
                    </span>
                  </td>
                  <td data-label="Mode">
                    {MODE[j.mode as keyof typeof MODE] ?? j.mode}
                    {j.tableNo ? ` ${j.tableNo}` : ''}
                  </td>
                  <td data-label="Bayar">{j.salePayments.map((b) => b.paymentMethod.name).join(', ') || '-'}</td>
                  <td data-label="Total" className="kanan nowrap">
                    {rupiah(j.total)}
                  </td>
                  <td data-label="Status">
                    <LencanaJual status={j.status} />
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/transaksi/${j.id}`}>Rincian</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada transaksi yang cocok dengan saringan.' : 'Belum ada transaksi.'}</p>
      )}
      <Halaman {...hasil} dasar="/transaksi" query={{ dari: s.dari, sampai: s.sampai, shift: s.shift, metode: s.metode, status: s.status, q: s.q }} />
    </>
  )
}
