// Pengguna contoh untuk lokal dan uji: satu Admin dan satu Kasir, ditambah satu Superadmin dan satu Finance bila env-nya
// diisi (KONTRAK 11 butir 161). Sandi dibaca dari env. Dijalankan ulang, sandinya disetel ulang ke nilai env dan
// penggunanya diaktifkan lagi. Untuk produksi pakai scripts/akun-awal.ts.
import 'dotenv/config'
import { buatKlien } from '../src/lib/db'
import { isiMemberContoh } from '../src/lib/impor-menu'
import { normalisasiWa } from '../src/lib/member'
import { isiPeranDanIzin, pastikanPengguna } from '../src/lib/seed-inti'

if (process.env.NODE_ENV === 'production') throw new Error('seed:contoh hanya untuk lokal dan uji.')

const db = buatKlien()

async function main() {
  await isiPeranDanIzin(db)
  const isi = [
    { u: process.env.SEED_ADMIN_USERNAME, p: process.env.SEED_ADMIN_PASSWORD, name: 'Admin Contoh', roleCode: 'admin' as const, wajib: true },
    { u: process.env.SEED_KASIR_USERNAME, p: process.env.SEED_KASIR_PASSWORD, name: 'Kasir Contoh', roleCode: 'kasir' as const, wajib: true },
    { u: process.env.SEED_SUPERADMIN_USERNAME, p: process.env.SEED_SUPERADMIN_PASSWORD, name: 'Superadmin Contoh', roleCode: 'superadmin' as const, wajib: false },
    { u: process.env.SEED_FINANCE_USERNAME, p: process.env.SEED_FINANCE_PASSWORD, name: 'Finance Contoh', roleCode: 'finance' as const, wajib: false },
  ]
  for (const x of isi) {
    if (!x.wajib && !x.u) {
      console.log(`SEED_${x.roleCode.toUpperCase()}_USERNAME kosong, ${x.name} dilewati.`)
      continue
    }
    if (!x.u || !x.p || x.p.length < 8) throw new Error(`Isi SEED_${x.roleCode.toUpperCase()}_USERNAME dan SEED_${x.roleCode.toUpperCase()}_PASSWORD (minimal 8 karakter) di .env.`)
    const baru = await pastikanPengguna(db, { username: x.u, password: x.p, name: x.name, roleCode: x.roleCode }, true)
    console.log(`${x.name} ${x.u} ${baru ? 'dibuat' : 'disetel ulang'}.`)
  }
  // tahap 3A: member contoh dari admin lama. Tingkatnya ikut dihitung bila tingkat sudah diimpor (npm run impor:menu).
  console.log(`Member contoh baru: ${await isiMemberContoh(db, normalisasiWa)}.`)
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
