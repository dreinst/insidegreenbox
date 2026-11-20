// Memindah pemasok dan pesanan pembelian admin lama ke database (tahap 4C). PO yang sudah diterima menjadi riwayat
// (Selesai tanpa penerimaan dan gerak stok, karena barangnya sudah termasuk saldo awal impor:stok). Jalankan sesudah
// npm run impor:stok. Aman dijalankan berulang. Pakai: npm run impor:beli
import 'dotenv/config'
import { buatKlien } from '../src/lib/db'
import { imporBeli } from '../src/lib/beli/impor'

const db = buatKlien()

async function main() {
  const h = await imporBeli(db)
  console.log(`Pemasok baru: ${h.pemasokBaru}. Pesanan baru: ${h.pesananBaru}.`)
  for (const x of h.dilewati) console.log(`Dilewati: ${x}`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
