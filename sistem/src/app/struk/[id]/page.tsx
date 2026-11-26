import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { IsiStruk } from '@/components/struk'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { ambilPenjualan } from '@/lib/penjualan'
import { TombolCetak } from './tombol-cetak'
import '@/components/kasir.css'

export const metadata: Metadata = { title: 'Struk' }

// Halaman cetak di luar kerangka admin, supaya yang tercetak hanya struknya.
export default async function HalamanStruk({ params }: { params: Promise<{ id: string }> }) {
  const p = await wajibIzin('kasir.transaksi', 'L')
  const id = Number((await params).id)
  if (!Number.isInteger(id) || id <= 0) notFound()
  const j = await ambilPenjualan(db, p, id)
  if (!j) notFound()
  return (
    <main className="halaman-struk">
      <IsiStruk j={j} />
      <div className="struk-tombol">
        <TombolCetak />
        {punyaIzin(p.izin, 'kasir.layar', 'T') ? (
          <Link href="/kasir" className="btn sekunder">
            Transaksi baru
          </Link>
        ) : null}
        <Link href={`/transaksi/${j.id}`} className="btn sekunder">
          Rincian
        </Link>
      </div>
    </main>
  )
}
