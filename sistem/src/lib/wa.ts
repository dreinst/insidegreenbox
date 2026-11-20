// Nomor WhatsApp member. Tanpa impor apa pun, jadi dipakai bersama oleh modul member, pencarian member di kasir,
// layar kasir (klien), skrip seed, dan tes.

// Nomor WhatsApp ke format 62: "0812-3456-0001", "+62 812 3456 0001", dan "812..." semuanya menjadi 62812...
// Hanya nomor seluler Indonesia (62 8xx, 11 sampai 14 angka) yang diterima. Hasil null berarti tidak sah.
export function normalisasiWa(masukan: string): string | null {
  let d = masukan.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('0')) d = `62${d.slice(1)}`
  else if (d.startsWith('8')) d = `62${d}`
  return /^628\d{8,11}$/.test(d) ? d : null
}

// Tampilan nomor yang mudah dibaca: 62 812-3456-0001.
export function formatWa(wa: string) {
  const s = wa.replace(/^62/, '')
  return `+62 ${s.slice(0, 3)}-${s.slice(3, 7)}-${s.slice(7)}`
}
