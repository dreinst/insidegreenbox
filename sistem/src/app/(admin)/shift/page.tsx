import type { Metadata } from 'next'
import Link from 'next/link'
import { LencanaAlasan, LencanaShift, selisihTeks } from '@/components/kasir-umum'
import { Halaman, KepalaHalaman, PesanFlash } from '@/components/umum'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { daftarShift, lihatSemuaKasir, shiftTanpaAlasan, shiftTerbuka, STATUS_SHIFT, type SaringShift } from '@/lib/shift'
import { formatWaktu } from '@/lib/waktu'
import { bukaShiftAksi } from './aksi'
import { FormBuka } from './form'
import '@/components/kasir.css'

export const metadata: Metadata = { title: 'Shift' }

export default async function HalamanShift({ searchParams }: { searchParams: Promise<SaringShift & { pesan?: string }> }) {
  const p = await wajibIzin('kasir.shift', 'L')
  const s = await searchParams
  const semua = lihatSemuaKasir(p)
  const [buka, hasil, kasir, antre, tanpaAlasan] = await Promise.all([
    shiftTerbuka(db, p.id),
    daftarShift(db, p, s),
    semua ? db.appUser.findMany({ where: { shifts: { some: {} } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : [],
    punyaIzin(p.izin, 'kasir.shift', 'S') ? db.shift.count({ where: { status: 'PerluPersetujuan' } }) : 0,
    shiftTanpaAlasan(db, p.id),
  ])
  const disaring = !!(s.dari || s.sampai || s.status || s.kasir)
  return (
    <>
      <KepalaHalaman judul="Shift" keterangan={semua ? 'Shift semua kasir. Kasir hanya melihat shift miliknya.' : 'Buka shift dengan modal laci, tutup dengan menghitung kas.'} />
      <PesanFlash kode={s.pesan} />

      {antre ? (
        <p className="pesan peringatan" role="status">
          {antre} shift menunggu persetujuan selisih kas. <Link href="/shift?status=PerluPersetujuan">Lihat antrean</Link>
        </p>
      ) : null}

      {buka ? (
        <section className="kartu sorot" aria-labelledby="j-berjalan">
          <div className="kartu-kepala">
            <h2 id="j-berjalan">Shiftmu sedang berjalan</h2>
            <LencanaShift status="Buka" />
          </div>
          <dl className="rincian">
            <dt>Dibuka</dt>
            <dd>{formatWaktu(buka.openedAt)}</dd>
            <dt>Modal awal</dt>
            <dd>{rupiah(buka.openCash)}</dd>
          </dl>
          <div className="tombol-baris">
            <Link href={`/shift/${buka.id}`} className="btn">
              Kas laci dan tutup shift
            </Link>
            {punyaIzin(p.izin, 'kasir.layar', 'L') ? (
              <Link href="/kasir" className="btn sekunder">
                Ke layar kasir
              </Link>
            ) : null}
          </div>
        </section>
      ) : punyaIzin(p.izin, 'kasir.shift', 'T') ? (
        <section className="kartu sorot" aria-labelledby="j-buka">
          <h2 id="j-buka">Buka shift</h2>
          <p className="redup">Belum ada shift terbuka atas nama {p.name}. Penjualan hanya bisa dibuat sesudah shift dibuka.</p>
          {tanpaAlasan ? (
            <p className="pesan peringatan" role="status">
              Shift #{tanpaAlasan.id} ditutup dengan selisih kas tanpa alasan. <Link href={`/shift/${tanpaAlasan.id}`}>Isi alasan selisihnya dulu</Link>, lalu buka shift baru.
            </p>
          ) : null}
          <FormBuka aksi={bukaShiftAksi} />
        </section>
      ) : null}

      <h2 className="judul-bagian">Riwayat shift</h2>
      <form className="saring" method="get" role="search" aria-label="Saring shift">
        <div className="kolom">
          <label htmlFor="s-dari">Dari tanggal</label>
          <input id="s-dari" name="dari" type="date" defaultValue={s.dari ?? ''} />
        </div>
        <div className="kolom">
          <label htmlFor="s-sampai">Sampai tanggal</label>
          <input id="s-sampai" name="sampai" type="date" defaultValue={s.sampai ?? ''} />
        </div>
        <div className="kolom">
          <label htmlFor="s-status">Status</label>
          <select id="s-status" name="status" defaultValue={s.status ?? ''}>
            <option value="">Semua status</option>
            {Object.entries(STATUS_SHIFT).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        {semua ? (
          <div className="kolom">
            <label htmlFor="s-kasir">Kasir</label>
            <select id="s-kasir" name="kasir" defaultValue={s.kasir ?? ''}>
              <option value="">Semua kasir</option>
              {kasir.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        <div className="saring-tombol">
          <button type="submit" className="btn sekunder">
            Saring
          </button>
          {disaring ? <Link href="/shift">Hapus saringan</Link> : null}
        </div>
      </form>

      {hasil.baris.length ? (
        <div className="kartu tanpa-isi">
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Shift</th>
                <th scope="col">Kasir</th>
                <th scope="col">Dibuka</th>
                <th scope="col">Ditutup</th>
                <th scope="col">Transaksi</th>
                <th scope="col">Selisih</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr">Tindakan</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {hasil.baris.map((r) => (
                <tr key={r.id}>
                  <td data-label="Shift">
                    <Link href={`/shift/${r.id}`} className="tebal">
                      #{r.id}
                    </Link>
                  </td>
                  <td data-label="Kasir">{r.user.name}</td>
                  <td data-label="Dibuka">{formatWaktu(r.openedAt)}</td>
                  <td data-label="Ditutup">{r.closedAt ? formatWaktu(r.closedAt) : 'Berjalan'}</td>
                  <td data-label="Transaksi">{r._count.sales}</td>
                  <td data-label="Selisih">{selisihTeks(r.cashDiff)}</td>
                  <td data-label="Status">
                    <span>
                      <LencanaShift status={r.status} />
                      {r.reasonMissing ? (
                        <>
                          {' '}
                          <LencanaAlasan />
                        </>
                      ) : null}
                    </span>
                  </td>
                  <td className="sel-aksi">
                    <Link href={`/shift/${r.id}`}>Rincian</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="kosong">{disaring ? 'Tidak ada shift yang cocok dengan saringan.' : 'Belum ada shift.'}</p>
      )}
      <Halaman {...hasil} dasar="/shift" query={{ dari: s.dari, sampai: s.sampai, status: s.status, kasir: s.kasir }} />
    </>
  )
}
