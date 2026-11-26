// Bentuk hasil aksi server dan galat aturan (KONTRAK 6). Tanpa impor Next.
import type { z } from 'zod'

export type HasilAksi =
  | { ok: true; pesan?: string; n: number }
  | { ok: false; pesan: string; galat?: Record<string, string>; isian?: Record<string, string>; n: number }

export const HASIL_AWAL: HasilAksi = { ok: true, n: 0 }

// Pelanggaran aturan bisnis yang pesannya boleh dibaca pengguna. kolom menunjuk isian yang salah.
export class GalatAturan extends Error {
  constructor(
    pesan: string,
    public kolom?: string,
  ) {
    super(pesan)
    this.name = 'GalatAturan'
  }
}

// Ditolak karena saklar fitur mati (temuan audit B-5). Tampil ke pengguna seperti GalatAturan, tetapi jalankanAksi juga
// mencatatnya sebagai izin.ditolak supaya percobaan di luar wewenang terlihat Owner.
export class GalatSaklar extends GalatAturan {
  constructor(
    public kode: string,
    pesan: string,
    kolom?: string,
  ) {
    super(pesan, kolom)
    this.name = 'GalatSaklar'
  }
}

export class GalatIzin extends Error {
  constructor(
    public menu: string,
    public aksi: string,
  ) {
    super('Kamu tidak punya izin untuk tindakan ini.')
    this.name = 'GalatIzin'
  }
}

const RAHASIA = /sandi|password|pin/i

// Nilai isian untuk dikembalikan ke formulir saat galat. Kolom sandi tidak pernah dikembalikan.
export function isianDari(fd: FormData) {
  const isian: Record<string, string> = {}
  for (const [k, v] of fd.entries()) {
    if (k.startsWith('$') || RAHASIA.test(k) || typeof v !== 'string') continue
    isian[k] = isian[k] === undefined ? v : `${isian[k]},${v}`
  }
  return isian
}

export function galatDariZod(e: z.ZodError) {
  const galat: Record<string, string> = {}
  for (const i of e.issues) {
    const k = String(i.path[0] ?? '_')
    if (!galat[k]) galat[k] = i.message
  }
  const jumlah = Object.keys(galat).length
  return { galat, pesan: jumlah === 1 ? Object.values(galat)[0] : `Ada ${jumlah} isian yang perlu diperbaiki.` }
}
