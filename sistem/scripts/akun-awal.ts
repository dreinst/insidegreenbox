// Memasang akun awal per peran sistem dari env (KONTRAK 11 butir 161). Boleh dijalankan di produksi dan aman diulang.
// Untuk tiap peran yang SEED_<PERAN>_USERNAME-nya terisi (OWNER, SUPERADMIN, ADMIN, KASIR, FINANCE): pengguna dibuat
// bila belum ada, atau sandi, peran, dan status aktifnya disamakan dengan env. Sandi tidak pernah dicetak.
// Contoh: SEED_FINANCE_USERNAME=finance SEED_FINANCE_PASSWORD=... npx tsx scripts/akun-awal.ts
import 'dotenv/config'
import { akunDariEnv, pasangAkun, SANDI_FORMULIR_MIN } from '../src/lib/akun-awal'
import { buatKlien } from '../src/lib/db'

const db = buatKlien()

async function main() {
  const daftar = akunDariEnv(process.env)
  if (!daftar.length) throw new Error('Tidak ada akun yang diisi. Isi SEED_<PERAN>_USERNAME dan SEED_<PERAN>_PASSWORD untuk OWNER, SUPERADMIN, ADMIN, KASIR, atau FINANCE.')
  let gagal = 0
  for (const a of daftar) {
    try {
      const h = await pasangAkun(db, a)
      const rinci = h.hasil === 'diperbarui' ? ` (${h.perubahan.join(', ')})` : ''
      console.log(`${a.roleCode} ${a.username}: ${h.hasil}${rinci}.`)
      if (h.sandiPendek) console.log(`  Sandi ${a.username} kurang dari ${SANDI_FORMULIR_MIN} karakter. Ganti lewat menu Pengguna sesudah masuk.`)
    } catch (e) {
      gagal++
      console.error(`${a.roleCode} ${a.username}: gagal. ${e instanceof Error ? e.message : e}`)
    }
  }
  if (gagal) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
