import { TabModul, type ItemTab } from '@/components/tab-modul'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

// Layout hanya menyusun tab. Cek izin dilakukan tiap halaman dan aksi (KONTRAK 4.5).
export default async function LayoutMenu({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  if (!punyaIzin(p.izin, 'menu.menu', 'L')) return <>{children}</>
  const tab: ItemTab[] = [
    { href: '/menu/kategori', label: 'Kategori' },
    { href: '/menu/paket', label: 'Paket set' },
    ...(punyaIzin(p.izin, 'menu.menu', 'U') ? [{ href: '/menu/harga', label: 'Ubah harga' }] : []),
    { href: '/menu/riwayat', label: 'Riwayat harga' },
  ]
  return (
    <>
      <TabModul label="Bagian menu" item={[{ href: '/menu', label: 'Menu' }, ...tab]} />
      {children}
    </>
  )
}
