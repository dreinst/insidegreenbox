import { TabModul } from '@/components/tab-modul'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

// Layout hanya menyusun tab. Cek izin dilakukan tiap halaman dan aksi (KONTRAK 4.5).
export default async function LayoutAset({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  if (!punyaIzin(p.izin, 'aset.daftar', 'L')) return <>{children}</>
  return (
    <>
      <TabModul
        label="Bagian aset tetap"
        item={[
          { href: '/aset', label: 'Aset' },
          { href: '/aset/kategori', label: 'Kategori' },
        ]}
      />
      {children}
    </>
  )
}
