// Pemetaan akun (account_mapping, RANCANGAN prinsip 4). Dokumen tidak pernah memilih akun sendiri: setiap baris jurnal
// menyebut kunci pemetaan, lalu kunci itu diterjemahkan ke akun di sini. Tanpa impor Next.
import type { AccountKind } from '@/generated/prisma/client'
import { GalatAturan } from '../aksi'
import type { DbAtauTx } from '../db'

export type KunciUmum = {
  kunci: string
  nama: string
  // Jenis akun yang wajar untuk kunci ini. Akun dengan jenis lain ditolak saat pemetaan disimpan.
  jenis: AccountKind[]
  keterangan: string
}

// Kunci umum. Urutan ini juga urutan tampil di halaman Pemetaan Akun.
export const KUNCI_UMUM: KunciUmum[] = [
  { kunci: 'kas_laci', nama: 'Kas laci kasir', jenis: ['Aset'], keterangan: 'Penjualan tunai, selisih kas tutup shift, kas masuk dan keluar laci, sumber setoran tunai.' },
  { kunci: 'kas_besar', nama: 'Kas besar', jenis: ['Aset'], keterangan: 'Tujuan setoran tunai yang tidak memilih rekening bank.' },
  { kunci: 'bank', nama: 'Bank (bawaan)', jenis: ['Aset'], keterangan: 'Rekening yang tidak punya pemetaan sendiri.' },
  { kunci: 'kliring', nama: 'Piutang kliring (bawaan)', jenis: ['Aset'], keterangan: 'Metode bayar non tunai yang tidak punya pemetaan sendiri.' },
  { kunci: 'persediaan', nama: 'Persediaan (bawaan)', jenis: ['Aset'], keterangan: 'Lokasi stok yang tidak punya pemetaan sendiri.' },
  { kunci: 'bdp', nama: 'Barang dalam proses', jenis: ['Aset'], keterangan: 'Pengeluaran bahan ke produksi dan hasil produksi.' },
  { kunci: 'ppn_masukan', nama: 'PPN masukan', jenis: ['Aset'], keterangan: 'PPN faktur dan pembelian langsung bila PKP.' },
  { kunci: 'uang_muka_beli', nama: 'Uang muka pembelian', jenis: ['Aset'], keterangan: 'Sisa pembayaran pemasok yang belum dialokasikan.' },
  { kunci: 'hutang_usaha', nama: 'Hutang usaha', jenis: ['Kewajiban'], keterangan: 'Faktur pembelian dan pembelian langsung kredit.' },
  { kunci: 'grni', nama: 'Barang diterima belum difakturkan', jenis: ['Kewajiban'], keterangan: 'Penerimaan barang sampai fakturnya diposting.' },
  { kunci: 'pajak_pb1', nama: 'Pajak PB1 terutang', jenis: ['Kewajiban'], keterangan: 'Pajak restoran dari penjualan kasir.' },
  { kunci: 'saldo_awal', nama: 'Ekuitas saldo awal', jenis: ['Ekuitas'], keterangan: 'Lawan penyesuaian stok beralasan Saldo awal.' },
  { kunci: 'laba_ditahan', nama: 'Laba ditahan', jenis: ['Ekuitas'], keterangan: 'Neraca: laba rugi tahun-tahun sebelumnya ditampilkan di akun ini.' },
  { kunci: 'laba_berjalan', nama: 'Laba tahun berjalan', jenis: ['Ekuitas'], keterangan: 'Neraca: laba rugi tahun ini sampai tanggal neraca ditampilkan di akun ini.' },
  { kunci: 'penjualan', nama: 'Penjualan', jenis: ['Pendapatan'], keterangan: 'Penjualan kotor kasir (sebelum potongan).' },
  { kunci: 'pendapatan_service', nama: 'Pendapatan service', jenis: ['Pendapatan'], keterangan: 'Service charge kasir.' },
  { kunci: 'potongan_penjualan', nama: 'Potongan penjualan', jenis: ['Pendapatan'], keterangan: 'Potongan member di kasir (mengurangi pendapatan).' },
  { kunci: 'hpp', nama: 'HPP penjualan', jenis: ['HPP'], keterangan: 'Nilai bahan resep yang keluar karena penjualan.' },
  { kunci: 'selisih_harga_beli', nama: 'Selisih harga pembelian', jenis: ['HPP'], keterangan: 'Beda harga faktur lawan harga terima.' },
  { kunci: 'selisih_persediaan', nama: 'Selisih persediaan', jenis: ['HPP', 'Beban'], keterangan: 'Penyesuaian dan opname yang alasannya tidak punya pemetaan sendiri.' },
  { kunci: 'selisih_produksi', nama: 'Selisih produksi', jenis: ['HPP', 'Beban'], keterangan: 'Sisa nilai barang dalam proses yang dibuang saat perintah produksi ditutup manual.' },
  { kunci: 'biaya_produksi', nama: 'Biaya produksi dibebankan', jenis: ['HPP', 'Beban'], keterangan: 'Biaya tambahan BOM yang masuk ke nilai hasil produksi cepat.' },
  { kunci: 'potongan_beli', nama: 'Potongan pembelian', jenis: ['HPP', 'Pendapatan'], keterangan: 'Potongan di pembayaran pembelian.' },
  { kunci: 'selisih_kas', nama: 'Selisih kas', jenis: ['Beban'], keterangan: 'Selisih tutup shift dan selisih setoran di luar MDR.' },
  { kunci: 'beban_mdr', nama: 'Beban MDR', jenis: ['Beban'], keterangan: 'Potongan MDR saat setoran non tunai.' },
  { kunci: 'beban_bank', nama: 'Beban administrasi bank', jenis: ['Beban'], keterangan: 'Biaya bank di pembayaran pembelian.' },
  { kunci: 'beban_beli', nama: 'Beban pembelian non stok', jenis: ['Beban', 'HPP'], keterangan: 'Baris jasa faktur pembelian dan baris hanya biaya pembelian langsung.' },
  { kunci: 'laci_masuk', nama: 'Asal kas masuk laci', jenis: ['Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan'], keterangan: 'Lawan kas masuk laci di luar penjualan (misalnya uang receh dari kas besar).' },
  { kunci: 'laci_keluar', nama: 'Tujuan kas keluar laci', jenis: ['Beban', 'Aset', 'HPP'], keterangan: 'Lawan kas keluar laci (misalnya beli es atau belanja kecil).' },
]

export const KUNCI_PER_KODE = new Map(KUNCI_UMUM.map((k) => [k.kunci, k]))

// Kunci turunan per entitas. Bila kosong, kunci umumnya yang dipakai.
export const TURUNAN = {
  kliring: { awalan: 'kliring', nama: 'Metode bayar', jenis: ['Aset'] as AccountKind[] },
  bank: { awalan: 'bank', nama: 'Rekening bank', jenis: ['Aset'] as AccountKind[] },
  persediaan: { awalan: 'persediaan', nama: 'Lokasi stok', jenis: ['Aset'] as AccountKind[] },
  alasan: { awalan: 'alasan', nama: 'Alasan penyesuaian', jenis: ['HPP', 'Beban', 'Ekuitas', 'Pendapatan'] as AccountKind[] },
} as const

export const kunciKliring = (metodeId: number) => [`kliring.${metodeId}`, 'kliring']
export const kunciBank = (rekeningId: number) => [`bank.${rekeningId}`, 'bank']
export const kunciPersediaan = (lokasiId: number) => [`persediaan.${lokasiId}`, 'persediaan']
// Alasan Saldo awal (kode sistem) jatuh ke ekuitas saldo awal; alasan lain ke selisih persediaan.
export const kunciAlasan = (alasan: { id: number; code: string | null } | null) =>
  alasan ? [`alasan.${alasan.id}`, ...(alasan.code === 'saldo_awal' ? ['saldo_awal'] : []), 'selisih_persediaan'] : ['selisih_persediaan']

// Kunci sah: kunci umum atau turunan dengan id angka.
export function kunciSah(kunci: string) {
  if (KUNCI_PER_KODE.has(kunci)) return true
  const [awalan, id, ...lebih] = kunci.split('.')
  return !lebih.length && awalan in TURUNAN && /^[1-9]\d{0,9}$/.test(id ?? '')
}

export function jenisUntukKunci(kunci: string): AccountKind[] {
  const umum = KUNCI_PER_KODE.get(kunci)
  if (umum) return umum.jenis
  const awalan = kunci.split('.')[0] as keyof typeof TURUNAN
  return TURUNAN[awalan]?.jenis ?? []
}

export type AkunTerpakai = { id: number; code: string; name: string; kind: AccountKind }

// Penerjemah kunci ke akun dengan cache per transaksi. Kunci berupa array dicoba berurutan; yang pertama punya
// pemetaan dipakai. Akun harus aktif dan bisa diposting.
export function pembacaAkun(tx: DbAtauTx) {
  const cache = new Map<string, AkunTerpakai | null>()
  const ambilKunci = async (kunci: string) => {
    if (!cache.has(kunci)) {
      const m = await tx.accountMapping.findUnique({ where: { key: kunci }, include: { account: { select: { id: true, code: true, name: true, kind: true, active: true, isPostable: true } } } })
      if (m && (!m.account.active || !m.account.isPostable)) throw new GalatAturan(`Akun ${m.account.code} ${m.account.name} untuk pemetaan "${kunci}" nonaktif atau akun induk. Owner perlu memperbaiki Pemetaan Akun.`)
      cache.set(kunci, m ? { id: m.account.id, code: m.account.code, name: m.account.name, kind: m.account.kind } : null)
    }
    return cache.get(kunci)!
  }
  const akunId = new Map<number, AkunTerpakai>()
  return async (akun: number | string | string[]): Promise<AkunTerpakai> => {
    if (typeof akun === 'number') {
      if (!akunId.has(akun)) {
        const a = await tx.account.findUnique({ where: { id: akun } })
        if (!a) throw new GalatAturan(`Akun ${akun} tidak ditemukan.`)
        if (!a.active || !a.isPostable) throw new GalatAturan(`Akun ${a.code} ${a.name} nonaktif atau akun induk, tidak bisa dijurnal.`)
        akunId.set(akun, { id: a.id, code: a.code, name: a.name, kind: a.kind })
      }
      return akunId.get(akun)!
    }
    const daftar = Array.isArray(akun) ? akun : [akun]
    for (const k of daftar) {
      const a = await ambilKunci(k)
      if (a) return a
    }
    const nama = KUNCI_PER_KODE.get(daftar[daftar.length - 1])?.nama ?? daftar[daftar.length - 1]
    throw new GalatAturan(`Akun untuk "${nama}" belum dipetakan. Minta Owner mengisinya di Akun, tab Pemetaan.`)
  }
}

// Pemetaan bawaan yang bergantung data: kliring per metode QRIS dan Debit. Migrasi tahap5b sudah mengisi bagan akun
// dan kunci umum; fungsi ini dipanggil seed dan skrip bentuk ulang supaya metode yang dibuat sesudah migrasi ikut
// terpetakan. Idempoten: kunci yang sudah ada tidak diubah.
export async function pasangBawaanAkuntansi(db: DbAtauTx) {
  const akun = new Map((await db.account.findMany({ where: { code: { in: ['1-1410', '1-1420'] } }, select: { id: true, code: true } })).map((a) => [a.code, a.id]))
  const metode = await db.paymentMethod.findMany({ where: { kind: { in: ['qris', 'debit'] } }, select: { id: true, kind: true } })
  let baru = 0
  for (const m of metode) {
    const id = akun.get(m.kind === 'qris' ? '1-1410' : '1-1420')
    if (!id) continue
    const r = await db.accountMapping.createMany({ data: [{ key: `kliring.${m.id}`, accountId: id }], skipDuplicates: true })
    baru += r.count
  }
  return baru
}
