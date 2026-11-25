import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { LencanaJual } from '@/components/kasir-umum'
import { IsiStruk } from '@/components/struk'
import { KepalaHalaman, PesanFlash } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { isOwner, punyaIzin, saklarNyala } from '@/lib/izin-inti'
import { ambilPenjualan, bolehVoidLangsung } from '@/lib/penjualan'
import { daftarPenyetujuVoid } from '@/lib/pin'
import { formatNilai } from '@/lib/stok/angka'
import { formatWaktu } from '@/lib/waktu'
import { voidAksi } from '../aksi'
import { FormVoid } from '../form'
import '@/components/kasir.css'

export const metadata: Metadata = { title: 'Transaksi' }

export default async function RincianTransaksi({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ pesan?: string }> }) {
  const p = await wajibIzin('kasir.transaksi', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const [j, { pesan }] = await Promise.all([ambilPenjualan(db, p, id), searchParams])
  if (!j) notFound()
  const langsung = bolehVoidLangsung(p)
  const shiftBuka = j.shift.status === 'Buka'
  // Sesudah shift ditutup, void hanya lewat Owner: Owner sendiri, atau penyetuju Owner lewat PIN.
  const penyetuju = langsung ? null : (await daftarPenyetujuVoid(db, p.id)).filter((u) => shiftBuka || u.kodePeran === 'owner')
  const bisaVoid = j.status === 'Selesai' && (langsung ? shiftBuka || isOwner(p) : (penyetuju?.length ?? 0) > 0)
  // tahap 4B: HPP dari bahan resep yang dipotong mesin stok; baris tanpa gerak berarti menu tanpa resep.
  const lihatHpp = saklarNyala(p, 'stok.lihat_nilai')
  const bergerak = lihatHpp ? new Set((await db.stockLedger.findMany({ where: { docType: 'sale', docId: j.id, isReversal: false }, select: { lineId: true }, distinct: ['lineId'] })).map((g) => g.lineId)) : new Set()

  return (
    <>
      <KepalaHalaman judul={j.no} keterangan={`${formatWaktu(j.at)} · shift #${j.shift.id} ${j.shift.user.name}`} jejak={{ href: '/transaksi', label: 'Transaksi' }}>
        <LencanaJual status={j.status} />
        <Link href={`/struk/${j.id}`} className="btn sekunder">
          Cetak struk
        </Link>
      </KepalaHalaman>
      <PesanFlash kode={pesan} />
      <div className="kisi">
        <section className="kartu" aria-label="Struk">
          <IsiStruk j={j} />
        </section>
        <section className="kartu" aria-labelledby="j-void">
          <h2 id="j-void">Void</h2>
          {j.status === 'Void' ? (
            <dl className="rincian">
              <dt>Di-void oleh</dt>
              <dd>{j.namaVoid ?? '-'}</dd>
              {j.namaPenyetuju ? (
                <>
                  <dt>Disetujui dengan PIN</dt>
                  <dd>{j.namaPenyetuju}</dd>
                </>
              ) : null}
              <dt>Waktu</dt>
              <dd>{formatWaktu(j.voidAt)}</dd>
              <dt>Alasan</dt>
              <dd className="pecah">{j.voidReason}</dd>
            </dl>
          ) : bisaVoid ? (
            <>
              <p className="redup">Void mengubah status transaksi menjadi Void. Transaksi tidak dihapus, kunjungan member dikurangi satu, dan bahan resep kembali ke stok lewat gerak balik.</p>
              <FormVoid aksi={voidAksi.bind(null, j.id)} penyetuju={penyetuju} no={j.no} />
            </>
          ) : (
            <p className="redup">
              {!shiftBuka
                ? 'Shift transaksi ini sudah ditutup. Void sesudah shift ditutup hanya bisa oleh Owner.'
                : 'Belum ada penyetuju void yang punya PIN. Minta Owner memasang PIN Admin di menu PIN Kasir.'}
            </p>
          )}
          {punyaIzin(p.izin, 'atur.audit', 'L') ? (
            <p>
              <Link href={`/audit?entitas=sale&dok=${j.id}`}>Lihat jejak audit transaksi ini</Link>
            </p>
          ) : null}
        </section>
      </div>
      {lihatHpp ? (
        <section className="kartu" aria-labelledby="j-hpp">
          <h2 id="j-hpp">HPP {formatNilai(j.hpp)}</h2>
          <table className="tabel">
            <thead>
              <tr>
                <th scope="col">Baris</th>
                <th scope="col" className="angka">
                  Qty
                </th>
                <th scope="col" className="angka">
                  HPP
                </th>
              </tr>
            </thead>
            <tbody>
              {j.saleLines.map((l) => (
                <tr key={l.id}>
                  <td data-label="Baris">
                    {l.name}
                    {l.promoGift ? <small className="redup"> · hadiah promo</small> : null}
                    {bergerak.has(l.id) ? null : <small className="redup"> · menu tanpa resep, stok tidak dipotong</small>}
                  </td>
                  <td data-label="Qty" className="angka">
                    {l.qty}
                  </td>
                  <td data-label="HPP" className="angka">
                    {formatNilai(l.hpp)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {punyaIzin(p.izin, 'stok.saldo', 'L') && bergerak.size ? <p className="redup kecil">Gerak bahan transaksi ini tercatat di kartu stok dengan nomor {j.no}.</p> : null}
        </section>
      ) : null}
    </>
  )
}
