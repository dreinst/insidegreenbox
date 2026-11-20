// Profil Usaha (tahap 6A, KONTRAK 8 tahap 6): data cabang yang dipakai kasir, struk, dan laporan. Nama, alamat, NPWP,
// telepon, persen pajak PB1 dan service, kepala dan kaki struk, serta logo struk. Izin atur.lokasi (Owner L T U,
// Admin L). Persen pajak dan service dibaca kasir dari branch saat transaksi dan disalin ke sale, jadi struk lama tidak
// berubah; kepala, kaki, dan logo struk dibaca saat struk ditampilkan. Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, selisih, type Konteks } from './audit'
import type { Db } from './db'
import { hapusUnggahan, simpanUnggahan, fotoUnggahan, type PilihanFoto } from './foto'
import { pastikanIzin, type Pengguna } from './izin-inti'
import { skemaPersen } from './master'

const MENU = 'atur.lokasi'

const teks = (label: string, maks: number) => z.string().trim().max(maks, `${label} paling panjang ${maks} huruf.`).default('')

export const skemaProfil = z.object({
  name: z.string().trim().min(2, 'Nama usaha minimal 2 huruf.').max(80, 'Nama usaha paling panjang 80 huruf.'),
  address: teks('Alamat', 200),
  phone: z
    .string()
    .trim()
    .max(30, 'Telepon paling panjang 30 huruf.')
    .regex(/^[0-9+()\s.-]*$/, 'Telepon hanya berisi angka, spasi, +, (, ), titik, atau tanda hubung.')
    .default(''),
  npwp: z
    .string()
    .trim()
    .max(30, 'NPWP paling panjang 30 huruf.')
    .regex(/^[0-9\s.-]*$/, 'NPWP hanya berisi angka, titik, spasi, atau tanda hubung.')
    .default(''),
  taxPct: skemaPersen('Pajak PB1', { max: 25 }),
  servicePct: skemaPersen('Service', { max: 25 }),
  receiptHeader: teks('Kepala struk', 80),
  receiptFooter: teks('Kaki struk', 200),
})

const NAMA_KOLOM: Record<string, string> = {
  name: 'nama',
  address: 'alamat',
  phone: 'telepon',
  npwp: 'NPWP',
  taxPct: 'pajak PB1',
  servicePct: 'service',
  receiptHeader: 'kepala struk',
  receiptFooter: 'kaki struk',
  receiptLogo: 'logo struk',
}

// Logo hanya dari unggahan (tidak ada pilihan foto situs). Pilihan kosong menghapus logo, pilihan sama dengan yang
// terpasang mempertahankannya.
async function tentukanLogo(p: PilihanFoto, saatIni: string | null) {
  if (p.berkas) {
    const baru = await simpanUnggahan(p.berkas, 'fotoUnggah')
    return { logo: baru, baru }
  }
  const v = p.pilihan.trim()
  if (!v) return { logo: null, baru: null }
  if (v === saatIni && fotoUnggahan(v)) return { logo: v, baru: null }
  throw new GalatAturan('Logo yang dipilih tidak ada.', 'receiptLogo')
}

export async function ubahProfil(db: Db, k: Konteks, aktor: Pick<Pengguna, 'id' | 'izin' | 'saklar'>, id: number, masukan: unknown, logo: PilihanFoto) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaProfil.parse(masukan)
  const lama = await db.branch.findUnique({ where: { id } })
  if (!lama) throw new GalatAturan('Cabang tidak ditemukan.')
  const { logo: logoBaru, baru } = await tentukanLogo(logo, lama.receiptLogo)
  try {
    const hasil = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM branch WHERE id = ${id} FOR UPDATE`
      const b = await tx.branch.findUniqueOrThrow({ where: { id } })
      const beda = selisih(
        { name: b.name, address: b.address, phone: b.phone, npwp: b.npwp, taxPct: b.taxPct.toString(), servicePct: b.servicePct.toString(), receiptHeader: b.receiptHeader, receiptFooter: b.receiptFooter, receiptLogo: b.receiptLogo },
        { ...d, taxPct: Number(d.taxPct).toString(), servicePct: Number(d.servicePct).toString(), receiptLogo: logoBaru },
      )
      // Decimal dari database tampil dengan tiga desimal; bandingkan sebagai angka.
      const berubah = beda.berubah.filter((x) => (x === 'taxPct' || x === 'servicePct' ? Number(b[x].toString()) !== Number(d[x]) : true))
      if (!berubah.length) return { berubah: 0, logoLama: null as string | null }
      await tx.branch.update({ where: { id }, data: { ...d, receiptLogo: logoBaru, updatedBy: aktor.id } })
      await catatAudit(tx, k, {
        action: 'profil.ubah',
        docType: 'branch',
        docId: id,
        summary: `Mengubah ${berubah.map((x) => NAMA_KOLOM[x] ?? x).join(', ')} profil usaha ${d.name}`,
        before: Object.fromEntries(berubah.map((x) => [x, (beda.sebelum as Record<string, unknown>)[x]])),
        after: Object.fromEntries(berubah.map((x) => [x, (beda.sesudah as Record<string, unknown>)[x]])),
      })
      return { berubah: berubah.length, logoLama: b.receiptLogo !== logoBaru ? b.receiptLogo : null }
    })
    if (hasil.logoLama) await hapusUnggahan(hasil.logoLama)
    return hasil.berubah
  } catch (e) {
    await hapusUnggahan(baru)
    throw e
  }
}

export const daftarCabang = (db: Db) => db.branch.findMany({ orderBy: { id: 'asc' }, include: { locations: { where: { active: true }, select: { id: true, name: true }, orderBy: { id: 'asc' } } } })
