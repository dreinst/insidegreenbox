import { Kerangka } from '@/components/kerangka'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { itemTampil, SIDEBAR } from '@/lib/katalog'

// Layout hanya menyusun sidebar dan header. Cek izin tetap dilakukan di setiap halaman dan aksi (KONTRAK 4.5).
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  const item = SIDEBAR.filter((i) => itemTampil(i, (m) => punyaIzin(p.izin, m, 'L')))
  return (
    <Kerangka item={item} nama={p.name} username={p.username} peran={p.peran.name}>
      {children}
    </Kerangka>
  )
}
