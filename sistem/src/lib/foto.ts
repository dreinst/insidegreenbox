// Foto menu dan paket. Dua sumber: foto situs di public/img repo induk (nama tanpa .webp) dan foto unggahan di folder
// yang di-gitignore (nilai "unggahan/<berkas>"). Tanpa impor Next supaya bisa dites.
import { randomBytes } from 'node:crypto'
import { mkdir, readdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GalatAturan } from './aksi'

export const dirSitus = () => process.env.SITUS_IMG_DIR || path.resolve(process.cwd(), '../public/img')
export const dirUnggahan = () => process.env.UNGGAHAN_DIR || path.resolve(process.cwd(), 'data/unggahan')

export const BATAS_UNGGAH = 2 * 1024 * 1024
const POLA_SITUS = /^[a-z0-9][a-z0-9-]{0,80}$/
const POLA_UNGGAHAN = /^unggahan\/[a-f0-9]{16}\.(webp|png|jpg)$/

export const fotoUnggahan = (image: string | null | undefined) => !!image && POLA_UNGGAHAN.test(image)

// Daftar foto situs yang boleh dipilih: semua .webp kecuali tekstur (tex-*).
export async function daftarFotoSitus(): Promise<string[]> {
  try {
    const berkas = await readdir(dirSitus())
    return berkas
      .filter((b) => b.endsWith('.webp') && !b.startsWith('tex-'))
      .map((b) => b.slice(0, -5))
      .filter((n) => POLA_SITUS.test(n))
      .sort()
  } catch {
    return []
  }
}

// Alamat gambar untuk tag img. Berkas dilayani route /foto/[jenis]/[nama].
export function urlFoto(image: string | null | undefined): string | null {
  if (!image) return null
  if (fotoUnggahan(image)) return `/foto/${image}`
  return POLA_SITUS.test(image) ? `/foto/img/${image}.webp` : null
}

const TIPE: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg' }
export const tipeFoto = (berkas: string) => TIPE[berkas.split('.').pop() ?? ''] ?? 'application/octet-stream'

// Jalur berkas di disk untuk /foto/<jenis>/<nama>, atau null bila nama tidak sah.
export function jalurFoto(jenis: string, nama: string): string | null {
  if (jenis === 'img' && /^[a-z0-9][a-z0-9-]{0,80}\.webp$/.test(nama)) return path.join(dirSitus(), nama)
  if (jenis === 'unggahan' && POLA_UNGGAHAN.test(`unggahan/${nama}`)) return path.join(dirUnggahan(), nama)
  return null
}

function jenisBerkas(b: Uint8Array): 'webp' | 'png' | 'jpg' | null {
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  return null
}

// Memeriksa berkas unggahan lalu menyimpannya. Mengembalikan nilai untuk kolom image.
export async function simpanUnggahan(berkas: File, kolom: string): Promise<string> {
  if (berkas.size > BATAS_UNGGAH) throw new GalatAturan('Foto paling besar 2 MB.', kolom)
  const isi = new Uint8Array(await berkas.arrayBuffer())
  const jenis = jenisBerkas(isi)
  if (!jenis) throw new GalatAturan('Foto harus berformat WebP, PNG, atau JPG.', kolom)
  const nama = `${randomBytes(8).toString('hex')}.${jenis}`
  await mkdir(dirUnggahan(), { recursive: true })
  await writeFile(path.join(dirUnggahan(), nama), isi)
  return `unggahan/${nama}`
}

export async function hapusUnggahan(image: string | null | undefined) {
  if (!fotoUnggahan(image)) return
  await unlink(path.join(dirUnggahan(), image!.slice('unggahan/'.length))).catch(() => undefined)
}

export type PilihanFoto = { pilihan: string; berkas: File | null }

export function bacaPilihanFoto(fd: FormData, kolomPilih = 'foto', kolomBerkas = 'fotoUnggah'): PilihanFoto {
  const b = fd.get(kolomBerkas)
  return { pilihan: String(fd.get(kolomPilih) ?? ''), berkas: b instanceof File && b.size > 0 ? b : null }
}

// Menentukan nilai image akhir. Berkas unggahan menang atas pilihan. Pilihan hanya boleh kosong, foto situs yang
// ada, atau foto yang sedang terpasang. baru berisi berkas yang baru disimpan, untuk dihapus bila transaksi gagal.
export async function tentukanFoto(p: PilihanFoto, saatIni: string | null, kolom = 'foto'): Promise<{ image: string | null; baru: string | null }> {
  if (p.berkas) {
    const baru = await simpanUnggahan(p.berkas, 'fotoUnggah')
    return { image: baru, baru }
  }
  const v = p.pilihan.trim()
  if (!v) return { image: null, baru: null }
  if (v === saatIni) return { image: v, baru: null }
  if (POLA_SITUS.test(v) && (await daftarFotoSitus()).includes(v)) return { image: v, baru: null }
  throw new GalatAturan('Foto yang dipilih tidak ada di daftar.', kolom)
}
