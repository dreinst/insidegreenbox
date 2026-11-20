// Seed produksi dan lokal: peran Owner, Admin, Kasir, matriks izin (RANCANGAN 8.2), saklar (8.3), dan Owner pertama.
// Nama pengguna dan sandi Owner dibaca dari env, tidak pernah ditulis di kode.
import 'dotenv/config'
import { buatKlien } from '../src/lib/db'
import { isiMetodeBayar } from '../src/lib/impor-menu'
import { isiPeranDanIzin, pastikanPengguna } from '../src/lib/seed-inti'
// tahap 4A
import { isiBawaanStok } from '../src/lib/stok/bawaan'

const db = buatKlien()

async function main() {
  await isiPeranDanIzin(db)
  // tahap 3A: metode bayar bawaan Tunai, QRIS, Debit (yang sudah ada dilewati).
  await isiMetodeBayar(db)
  // tahap 4A: cabang dan lokasi bawaan, alasan penyesuaian, satuan, aturan persetujuan opname dan penyesuaian tambah.
  await isiBawaanStok(db)
  const adaOwner = await db.appUser.count({ where: { role: { code: 'owner' } } })
  if (adaOwner > 0) {
    console.log('Peran, izin, dan saklar siap. Owner sudah ada, tidak dibuat ulang.')
    return
  }
  const username = process.env.SEED_OWNER_USERNAME?.trim()
  const password = process.env.SEED_OWNER_PASSWORD ?? ''
  if (!username || password.length < 8) {
    throw new Error('Belum ada Owner. Isi SEED_OWNER_USERNAME dan SEED_OWNER_PASSWORD (minimal 8 karakter) di .env lalu jalankan seed lagi.')
  }
  await pastikanPengguna(db, { username, password, name: process.env.SEED_OWNER_NAME?.trim() || 'Owner', roleCode: 'owner' })
  console.log(`Peran, izin, dan saklar siap. Owner ${username} dibuat.`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
