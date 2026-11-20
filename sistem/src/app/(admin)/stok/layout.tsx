import { TabModul } from '@/components/tab-modul'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

// Layout hanya menyusun tab. Cek izin dilakukan tiap halaman (KONTRAK 4.5).
export default async function LayoutStok({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  if (!punyaIzin(p.izin, 'stok.saldo', 'L')) return <>{children}</>
  return (
    <>
      <TabModul
        label="Bagian stok"
        item={[
          { href: '/stok', label: 'Posisi stok' },
          { href: '/stok/kartu', label: 'Kartu stok' },
        ]}
      />
      {children}
    </>
  )
}
