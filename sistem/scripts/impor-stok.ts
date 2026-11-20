// Memindah bahan baku dan stok akhir admin lama ke database sebagai produk dan saldo awal (tahap 4A).
// Saldo awal masuk ke lokasi Outlet lewat satu Penyesuaian Stok berasalan "Saldo awal" yang langsung Diposting.
// Aman dijalankan berulang: produk yang sudah ada dilewati, dan bahan yang sudah punya gerak stok tidak diberi
// saldo awal lagi. Pakai: npm run impor:stok
import 'dotenv/config'
import { buatKlien } from '../src/lib/db'
import { formatNilai } from '../src/lib/stok/angka'
import { imporStok } from '../src/lib/stok/impor'

const db = buatKlien()

async function main() {
  const h = await imporStok(db)
  console.log(`Kategori baru: ${h.kategoriBaru}. Produk baru: ${h.produkBaru}.`)
  console.log(h.saldoAwal ? `Saldo awal ${h.saldoAwal.no}: ${h.baris} bahan, nilai ${formatNilai(h.saldoAwal.nilai)}.` : 'Saldo awal tidak dibuat (semua bahan sudah punya gerak stok).')
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
