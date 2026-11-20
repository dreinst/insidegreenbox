import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/logo'
import { db } from '@/lib/db'
import { daftarMasukPin } from '@/lib/pin'
import { penggunaSaatIni } from '@/lib/sesi'
import { FormMasuk } from './form-masuk'
import { FormMasukPin } from './form-pin'
import '@/components/kasir.css'

export const metadata: Metadata = { title: 'Masuk' }

export default async function HalamanMasuk({ searchParams }: { searchParams: Promise<{ ke?: string; pesan?: string; cara?: string }> }) {
  if (await penggunaSaatIni()) redirect('/')
  const { ke, pesan, cara } = await searchParams
  // tahap 3B: pilihan masuk kasir dengan PIN.
  const pin = cara === 'pin'
  const kasir = pin ? await daftarMasukPin(db) : []
  return (
    <main className="masuk">
      <div className="masuk-kartu">
        <Logo />
        <h1>Masuk ke admin</h1>
        <nav className="tab tab-masuk" aria-label="Cara masuk">
          <Link href="/masuk" className={pin ? undefined : 'aktif'} aria-current={pin ? undefined : 'page'}>
            Sandi
          </Link>
          <Link href="/masuk?cara=pin" className={pin ? 'aktif' : undefined} aria-current={pin ? 'page' : undefined}>
            PIN kasir
          </Link>
        </nav>
        <p className="redup">{pin ? 'Pilih namamu lalu masukkan PIN dari Owner atau Admin.' : 'Pakai nama pengguna dan sandi dari Owner.'}</p>
        {pesan === 'keluar' ? (
          <p className="pesan sukses" role="status">
            Kamu sudah keluar.
          </p>
        ) : null}
        {pin ? (
          kasir.length ? (
            <FormMasukPin kasir={kasir} />
          ) : (
            <p className="kosong">Belum ada kasir yang punya PIN. Masuk dengan sandi, atau minta Owner memasang PIN.</p>
          )
        ) : (
          <FormMasuk ke={typeof ke === 'string' ? ke : undefined} />
        )}
      </div>
    </main>
  )
}
