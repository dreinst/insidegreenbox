import { Kerangka } from '@/components/kerangka'
import { wajibMasuk } from '@/lib/izin'
import { punyaIzin } from '@/lib/izin-inti'
import { db } from '@/lib/db'
import { itemTampil, SIDEBAR_GRUP, type ItemSidebar } from '@/lib/katalog'
import { bolehLihatMenunggu, hitungMenunggu } from '@/lib/menunggu'

// Layout hanya menyusun sidebar dan header. Cek izin tetap dilakukan di setiap halaman dan aksi (KONTRAK 4.5).
// tahap 4B: sidebar berkelompok; grup yang semua itemnya tidak boleh dilihat tidak ditampilkan.
export default async function LayoutAdmin({ children }: { children: React.ReactNode }) {
  const p = await wajibMasuk()
  // Menunggu Persetujuan: lencana berisi jumlah dokumen yang bisa ditindaklanjuti pengguna ini (KONTRAK 11 butir 158).
  const menunggu = bolehLihatMenunggu(p)
  const jumlah = menunggu ? (await hitungMenunggu(db, p)).bisa : 0
  const tampil = (i: ItemSidebar) => (i.khusus === 'menunggu' ? menunggu : itemTampil(i, (m) => punyaIzin(p.izin, m, 'L')))
  const grup = SIDEBAR_GRUP.map((g) => ({ ...g, item: g.item.filter(tampil).map((i) => (i.khusus === 'menunggu' && jumlah ? { ...i, lencana: jumlah } : i)) })).filter((g) => g.item.length)
  return (
    <Kerangka grup={grup} nama={p.name} username={p.username} peran={p.peran.name}>
      {children}
    </Kerangka>
  )
}
