// Waktu Greenbox memakai zona Asia/Jakarta (WIB).
export const ZONA = 'Asia/Jakarta'

const bagian = (d: Date) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d)
  const ambil = (t: string) => p.find((x) => x.type === t)!.value
  return { y: ambil('year'), m: ambil('month'), d: ambil('day') }
}

// YYMM untuk nomor dokumen.
export const periodeYYMM = (d: Date) => {
  const { y, m } = bagian(d)
  return y.slice(2) + m
}

// YYYY-MM-DD di WIB.
export const tanggalIso = (d: Date) => {
  const { y, m, d: h } = bagian(d)
  return `${y}-${m}-${h}`
}

// Awal dan akhir hari WIB dari teks YYYY-MM-DD, untuk saringan tanggal.
export const awalHari = (iso: string) => new Date(`${iso}T00:00:00+07:00`)
export const akhirHari = (iso: string) => new Date(`${iso}T23:59:59.999+07:00`)

export const formatWaktu = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat('id-ID', { timeZone: ZONA, dateStyle: 'medium', timeStyle: 'short' }).format(d) : '-'
