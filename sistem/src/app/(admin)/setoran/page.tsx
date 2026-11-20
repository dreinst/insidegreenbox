import type { Metadata } from 'next'
import Link from 'next/link'
import { nilaiTampil } from '@/components/laporan'
import { Halaman, KepalaHalaman, PesanFlash } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarSetoran, dariKolomTanggal, NAMA_STATUS_SETORAN, type SaringSetoran } from '@/lib/setoran'
import { tanggalIso } from '@/lib/waktu'
import { buatSetoranAksi } from './aksi'
import { FormBuat } from './form'
import './setoran.css'

export const metadata: Metadata = { title: 'Setoran POS' }

export default async function DaftarSetoran({ searchParams }: { searchParams: Promise<SaringSetoran & { pesan?: string; tanggal?: string }> }) {
  const p = await wajibIzin('kasir.setoran', 'L')
  const s = await searchParams
  const [hasil, metode] = await Promise.all([daftarSetoran(db, s), db.paymentMethod.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true } })])
  const hariIni = tanggalIso(new Date())
  const awal = s.tanggal && /^\d{4}-\d{2}-\d{2}$/.test(s.tanggal) && s.tanggal <= hariIni ? s.tanggal : hariIni
  const disaring = !!(s.dari || s.sampai || s.metode || s.status)
  const menunggu = punyaIzin(p.izin, 'kasir.setoran', 'S') ? await db.posSettlement.count({ where: { status: 'Diajukan' } }) : 0
  return (
    <>
      <KepalaHalaman judul="Setoran POS" keterangan="Uang hasil penjualan per tanggal per metode bayar, dari shift yang sudah ditutup. Tanggal shift adalah tanggal saat shift dibuka (WIB)." />
      <PesanFlash kode={s.pesan} />
      {menunggu ? (
        <p className="lap-peringatan" role="status">
          {menunggu} setoran menunggu persetujuanmu. <Link href="/setoran?status=Diajukan">Lihat antrean</Link>
        </p>
      ) : null}
      {punyaIzin(p.izin, 'kasir.setoran', 'T') ? (
        <section className="kartu" aria-labelledby="j-buat">
          <h2 id="j-buat">Buat setoran</h2>
          <p className="redup">Membuat satu draf per metode bayar berisi shift yang sudah ditutup dan belum disetor. Draf yang sudah ada ditambah shift barunya.</p>
          <FormBuat aksi={buatSetoranAksi} awal={awal} maks={hariIni} />
        </section>
      ) : null}

      <form className="saring" method="get" role="search" aria-label="Saring setoran">
        <div className="kolom">
          <label htmlFor="s-dari">Dari tanggal</label>
          <input id="s-dari" name="dari" type="date" defaultValue={s.dari ?? ''} />
        </div>
        <div className="kolom">
          <label htmlFor="s-sampai">Sampai tanggal</label>
          <input id="s-sampai" name="sampai" type="date" defaultValue={s.sampai ?? ''} />
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
            {Object.entries(NAMA_STATUS_SETORAN).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/setoran">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi lap-gulir" role="region" aria-label="Daftar setoran" tabIndex={0}>
          <table className="tabel lap-tabel">
            <thead>
              <tr>
                <th scope="col">Nomor</th>
                <th scope="col">Tanggal</th>
                <th scope="col">Metode</th>
                <th scope="col">Rekening tujuan</th>
                <th scope="col" className="angka">
                  Shift
                </th>
                <th scope="col" className="angka">
                  Nilai sistem
                </th>
                <th scope="col" className="angka">
                  Disetor
                </th>
                <th scope="col" className="angka">
                  MDR
                </th>
                <th scope="col" className="angka">
                  Selisih
                </th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((x) => (
                <tr key={x.id}>
                  <td data-label="Nomor">
                    <Link href={`/setoran/${x.id}`} className="tebal">
                      {x.no}
                    </Link>
                  </td>
                  <td data-label="Tanggal">{dariKolomTanggal(x.date)}</td>
                  <td data-label="Metode">{x.paymentMethod.name}</td>
                  <td data-label="Rekening tujuan">{x.bankAccount ? `${x.bankAccount.bankName} ${x.bankAccount.accountNo}` : x.paymentMethod.kind === 'tunai' ? 'Kas Besar' : 'Belum dipilih'}</td>
                  <td data-label="Shift" className="angka">
                    {x._count.posSettlementLines}
                  </td>
                  <td data-label="Nilai sistem" className="angka">
                    {nilaiTampil(Number(x.expectedTotal), 'uang')}
                  </td>
                  <td data-label="Disetor" className="angka">
                    {nilaiTampil(Number(x.actualTotal), 'uang')}
                  </td>
                  <td data-label="MDR" className="angka">
                    {nilaiTampil(Number(x.mdrFee), 'uang')}
                  </td>
                  <td data-label="Selisih" className={`angka${x.diff ? ' lap-merah' : ''}`}>
                    {nilaiTampil(Number(x.diff), 'selisih')}
                  </td>
                  <td data-label="Status">
                    <span className={`st-status ${x.status}`}>{NAMA_STATUS_SETORAN[x.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada setoran yang cocok dengan saringan.' : 'Belum ada setoran.'}</p>
      )}
      <Halaman {...hasil} dasar="/setoran" query={{ dari: s.dari, sampai: s.sampai, metode: s.metode, status: s.status }} />
    </>
  )
}
