// Bukti setor setoran POS: foto atau PDF paling besar 2 MB di folder unggahan (UNGGAHAN_DIR/bukti, di-gitignore).
// Nilai kolom pos_settlement.proof_file berbentuk "bukti/<16 heksa>.<webp|png|jpg|pdf>". Berkas dilayani route
// /setoran/[id]/bukti yang memeriksa izin setoran. Isi diperiksa dari tanda tangan berkas, bukan ekstensi. Tanpa Next.
import { randomBytes } from 'node:crypto'
import { mkdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { GalatAturan } from './aksi'
import { BATAS_UNGGAH, dirUnggahan } from './foto'

const POLA = /^bukti\/[a-f0-9]{16}\.(webp|png|jpg|pdf)$/
export const TIPE_BUKTI: Record<string, string> = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf' }

export const buktiSah = (v: string | null | undefined): v is string => !!v && POLA.test(v)
export const buktiPdf = (v: string | null | undefined) => buktiSah(v) && v.endsWith('.pdf')

function jenis(b: Uint8Array): keyof typeof TIPE_BUKTI | null {
  if (b.length > 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png'
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg'
  if (b.length > 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) return 'pdf'
  return null
}

export async function simpanBukti(berkas: File): Promise<string> {
  if (berkas.size > BATAS_UNGGAH) throw new GalatAturan('Bukti setor paling besar 2 MB.', 'bukti')
  const isi = new Uint8Array(await berkas.arrayBuffer())
  const j = jenis(isi)
  if (!j) throw new GalatAturan('Bukti setor harus berupa foto WebP, PNG, JPG, atau PDF.', 'bukti')
  const nama = `${randomBytes(8).toString('hex')}.${j}`
  await mkdir(path.join(dirUnggahan(), 'bukti'), { recursive: true })
  await writeFile(path.join(dirUnggahan(), 'bukti', nama), isi)
  return `bukti/${nama}`
}

export const jalurBukti = (v: string) => (buktiSah(v) ? path.join(dirUnggahan(), v) : null)

export async function hapusBukti(v: string | null | undefined) {
  const j = v ? jalurBukti(v) : null
  if (j) await unlink(j).catch(() => undefined)
}
