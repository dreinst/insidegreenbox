// Memindah resep menu admin lama ke database sebagai BOM menu (tahap 4B). Jalankan sesudah impor:menu dan impor:stok,
// karena menu dan bahan dicocokkan menurut nama. Aman dijalankan berulang: menu yang sudah punya resep dilewati.
// Yang tidak cocok dilaporkan, tidak ditebak. Pakai: npm run impor:resep
import 'dotenv/config'
import { buatKlien } from '../src/lib/db'
import { imporResep } from '../src/lib/produksi/impor'

const db = buatKlien()

async function main() {
  const h = await imporResep(db)
  console.log(`Resep baru: ${h.dibuat.length}. Dilewati karena menu sudah punya resep: ${h.dilewati.length}.`)
  if (h.menuTakCocok.length) console.log(`Menu tidak ditemukan (resep dilewati): ${h.menuTakCocok.join(', ')}`)
  for (const b of h.bahanTakCocok) console.log(`Bahan tidak ditemukan untuk ${b.menu} (resep dilewati): ${b.bahan.join(', ')}`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
