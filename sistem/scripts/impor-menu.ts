// Memindah data menu admin lama ke database: kategori, menu dan harga, tingkat member, paket set, dan metode bayar
// bawaan. Aman dijalankan berulang: yang sudah ada dilewati. Pakai: npm run impor:menu
import 'dotenv/config'
import { DRINKS, FOODS } from '../../src/data'
import { buatKlien } from '../src/lib/db'
import { bangunDataImpor, imporMenu } from '../src/lib/impor-menu'

const db = buatKlien()

async function main() {
  const hasil = await imporMenu(db, bangunDataImpor(DRINKS, FOODS))
  for (const [bagian, h] of Object.entries(hasil)) console.log(`${bagian}: ${h.baru} baru, ${h.dilewati} sudah ada`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
