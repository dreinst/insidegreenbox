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

// Keputusan pemilik 24 November 2026 (KONTRAK 11 butir 155): bagian tunai dibulatkan ke Rp 500 terdekat, setengah ke
// atas (32.240 menjadi 32.000, 32.250 dan 32.340 menjadi 32.500). Non tunai tetap pas.
export const PEMBULATAN_TUNAI = 500
export const bulatTunai = (n: number) => Math.floor((n + PEMBULATAN_TUNAI / 2) / PEMBULATAN_TUNAI) * PEMBULATAN_TUNAI

// Pratinjau layar kasir: sisa yang harus dibayar tunai sesudah non tunai, beserta pembulatannya. Tanpa baris tunai
// (atau bila non tunai sudah menutup total) tidak ada pembulatan.
export function sisaTunaiBulat(total: number, nonTunai: number, adaTunai: boolean) {
  const sisa = Math.max(0, total - nonTunai)
  const bulat = adaTunai && sisa > 0 ? bulatTunai(sisa) : sisa
  return { sisa, bulat, pembulatan: bulat - sisa }
}

// Membagi pembayaran ke total. Non tunai dicatat sebesar jumlahnya dan tidak boleh melebihi total.
// Tunai menutup sisa yang sudah dibulatkan ke Rp 500; kelebihannya menjadi kembalian. amount = bagian yang masuk ke
// penjualan, jadi jumlah amount = total + pembulatan.
export function bagiBayar(total: number, bayar: MasukanBayar[]): { ok: true; baris: HasilBayar[]; kembalian: number; pembulatan: number } | { ok: false; pesan: string } {
  const isi = bayar.filter((b) => b.jumlah > 0)
  const ids = new Set<number>()
  for (const b of isi) {
    if (ids.has(b.metodeId)) return { ok: false, pesan: `Metode ${b.nama ?? 'bayar'} dipilih dua kali.` }
    ids.add(b.metodeId)
  }
  if (total <= 0) return isi.length ? { ok: false, pesan: 'Total nol, tidak perlu pembayaran.' } : { ok: true, baris: [], kembalian: 0, pembulatan: 0 }
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
    const harus = bulatTunai(sisa)
    // Sisa di bawah Rp 250 dibulatkan menjadi 0, jadi tidak ada uang tunai yang bisa diterima.
    if (harus === 0) return { ok: false, pesan: `Sisa ${rupiah(sisa)} dibulatkan menjadi Rp 0 kalau dibayar tunai. Bayar sisa itu dengan non tunai, atau hapus pembayaran tunai.` }
    const t = tunai[0]
    if (t.jumlah < harus) return { ok: false, pesan: `Uang diterima kurang Rp ${(harus - t.jumlah).toLocaleString('id-ID')}.` }
    baris.push({ metodeId: t.metodeId, tunai: true, amount: harus, paid: t.jumlah, change: t.jumlah - harus })
    return { ok: true, baris, kembalian: t.jumlah - harus, pembulatan: harus - sisa }
  }
  if (sisa > 0) return { ok: false, pesan: `Pembayaran kurang Rp ${sisa.toLocaleString('id-ID')}.` }
  return { ok: true, baris, kembalian: 0, pembulatan: 0 }
}

// Kas seharusnya di laci = modal awal + penjualan tunai yang tidak void (sudah bersih dari kembalian dan sudah
// dibulatkan) + kas masuk laci - kas keluar laci (RANCANGAN 6.1).
export function kasSeharusnya(modal: number, tunaiPenjualan: number, kasMasuk: number, kasKeluar: number) {
  return modal + tunaiPenjualan + kasMasuk - kasKeluar
}

// Panjang alasan paling pendek untuk selisih kas tutup shift (KONTRAK 11 butir 121).
export const ALASAN_SELISIH_MIN = 3

export const PECAHAN = [100000, 50000, 20000, 10000, 5000, 2000, 1000, 500, 200, 100] as const

export const totalPecahan = (jumlah: Partial<Record<number, number>>) => PECAHAN.reduce((a, p) => a + p * (jumlah[p] ?? 0), 0)

// Baris keranjang berisi menu biasa atau paket set (admin lama: SaleLine kind 'item' atau 'set').
// Paket sudah berharga khusus, jadi tidak kena potongan member; menu biasa kena. Dipakai layar kasir dan server.
export type JenisBaris = 'menu' | 'paket'
export const kenaPotonganMember = (jenis: JenisBaris) => jenis === 'menu'

export function hitungKeranjang(baris: { harga: number; qty: number; jenis: JenisBaris }[], persenMember: number, biaya: Biaya) {
  return hitungTotal(
    baris.map((b) => ({ harga: b.harga, qty: b.qty, reguler: kenaPotonganMember(b.jenis) })),
    persenMember,
    biaya,
  )
}

export const rupiah = (n: number | bigint) => `Rp ${Number(n).toLocaleString('id-ID')}`
