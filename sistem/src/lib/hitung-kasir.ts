// Hitungan kasir tanpa impor apa pun, dipakai layar kasir (klien), aksi server, dan tes.
// Aturannya sama dengan admin lama (src/admin/hitung.ts): uang rupiah bulat, persen dibulatkan Math.round,
// potongan member hanya untuk baris reguler, service dari harga sesudah potongan, pajak dari harga sesudah
// potongan ditambah service.

export type BarisHitung = { harga: number; qty: number; reguler: boolean }
export type Biaya = { pajak: number; service: number }

export const persen = (n: number, p: number) => Math.round((n * p) / 100)

export function hitungTotal(baris: BarisHitung[], persenMember: number, biaya: Biaya) {
  const sub = baris.reduce((a, b) => a + b.harga * b.qty, 0)
  const subReguler = baris.reduce((a, b) => a + (b.reguler ? b.harga * b.qty : 0), 0)
  const disc = persen(subReguler, persenMember)
  const net = sub - disc
  const svc = persen(net, biaya.service)
  const tax = persen(net + svc, biaya.pajak)
  return { sub, disc, net, svc, tax, total: net + svc + tax }
}

export const kembalian = (total: number, dibayar: number) => Math.max(0, dibayar - total)

export type MasukanBayar = { metodeId: number; tunai: boolean; jumlah: number; nama?: string }
export type HasilBayar = { metodeId: number; tunai: boolean; amount: number; paid: number; change: number }

// Membagi pembayaran ke total. Non tunai dicatat sebesar jumlahnya dan tidak boleh melebihi total.
// Tunai menutup sisa; kelebihannya menjadi kembalian. amount = bagian yang masuk ke penjualan.
export function bagiBayar(total: number, bayar: MasukanBayar[]): { ok: true; baris: HasilBayar[]; kembalian: number } | { ok: false; pesan: string } {
  const isi = bayar.filter((b) => b.jumlah > 0)
  const ids = new Set<number>()
  for (const b of isi) {
    if (ids.has(b.metodeId)) return { ok: false, pesan: `Metode ${b.nama ?? 'bayar'} dipilih dua kali.` }
    ids.add(b.metodeId)
  }
  if (total <= 0) return isi.length ? { ok: false, pesan: 'Total nol, tidak perlu pembayaran.' } : { ok: true, baris: [], kembalian: 0 }
  if (!isi.length) return { ok: false, pesan: 'Isi pembayaran dulu.' }
  const tunai = isi.filter((b) => b.tunai)
  if (tunai.length > 1) return { ok: false, pesan: 'Pembayaran tunai hanya boleh satu baris.' }
  const nonTunai = isi.filter((b) => !b.tunai)
  const jumlahNonTunai = nonTunai.reduce((a, b) => a + b.jumlah, 0)
  if (jumlahNonTunai > total) return { ok: false, pesan: 'Pembayaran non tunai melebihi total.' }
  const sisa = total - jumlahNonTunai
  const baris: HasilBayar[] = nonTunai.map((b) => ({ metodeId: b.metodeId, tunai: false, amount: b.jumlah, paid: b.jumlah, change: 0 }))
  if (tunai.length) {
    if (sisa === 0) return { ok: false, pesan: 'Non tunai sudah menutup total, hapus pembayaran tunai.' }
    const t = tunai[0]
    if (t.jumlah < sisa) return { ok: false, pesan: `Uang diterima kurang Rp ${(sisa - t.jumlah).toLocaleString('id-ID')}.` }
    baris.push({ metodeId: t.metodeId, tunai: true, amount: sisa, paid: t.jumlah, change: t.jumlah - sisa })
    return { ok: true, baris, kembalian: t.jumlah - sisa }
  }
  if (sisa > 0) return { ok: false, pesan: `Pembayaran kurang Rp ${sisa.toLocaleString('id-ID')}.` }
  return { ok: true, baris, kembalian: 0 }
}

// Kas seharusnya di laci = modal awal + penjualan tunai yang tidak void (sudah bersih dari kembalian)
// + kas masuk laci - kas keluar laci (RANCANGAN 6.1).
export function kasSeharusnya(modal: number, tunaiPenjualan: number, kasMasuk: number, kasKeluar: number) {
  return modal + tunaiPenjualan + kasMasuk - kasKeluar
}

// Batas selisih dari saklar pos.batas_selisih_kas peran kasir pemilik shift (KONTRAK 11).
// Saklar mati: setiap selisih perlu persetujuan. Saklar nyala tanpa batas: tidak pernah perlu persetujuan.
export function perluPersetujuan(selisih: number, saklar: { nyala: boolean; batas: number | null } | undefined) {
  if (selisih === 0) return false
  if (!saklar?.nyala) return true
  if (saklar.batas === null) return false
  return Math.abs(selisih) > saklar.batas
}

export const PECAHAN = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100] as const

export const totalPecahan = (jumlah: Partial<Record<number, number>>) => PECAHAN.reduce((a, p) => a + p * (jumlah[p] ?? 0), 0)

// Tingkat member: tingkat yang dipasang di member, atau tingkat dengan min kunjungan tertinggi yang sudah dicapai,
// atau tingkat pertama. Potongan 0 bila potongan member dimatikan (admin lama: discountOf dan tierOf).
export function persenMember(
  m: { visits: number; discountOn: boolean; tierId: number | null },
  tingkat: { id: number; minVisits: number; discountPct: number }[],
) {
  const t = tingkatMember(m, tingkat)
  return m.discountOn && t ? t.discountPct : 0
}

export function tingkatMember<T extends { id: number; minVisits: number }>(m: { visits: number; tierId: number | null }, tingkat: T[]) {
  if (m.tierId !== null) {
    const t = tingkat.find((x) => x.id === m.tierId)
    if (t) return t
  }
  const urut = [...tingkat].sort((a, b) => b.minVisits - a.minVisits)
  return urut.find((t) => m.visits >= t.minVisits) ?? [...tingkat].sort((a, b) => a.minVisits - b.minVisits)[0]
}

export const angkaWa = (wa: string) => wa.replace(/\D/g, '').replace(/^62/, '0')

export const rupiah = (n: number | bigint) => `Rp ${Number(n).toLocaleString('id-ID')}`
