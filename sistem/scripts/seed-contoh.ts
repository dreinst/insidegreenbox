// Pengguna contoh untuk lokal dan uji: satu Admin dan satu Kasir. Sandi dibaca dari env.
// Dijalankan ulang, sandinya disetel ulang ke nilai env dan penggunanya diaktifkan lagi.
import 'dotenv/config'
import { buatKlien } from '../src/lib/db'
import { isiPeranDanIzin, pastikanPengguna } from '../src/lib/seed-inti'

if (process.env.NODE_ENV === 'production') throw new Error('seed:contoh hanya untuk lokal dan uji.')

const db = buatKlien()

async function main() {
  await isiPeranDanIzin(db)
  const isi = [
    { u: process.env.SEED_ADMIN_USERNAME, p: process.env.SEED_ADMIN_PASSWORD, name: 'Admin Contoh', roleCode: 'admin' as const },
    { u: process.env.SEED_KASIR_USERNAME, p: process.env.SEED_KASIR_PASSWORD, name: 'Kasir Contoh', roleCode: 'kasir' as const },
  ]
  for (const x of isi) {
    if (!x.u || !x.p || x.p.length < 8) throw new Error(`Isi SEED_${x.roleCode.toUpperCase()}_USERNAME dan SEED_${x.roleCode.toUpperCase()}_PASSWORD (minimal 8 karakter) di .env.`)
    const baru = await pastikanPengguna(db, { username: x.u, password: x.p, name: x.name, roleCode: x.roleCode }, true)
    console.log(`${x.name} ${x.u} ${baru ? 'dibuat' : 'disetel ulang'}.`)
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
