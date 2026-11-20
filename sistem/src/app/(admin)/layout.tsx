import { Kerangka } from '@/components/kerangka'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { SIDEBAR } from '@/lib/katalog'

// Layout hanya menyusun sidebar dan header. Cek izin tetap dilakukan di setiap halaman dan aksi (KONTRAK 4.5).
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  const item = SIDEBAR.filter((i) => !i.menu || punyaIzin(p.izin, i.menu, 'L'))
  return (
    <Kerangka item={item} nama={p.name} username={p.username} peran={p.peran.name}>
      {children}
    </Kerangka>
  )
}
