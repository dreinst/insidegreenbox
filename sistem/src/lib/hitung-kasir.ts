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

// Promo otomatis (KONTRAK 11 butir 160). Promo yang berlaku hari itu dikirim server ke layar kasir dan dibaca ulang
// server saat simpan. Persen dan nominal memotong baris menu biasa saja (paket tidak kena, sama dengan potongan member,
// karena data promo tidak punya kolom yang menunjuk paket). Hadiah menambah satu baris menu gratis.
export type PromoKasir = {
  id: number
  nama: string
  jenis: 'persen' | 'nominal' | 'hadiah'
  persen: number
  nominal: number
  minBelanja: number
  syarat: string
  hadiah: { menuItemId: number; nama: string; harga: number } | null
}

// Nilai promo untuk pembeli: rupiah potongan, atau harga normal menu hadiah. 0 berarti tidak berlaku untuk keranjang ini.
// Belanja minimal dibandingkan dengan subtotal semua baris sebelum potongan.
export function nilaiPromo(p: PromoKasir, sub: number, subReguler: number) {
  if (sub <= 0 || sub < p.minBelanja) return 0
  if (p.jenis === 'persen') return persen(subReguler, p.persen)
  if (p.jenis === 'nominal') return Math.min(p.nominal, subReguler)
  return p.hadiah ? p.hadiah.harga : 0
}

export type HasilKeranjang = ReturnType<typeof hitungTotal> & {
  // Bagian dari disc yang berasal dari promo (0 bila potongan member yang dipakai atau promo hadiah).
  discPromo: number
  // Persen member yang benar-benar dipakai (0 bila promo yang menang).
  pctMember: number
  promo: PromoKasir | null
  hadiah: PromoKasir['hadiah']
  nilaiMember: number
  nilaiPromo: number
  alasan: string
}

// Promo tidak digabung dengan potongan member: sistem memilih yang lebih besar untuk pembeli per transaksi. Di antara
// beberapa promo yang berlaku, yang nilainya paling besar menang; bila sama, id terkecil. Seri dengan potongan member
// dimenangkan potongan member.
export function hitungKeranjang(baris: { harga: number; qty: number; jenis: JenisBaris }[], persenMember: number, biaya: Biaya, promo: PromoKasir[] = []): HasilKeranjang {
  const reguler = baris.map((b) => ({ harga: b.harga, qty: b.qty, reguler: kenaPotonganMember(b.jenis) }))
  const sub = reguler.reduce((a, b) => a + b.harga * b.qty, 0)
  const subReguler = reguler.reduce((a, b) => a + (b.reguler ? b.harga * b.qty : 0), 0)
  const nilaiMember = persen(subReguler, persenMember)
  let terbaik: { p: PromoKasir; n: number } | null = null
  for (const p of [...promo].sort((a, b) => a.id - b.id)) {
    const n = nilaiPromo(p, sub, subReguler)
    if (n > 0 && (!terbaik || n > terbaik.n)) terbaik = { p, n }
  }
  const pakaiPromo = !!terbaik && terbaik.n > nilaiMember
  const discPromo = pakaiPromo && terbaik!.p.jenis !== 'hadiah' ? terbaik!.n : 0
  const pctMember = pakaiPromo ? 0 : persenMember
  const t = hitungTotal(reguler, pctMember, biaya)
  const disc = t.disc + discPromo
  const net = t.sub - disc
  const svc = persen(net, biaya.service)
  const tax = persen(net + svc, biaya.pajak)
  let alasan = ''
  if (terbaik && nilaiMember > 0) {
    alasan = pakaiPromo
      ? `Promo ${terbaik.p.nama} (${rupiah(terbaik.n)}) lebih besar dari potongan member (${rupiah(nilaiMember)}), jadi promo yang dipakai. Promo tidak digabung dengan potongan member.`
      : `Potongan member (${rupiah(nilaiMember)}) ${nilaiMember === terbaik.n ? 'sama dengan' : 'lebih besar dari'} promo ${terbaik.p.nama} (${rupiah(terbaik.n)}), jadi potongan member yang dipakai. Promo tidak digabung dengan potongan member.`
  }
  return {
    sub,
    disc,
    net,
    svc,
    tax,
    total: net + svc + tax,
    discPromo,
    pctMember,
    promo: pakaiPromo ? terbaik!.p : null,
    hadiah: pakaiPromo && terbaik!.p.jenis === 'hadiah' ? terbaik!.p.hadiah : null,
    nilaiMember,
    nilaiPromo: terbaik?.n ?? 0,
    alasan,
  }
}

// Label promo untuk layar, struk, dan rincian: "Promo Hemat 10%", "Promo Potong 5rb", "Hadiah promo Gratis Teh".
export const labelPromo = (p: Pick<PromoKasir, 'nama' | 'jenis' | 'persen'>) => (p.jenis === 'persen' ? `Promo ${p.nama} ${p.persen.toLocaleString('id-ID')}%` : `Promo ${p.nama}`)

export const rupiah = (n: number | bigint) => `Rp ${Number(n).toLocaleString('id-ID')}`
