import { TabModul } from '@/components/tab-modul'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'

// Layout hanya menyusun tab. Cek izin dilakukan tiap halaman dan aksi (KONTRAK 4.5).
export default async function LayoutProduk({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  if (!punyaIzin(p.izin, 'stok.produk', 'L')) return <>{children}</>
  return (
    <>
      <TabModul
        label="Bagian produk"
        item={[
          { href: '/produk', label: 'Produk' },
          { href: '/produk/kategori', label: 'Kategori' },
          { href: '/produk/satuan', label: 'Satuan' },
        ]}
      />
      {children}
    </>
  )
}
