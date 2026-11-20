import type { Metadata } from 'next'
import Link from 'next/link'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { rupiah } from '@/lib/hitung-kasir'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { ambilPenjualan } from '@/lib/penjualan'
import { shiftTerbuka } from '@/lib/shift'
import { cariMemberAksi, simpanPenjualanAksi } from './aksi'
import { LayarKasir } from './layar'
import '@/components/kasir.css'

export const metadata: Metadata = { title: 'Layar Kasir' }

export default async function HalamanKasir({ searchParams }: { searchParams: Promise<{ selesai?: string }> }) {
  const p = await wajibIzin('kasir.layar', 'L')
  const { selesai } = await searchParams
  const shift = await shiftTerbuka(db, p.id)
  const idSelesai = Number(selesai)
  const baru = Number.isInteger(idSelesai) && idSelesai > 0 ? await ambilPenjualan(db, p, idSelesai) : null

  if (!shift) {
    return (
      <>
        <KepalaHalaman judul="Layar Kasir" keterangan="Buat pesanan dan terima pembayaran." />
        <section className="kartu sorot" aria-labelledby="j-gerbang">
          <h2 id="j-gerbang">Buka shift dulu</h2>
          <p className="redup">Penjualan hanya bisa dibuat saat ada shift terbuka atas nama {p.name}. Isi modal awal laci di halaman Shift.</p>
          {punyaIzin(p.izin, 'kasir.shift', 'T') ? (
            <Link href="/shift" className="btn">
              Ke halaman Shift
            </Link>
          ) : (
            <p className="redup">Peranmu tidak bisa membuka shift.</p>
          )}
        </section>
      </>
    )
  }

  const [menu, metode, lokasi] = await Promise.all([
    db.menuItem.findMany({ where: { active: true }, orderBy: [{ category: 'asc' }, { name: 'asc' }], take: 500, select: { id: true, name: true, category: true, price: true } }),
    db.paymentMethod.findMany({ where: { active: true }, orderBy: { id: 'asc' }, select: { id: true, name: true, kind: true } }),
    db.location.findUniqueOrThrow({ where: { id: shift.locationId }, include: { branch: true } }),
  ])
  const bolehJual = punyaIzin(p.izin, 'kasir.layar', 'T')

  return (
    <>
      <KepalaHalaman judul="Layar Kasir" keterangan={`Shift #${shift.id} ${p.name} di ${lokasi.name}.`}>
        <Link href={`/shift/${shift.id}`} className="btn sekunder kecil">
          Shift dan kas laci
        </Link>
      </KepalaHalaman>
      {baru ? (
        <section className="pesan sukses lk-selesai" role="status">
          <span>
            Transaksi <b>{baru.no}</b> tersimpan. Total {rupiah(baru.total)}
            {baru.salePayments.some((b) => b.change > 0n) ? `, kembalian ${rupiah(baru.salePayments.reduce((a, b) => a + b.change, 0n))}` : ''}.
          </span>
          <Link href={`/struk/${baru.id}`} className="btn kecil">
            Cetak struk
          </Link>
        </section>
      ) : null}
      {!metode.length ? <p className="pesan galat">Belum ada metode bayar aktif. Minta Owner mengisi metode bayar.</p> : null}
      {bolehJual ? (
        <LayarKasir
          key={baru?.id ?? 'baru'}
          menu={menu.map((m) => ({ ...m, price: Number(m.price) }))}
          metode={metode.map((m) => ({ id: m.id, name: m.name, tunai: m.kind === 'tunai' }))}
          biaya={{ pajak: Number(lokasi.branch.taxPct), service: Number(lokasi.branch.servicePct) }}
          aksi={simpanPenjualanAksi}
          cariMember={cariMemberAksi}
        />
      ) : (
        <p className="kosong">Peranmu hanya bisa melihat layar kasir, tidak bisa membuat penjualan.</p>
      )}
    </>
  )
}
