import { Kerangka } from '@/components/kerangka'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { itemTampil, SIDEBAR_GRUP } from '@/lib/katalog'

// Layout hanya menyusun sidebar dan header. Cek izin tetap dilakukan di setiap halaman dan aksi (KONTRAK 4.5).
// tahap 4B: sidebar berkelompok; grup yang semua itemnya tidak boleh dilihat tidak ditampilkan.
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  const grup = SIDEBAR_GRUP.map((g) => ({ ...g, item: g.item.filter((i) => itemTampil(i, (m) => punyaIzin(p.izin, m, 'L'))) })).filter((g) => g.item.length)
  return (
    <Kerangka grup={grup} nama={p.name} username={p.username} peran={p.peran.name}>
      {children}
    </Kerangka>
  )
}
