// npm run jurnal:bentuk-ulang: membentuk jurnal untuk dokumen lama yang sudah berlaku tetapi belum punya jurnal, lalu
// mencocokkan nilai persediaan di buku dengan nilai stok. Aman dijalankan berkali-kali (KONTRAK 14.5).
import 'dotenv/config'
import { bentukUlangJurnal } from '../src/lib/akuntansi/bentuk-ulang'
import { buatKlien } from '../src/lib/db'

const db = buatKlien()
const rp = (n: number) => `Rp ${n.toLocaleString('id-ID')}`

async function main() {
  const h = await bentukUlangJurnal(db)
  const kelompok = Object.entries(h.per)
  if (!kelompok.length) console.log('Semua dokumen sudah punya jurnal. Tidak ada yang dibentuk.')
  for (const [nama, r] of kelompok) {
    console.log(`${nama}: ${r.dibuat} jurnal dibentuk${r.kosong ? `, ${r.kosong} tanpa nilai (tidak dijurnal)` : ''}${r.gagal.length ? `, ${r.gagal.length} gagal` : ''}`)
    for (const g of r.gagal.slice(0, 10)) console.log(`  gagal ${g.dok}: ${g.pesan}`)
  }
  if (h.pemetaanBaru) console.log(`Pemetaan kliring baru: ${h.pemetaanBaru}`)
  for (const b of h.belumDidukung) console.log(`Belum dijurnal skrip ini: ${b.dokumen} dokumen ${b.docType} punya gerak stok.`)
  const p = h.persediaan
  console.log(`Persediaan di buku ${rp(p.buku)}, nilai stok ${rp(p.stok)}: ${p.cocok ? 'cocok' : `selisih ${rp(p.buku - p.stok)}`}.`)
  console.log(`Barang dalam proses di buku ${rp(p.bdpBuku)}, di perintah produksi ${rp(p.bdpProduksi ?? 0)}.`)
  const pu = h.piutang
  console.log(`Piutang usaha di buku ${rp(Number(pu.buku))}, halaman Piutang Pelanggan ${rp(Number(pu.halaman))}: ${pu.cocok ? 'cocok' : `selisih ${rp(Number(pu.buku - pu.halaman))}`}.`)
  for (const s of pu.selisih.slice(0, 10)) console.log(`  ${s.pelanggan}: buku ${rp(Number(s.buku))}, halaman ${rp(Number(s.halaman))}`)
  if (pu.tanpaPelanggan) console.log(`  baris Piutang Usaha tanpa pelanggan: ${rp(Number(pu.tanpaPelanggan))} (jurnal kas atau memorial ke akun piutang; buka Buku Besar akun itu).`)
  const hu = h.hutang
  console.log(`Hutang usaha di buku ${rp(Number(hu.buku))}, halaman Hutang Pemasok ${rp(Number(hu.halaman))}: ${hu.cocok ? 'cocok' : `selisih ${rp(Number(hu.buku - hu.halaman))}`}.`)
  for (const s of hu.selisih.slice(0, 10)) console.log(`  ${s.pemasok}: buku ${rp(Number(s.buku))}, halaman ${rp(Number(s.halaman))}`)
  if (hu.tanpaPemasok) console.log(`  baris Hutang Usaha tanpa pemasok: ${rp(Number(hu.tanpaPemasok))} (jurnal kas atau memorial ke akun hutang; buka Buku Besar akun itu).`)
  if (!p.cocok || !pu.cocok || !hu.cocok || kelompok.some(([, r]) => r.gagal.length)) process.exitCode = 1
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e)
    process.exitCode = 1
  })
  .finally(() => db.$disconnect())
