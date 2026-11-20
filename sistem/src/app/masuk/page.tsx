import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { Logo } from '@/components/logo'
import { penggunaSaatIni } from '@/lib/sesi'
import { FormMasuk } from './form-masuk'

export const metadata: Metadata = { title: 'Masuk' }

export default async function HalamanMasuk({ searchParams }: { searchParams: Promise<{ ke?: string; pesan?: string }> }) {
  if (await penggunaSaatIni()) redirect('/')
  const { ke, pesan } = await searchParams
  return (
    <main className="masuk">
      <div className="masuk-kartu">
        <Logo />
        <h1>Masuk ke admin</h1>
        <p className="redup">Pakai nama pengguna dan sandi dari Owner.</p>
        {pesan === 'keluar' ? (
          <p className="pesan sukses" role="status">
            Kamu sudah keluar.
          </p>
        ) : null}
        <FormMasuk ke={typeof ke === 'string' ? ke : undefined} />
      </div>
    </main>
  )
}
