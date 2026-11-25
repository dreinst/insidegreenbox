// Katalog menu izin, matriks bawaan, saklar fitur, dan sidebar (KONTRAK bagian 4 dan 8).
// Sumber: RANCANGAN-greenbox.md 8.2 (matriks) dan 8.3 (saklar). Berkas ini tidak mengimpor Next,
// jadi bisa dipakai seed, tes, dan halaman.

export const AKSI = ['L', 'T', 'U', 'H', 'S', 'P'] as const
export type Aksi = (typeof AKSI)[number]

export const NAMA_AKSI: Record<Aksi, string> = {
  L: 'Lihat',
  T: 'Tambah',
  U: 'Ubah',
  H: 'Hapus',
  S: 'Setujui',
  P: 'Posting',
}

// Kolom role_permission untuk tiap aksi.
export const KOLOM_AKSI = {
  L: 'canView',
  T: 'canCreate',
  U: 'canUpdate',
  H: 'canDelete',
  S: 'canApprove',
  P: 'canPost',
} as const satisfies Record<Aksi, string>

export type KodePeranSistem = 'owner' | 'admin' | 'kasir'

export type MenuIzin = {
  kode: string
  grup: string
  nama: string
  // Aksi yang berlaku untuk menu ini, sama dengan aksi Owner di matriks RANCANGAN 8.2.
  aksi: string
  bawaan: Record<KodePeranSistem, string>
}

// [kode, grup, nama, owner, admin, kasir]. Strip (-) artinya tanpa akses.
const BARIS: [string, string, string, string, string, string][] = [
  ['kasir.layar', 'Kasir', 'Layar kasir', 'LT', 'LT', 'LT'],
  ['kasir.shift', 'Kasir', 'Shift kasir', 'LTUS', 'LTU', 'LTU'],
  ['kasir.transaksi', 'Kasir', 'Transaksi dan void', 'LU', 'LU', 'L'],
  ['kasir.setoran', 'Kasir', 'Setoran POS', 'LTUHSP', 'LTUHP', '-'],
  ['menu.menu', 'Menu', 'Menu, kategori, harga', 'LTUH', 'LU', 'L'],
  ['menu.promo', 'Menu', 'Promo', 'LTUHS', 'L', '-'],
  ['menu.member', 'Menu', 'Member dan tingkat', 'LTUH', 'LTU', 'LT'],
  // tahap 3A: tingkat Greenbox Key dipisah dari member supaya Kasir bisa mendaftarkan member tanpa mengatur potongan (KONTRAK 11).
  ['menu.tingkat', 'Menu', 'Tingkat member (Greenbox Key)', 'LTUH', 'LTU', 'L'],
  ['stok.produk', 'Persediaan', 'Produk dan satuan', 'LTUH', 'LTU', '-'],
  ['stok.resep', 'Persediaan', 'Resep dan BOM', 'LTUH', 'LTU', '-'],
  ['stok.saldo', 'Persediaan', 'Stok dan kartu stok', 'L', 'L', '-'],
  ['stok.penyesuaian', 'Persediaan', 'Penyesuaian stok', 'LTUHSP', 'LTUHP', '-'],
  ['stok.opname', 'Persediaan', 'Stock opname', 'LTUHSP', 'LTUH', '-'],
  ['stok.pindah', 'Persediaan', 'Pindah stok', 'LTUHP', 'LTUHP', '-'],
  ['stok.alasan', 'Persediaan', 'Alasan penyesuaian', 'LTUH', 'L', '-'],
  ['beli.pemasok', 'Pembelian', 'Pemasok', 'LTUH', 'LTU', '-'],
  ['beli.permintaan', 'Pembelian', 'Permintaan pembelian', 'LTUHS', 'LTUHS', '-'],
  ['beli.pesanan', 'Pembelian', 'Pesanan pembelian', 'LTUHS', 'LTUH', '-'],
  ['beli.penerimaan', 'Pembelian', 'Penerimaan barang', 'LTUHSP', 'LTUHP', '-'],
  ['beli.faktur', 'Pembelian', 'Faktur pembelian', 'LTUHSP', 'LTUHP', '-'],
  ['beli.retur', 'Pembelian', 'Retur pembelian', 'LTUHSP', 'LTUH', '-'],
  ['beli.langsung', 'Pembelian', 'Pembelian langsung', 'LTUHSP', 'LTUHP', '-'],
  ['beli.pembayaran', 'Pembelian', 'Pembayaran pembelian', 'LTUHSP', 'LTUH', '-'],
  ['produksi.perintah', 'Produksi', 'Perintah produksi', 'LTUHS', 'LTUHS', '-'],
  ['produksi.pengeluaran', 'Produksi', 'Pengeluaran bahan', 'LTUHSP', 'LTUHP', '-'],
  ['produksi.hasil', 'Produksi', 'Hasil produksi', 'LTUHSP', 'LTUHP', '-'],
  ['produksi.cepat', 'Produksi', 'Produksi cepat', 'LTUHSP', 'LTUHP', '-'],
  ['kas.transaksi', 'Keuangan', 'Kas masuk dan keluar', 'LTUHSP', 'LTUH', '-'],
  ['kas.pindah', 'Keuangan', 'Pindah dana', 'LTUHSP', '-', '-'],
  ['kas.rekening', 'Keuangan', 'Rekening bank', 'LTUH', 'L', '-'],
  ['kas.rekonsiliasi', 'Keuangan', 'Rekonsiliasi bank', 'LTUHSP', '-', '-'],
  ['kas.hutang', 'Keuangan', 'Hutang pemasok', 'L', 'L', '-'],
  ['akun.coa', 'Akuntansi', 'Akun (COA) dan pemetaan akun', 'LTUH', 'L', '-'],
  ['akun.metode_bayar', 'Akuntansi', 'Metode bayar', 'LTUH', 'LU', '-'],
  ['akun.jurnal', 'Akuntansi', 'Jurnal umum', 'LTUHSP', '-', '-'],
  ['akun.buku_besar', 'Akuntansi', 'Buku besar', 'L', '-', '-'],
  ['akun.tutup_periode', 'Akuntansi', 'Tutup periode', 'LTH', '-', '-'],
  ['b2b.pelanggan', 'Penjualan B2B', 'Pelanggan', 'LTUH', 'LTU', '-'],
  ['b2b.pesanan', 'Penjualan B2B', 'Pesanan penjualan', 'LTUHS', 'LTUH', '-'],
  ['b2b.faktur', 'Penjualan B2B', 'Faktur penjualan', 'LTUHSP', 'LTUH', '-'],
  ['b2b.penerimaan', 'Penjualan B2B', 'Penerimaan pelanggan', 'LTUHSP', 'LTUH', '-'],
  ['b2b.retur', 'Penjualan B2B', 'Retur penjualan', 'LTUHSP', 'LTUH', '-'],
  ['aset.daftar', 'Aset dan anggaran', 'Daftar aset', 'LTUHS', 'L', '-'],
  ['aset.penyusutan', 'Aset dan anggaran', 'Penyusutan dan pelepasan', 'LTHP', '-', '-'],
  ['anggaran.anggaran', 'Aset dan anggaran', 'Anggaran dan realisasi', 'LTUHS', 'L', '-'],
  ['laporan.penjualan', 'Laporan', 'Penjualan dan POS', 'L', 'L', '-'],
  ['laporan.persediaan', 'Laporan', 'Persediaan, pembelian, produksi', 'L', 'L', '-'],
  ['laporan.keuangan', 'Laporan', 'Keuangan dan akuntansi', 'L', '-', '-'],
  // RANCANGAN punya satu baris "Pengguna, peran, izin, saklar" (L T U H). Dipecah tiga (KONTRAK 4.3).
  // Pengguna dan peran tidak pernah dihapus (hanya dinonaktifkan), saklar tidak ditambah dari layar,
  // jadi aksi Hapus dan Tambah yang tidak punya arti tidak dibuat.
  ['atur.pengguna', 'Pengaturan', 'Pengguna', 'LTU', '-', '-'],
  ['atur.peran', 'Pengaturan', 'Peran dan izin', 'LTU', '-', '-'],
  ['atur.saklar', 'Pengaturan', 'Saklar fitur', 'LU', '-', '-'],
  ['atur.lokasi', 'Pengaturan', 'Lokasi dan profil usaha', 'LTU', 'L', '-'],
  // Admin hanya melihat aktivitasnya sendiri karena saklar log.lihat_semua miliknya mati.
  ['atur.audit', 'Pengaturan', 'Jejak audit', 'L', 'L', '-'],
]

// tahap 3B: PIN kasir diatur Owner atau Admin dari menu sendiri, karena Admin tidak memegang atur.pengguna.
// Baris ini tambahan atas RANCANGAN 8.2 (KONTRAK 11).
const BARIS_3B: [string, string, string, string, string, string][] = [['kasir.pin', 'Kasir', 'PIN kasir', 'LU', 'LU', '-']]

// tahap 6A: Piutang Pelanggan (baca saja) dipisah dari b2b.penerimaan seperti Hutang Pemasok (kas.hutang). Baris ini
// tambahan atas RANCANGAN 8.2 (KONTRAK 11).
const BARIS_6A: [string, string, string, string, string, string][] = [['kas.piutang', 'Keuangan', 'Piutang pelanggan', 'L', 'L', '-']]

// Keputusan pemilik 24 November 2026: halaman Aturan Persetujuan (approval_rule) hanya untuk Owner. Baris ini tambahan
// atas RANCANGAN 8.2 (KONTRAK 11 butir 156). Tidak ada Tambah dan Hapus karena baris aturan tidak ditambah atau dihapus
// dari layar.
const BARIS_KPT: [string, string, string, string, string, string][] = [['atur.persetujuan', 'Pengaturan', 'Aturan persetujuan', 'LU', '-', '-']]

const bersih = (s: string) => (s === '-' ? '' : s)

export const MENU_IZIN: MenuIzin[] = [...BARIS, ...BARIS_3B, ...BARIS_6A, ...BARIS_KPT].map(([kode, grup, nama, owner, admin, kasir]) => ({
  kode,
  grup,
  nama,
  aksi: owner,
  bawaan: { owner: bersih(owner), admin: bersih(admin), kasir: bersih(kasir) },
}))

export const MENU_PER_KODE = new Map(MENU_IZIN.map((m) => [m.kode, m]))

// Menu yang izinnya tidak boleh hilang dari peran owner (KONTRAK 4.6).
export const MENU_TERKUNCI_OWNER = ['atur.pengguna', 'atur.peran', 'atur.saklar', 'atur.audit', 'atur.persetujuan']
export const SAKLAR_TERKUNCI_OWNER = ['log.lihat_semua']

export type SatuanBatas = 'rupiah' | 'hari' | 'persen'

export type SaklarFitur = {
  kode: string
  nama: string
  keterangan: string
  satuan?: SatuanBatas
  bawaan: Record<KodePeranSistem, { nyala: boolean; batas: number | null }>
}

const Y = (batas: number | null = null) => ({ nyala: true, batas })
const N = (batas: number | null = null) => ({ nyala: false, batas })

// Saklar RANCANGAN 8.3 ditambah log.lihat_semua dan, sejak tahap 4B, pos.jual_stok_minus (KONTRAK 4.4).
// tahap 6C: pos.batas_selisih_kas dihapus karena selisih kas tidak lagi butuh persetujuan Owner (KONTRAK 11 butir 122).
export const SAKLAR: SaklarFitur[] = [
  { kode: 'beli.po_tanpa_pr', nama: 'Pesanan tanpa permintaan', keterangan: 'Pesanan pembelian boleh dibuat tanpa permintaan pembelian.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'beli.ubah_qty_pr', nama: 'Ubah qty permintaan', keterangan: 'Qty di pesanan boleh berbeda dari permintaan.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'beli.ubah_harga_po', nama: 'Ubah harga pesanan', keterangan: 'Harga di pesanan dan penerimaan boleh berbeda dari harga terakhir.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'beli.ubah_harga_faktur', nama: 'Ubah harga faktur', keterangan: 'Harga atau qty faktur boleh berbeda dari penerimaan (qty hanya lebih kecil). Selisih di atas 5% tetap perlu Owner.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'beli.tutup_po', nama: 'Tutup pesanan', keterangan: 'Menutup sisa pesanan pembelian secara manual.', bawaan: { owner: Y(), admin: N(), kasir: N() } },
  { kode: 'beli.po_selesai_otomatis', nama: 'Pesanan selesai otomatis', keterangan: 'Pesanan pembelian Selesai otomatis setelah diterima penuh.', bawaan: { owner: Y(), admin: Y(), kasir: Y() } },
  { kode: 'beli.langsung_tunai', nama: 'Pembelian langsung tunai', keterangan: 'Boleh membuat pembelian langsung dengan cara bayar tunai.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'beli.langsung_kredit', nama: 'Pembelian langsung kredit', keterangan: 'Boleh membuat pembelian langsung dengan cara bayar kredit.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'beli.langsung_biaya', nama: 'Baris hanya biaya', keterangan: 'Pembelian langsung boleh berisi baris biaya yang tidak masuk stok.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'beli.ubah_harga_langsung', nama: 'Ubah harga pembelian langsung', keterangan: 'Harga pembelian langsung boleh berbeda dari harga terakhir melebihi batas persen.', satuan: 'persen', bawaan: { owner: Y(20), admin: N(20), kasir: N(20) } },
  { kode: 'stok.sesuai_kurang', nama: 'Penyesuaian stok kurang', keterangan: 'Mencatat stok berkurang karena rusak atau dibuang.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'stok.sesuai_tambah', nama: 'Penyesuaian stok tambah', keterangan: 'Mencatat stok bertambah lewat penyesuaian.', bawaan: { owner: Y(), admin: N(), kasir: N() } },
  { kode: 'stok.wajib_alasan', nama: 'Alasan wajib', keterangan: 'Alasan wajib diisi di penyesuaian dan opname.', bawaan: { owner: Y(), admin: Y(), kasir: Y() } },
  { kode: 'stok.lihat_nilai', nama: 'Lihat nilai persediaan', keterangan: 'Melihat nilai rupiah persediaan dan HPP.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'produk.ubah_kode_nama', nama: 'Ubah kode dan nama produk', keterangan: 'Mengubah kode atau nama produk yang sudah dipakai transaksi.', bawaan: { owner: Y(), admin: N(), kasir: N() } },
  { kode: 'menu.ubah_hpp', nama: 'Ubah HPP menu', keterangan: 'Mengubah HPP menu secara manual.', bawaan: { owner: Y(), admin: N(), kasir: N() } },
  { kode: 'pos.void', nama: 'Void transaksi', keterangan: 'Membatalkan transaksi kasir. Kasir tanpa saklar ini meminta PIN Admin.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'pos.lihat_void_nonsales', nama: 'Lihat void dan non penjualan', keterangan: 'Melihat transaksi void dan non penjualan di laporan.', bawaan: { owner: Y(), admin: Y(), kasir: N() } },
  { kode: 'dok.tanggal_mundur', nama: 'Tanggal mundur', keterangan: 'Tanggal dokumen boleh mundur sampai batas hari. Batas kosong berarti selama periode masih terbuka.', satuan: 'hari', bawaan: { owner: Y(null), admin: Y(1), kasir: N(0) } },
  { kode: 'dok.batal_posting', nama: 'Batalkan dokumen diposting', keterangan: 'Membatalkan dokumen yang sudah Diposting lewat gerak balik.', bawaan: { owner: Y(), admin: N(), kasir: N() } },
  { kode: 'b2b.ubah_harga', nama: 'Ubah harga jual B2B', keterangan: 'Mengubah harga jual B2B dari daftar harga pelanggan.', bawaan: { owner: Y(), admin: N(), kasir: N() } },
  { kode: 'aset.penyusutan_fiskal', nama: 'Penyusutan fiskal', keterangan: 'Menghitung penyusutan fiskal di samping komersial.', bawaan: { owner: Y(), admin: N(), kasir: N() } },
  { kode: 'log.lihat_semua', nama: 'Lihat semua jejak audit', keterangan: 'Melihat aktivitas semua pengguna di Jejak Audit. Tanpa saklar ini hanya aktivitas sendiri.', bawaan: { owner: Y(), admin: N(), kasir: N() } },
  // tahap 4B: bawaan sementara RANCANGAN 11.2 untuk penjualan saat stok bahan kurang (KONTRAK 11).
  {
    kode: 'pos.jual_stok_minus',
    nama: 'Jual walau stok bahan kurang',
    keterangan: 'Penjualan kasir tetap tersimpan walau stok bahan menurut sistem kurang; stok bahan boleh minus khusus untuk gerak penjualan. Saklar mati: penjualan ditolak kecuali lokasinya mengizinkan stok minus.',
    bawaan: { owner: Y(), admin: Y(), kasir: Y() },
  },
]

export const PERAN_SISTEM: { kode: KodePeranSistem; nama: string }[] = [
  { kode: 'owner', nama: 'Owner' },
  { kode: 'admin', nama: 'Admin' },
  { kode: 'kasir', nama: 'Kasir' },
]

// menu berisi satu kode, beberapa kode (tampil bila salah satunya boleh dilihat), atau null untuk semua pengguna.
// khusus 'menunggu': item Menunggu Persetujuan, tampil bila memegang Setujui di salah satu modul antrean (dihitung di
// layout lewat bolehLihatMenunggu, KONTRAK 11 butir 158). lencana: angka kecil di kanan label.
export type ItemSidebar = { href: string; label: string; menu: string | string[] | null; ikon: string; khusus?: 'menunggu'; lencana?: number }

// Hanya halaman yang sudah dibangun (KONTRAK 8). menu null artinya tampil untuk semua pengguna yang masuk.
// tahap 3B: modul kasir.
const SIDEBAR_KASIR: ItemSidebar[] = [
  { href: '/kasir', label: 'Layar Kasir', menu: 'kasir.layar', ikon: 'kasir' },
  { href: '/shift', label: 'Shift', menu: 'kasir.shift', ikon: 'shift' },
  { href: '/transaksi', label: 'Transaksi', menu: 'kasir.transaksi', ikon: 'transaksi' },
  { href: '/pin', label: 'PIN Kasir', menu: 'kasir.pin', ikon: 'pin' },
]

// laporan dan setoran (tahap 5A). Izinnya sudah ada di matriks RANCANGAN 8.2: kasir.setoran, kas.rekening, dan
// laporan.*. Item Laporan tampil bila minimal satu laporan boleh dilihat; tabnya diatur di halaman laporan.
const SIDEBAR_SETORAN: ItemSidebar[] = [
  { href: '/setoran', label: 'Setoran POS', menu: 'kasir.setoran', ikon: 'setoran' },
  { href: '/laporan', label: 'Laporan', menu: ['laporan.penjualan'], ikon: 'laporan' },
]
const SIDEBAR_REKENING: ItemSidebar[] = [{ href: '/rekening', label: 'Rekening Bank', menu: 'kas.rekening', ikon: 'rekening' }]

// tahap 4C: pembelian dan hutang pemasok. Izinnya sudah ada di matriks RANCANGAN 8.2 (beli.* dan kas.hutang), jadi
// matriks bawaan tidak berubah. Orkestrator memindahkan item ini ke grup Pembelian saat sidebar berkelompok digabung.
const SIDEBAR_BELI: ItemSidebar[] = [
  { href: '/pemasok', label: 'Pemasok', menu: 'beli.pemasok', ikon: 'pemasok' },
  { href: '/permintaan', label: 'Permintaan', menu: 'beli.permintaan', ikon: 'permintaan' },
  { href: '/pesanan', label: 'Pesanan', menu: 'beli.pesanan', ikon: 'pesanan' },
  { href: '/penerimaan', label: 'Penerimaan', menu: 'beli.penerimaan', ikon: 'penerimaan' },
  { href: '/faktur', label: 'Faktur', menu: 'beli.faktur', ikon: 'faktur' },
  { href: '/retur-beli', label: 'Retur', menu: 'beli.retur', ikon: 'retur' },
  { href: '/beli-langsung', label: 'Pembelian Langsung', menu: 'beli.langsung', ikon: 'belanja' },
  { href: '/pembayaran', label: 'Pembayaran', menu: 'beli.pembayaran', ikon: 'pembayaran' },
  { href: '/hutang', label: 'Hutang Pemasok', menu: 'kas.hutang', ikon: 'hutang' },
]

// tahap 6A: penjualan B2B (RANCANGAN 8.2 grup B2B, izinnya sudah ada di matriks) dan piutang pelanggan (kas.piutang).
const SIDEBAR_B2B: ItemSidebar[] = [
  { href: '/pelanggan', label: 'Pelanggan', menu: 'b2b.pelanggan', ikon: 'pelanggan' },
  { href: '/pesanan-jual', label: 'Pesanan Penjualan', menu: 'b2b.pesanan', ikon: 'pesanan' },
  { href: '/faktur-jual', label: 'Faktur Penjualan', menu: 'b2b.faktur', ikon: 'faktur' },
  { href: '/terima-pelanggan', label: 'Terima Pembayaran', menu: 'b2b.penerimaan', ikon: 'pembayaran' },
  { href: '/retur-jual', label: 'Retur Penjualan', menu: 'b2b.retur', ikon: 'retur' },
]
const SIDEBAR_PIUTANG: ItemSidebar = { href: '/piutang', label: 'Piutang Pelanggan', menu: 'kas.piutang', ikon: 'piutang' }

// Item tampil bila pengguna memegang Lihat di kode menunya (KONTRAK 8).
// Item khusus tidak tampil lewat aturan ini; layout memutuskannya sendiri.
export const itemTampil = (i: ItemSidebar, boleh: (menu: string) => boolean) => !i.khusus && (i.menu === null || (Array.isArray(i.menu) ? i.menu.some(boleh) : boleh(i.menu)))

// tahap 4B: sidebar dikelompokkan dengan judul grup supaya lebih dari 20 item mudah dipindai. Grup tanpa item yang boleh
// dilihat tidak ditampilkan. judul null berarti tanpa judul (Beranda).
export type GrupSidebar = { judul: string | null; item: ItemSidebar[] }

export const SIDEBAR_GRUP: GrupSidebar[] = [
  {
    judul: null,
    item: [
      { href: '/', label: 'Beranda', menu: null, ikon: 'beranda' },
      // KONTRAK 11 butir 158: antrean dokumen yang menunggu persetujuan atau posting.
      { href: '/menunggu-persetujuan', label: 'Perlu Disetujui', menu: null, ikon: 'menunggu', khusus: 'menunggu' },
    ],
  },
  // tahap 3B dan 3A: kasir dan metode bayarnya.
  // tahap 5A: Setoran POS di grup Kasir.
  { judul: 'Kasir', item: [...SIDEBAR_KASIR, SIDEBAR_SETORAN[0], { href: '/metode-bayar', label: 'Metode Bayar', menu: 'akun.metode_bayar', ikon: 'bayar' }] },
  // tahap 3A: modul master menu.
  {
    judul: 'Menu',
    item: [
      { href: '/menu', label: 'Menu dan Harga', menu: 'menu.menu', ikon: 'hidangan' },
      { href: '/promo', label: 'Promo', menu: 'menu.promo', ikon: 'promo' },
      { href: '/member', label: 'Member', menu: 'menu.member', ikon: 'member' },
    ],
  },
  // tahap 4A: persediaan (urutan KONTRAK bagian 8).
  {
    judul: 'Persediaan',
    item: [
      { href: '/produk', label: 'Produk dan Satuan', menu: 'stok.produk', ikon: 'produk' },
      // tahap 4B
      { href: '/resep', label: 'Resep dan BOM', menu: 'stok.resep', ikon: 'resep' },
      { href: '/stok', label: 'Stok', menu: 'stok.saldo', ikon: 'stok' },
      { href: '/penyesuaian', label: 'Penyesuaian', menu: 'stok.penyesuaian', ikon: 'penyesuaian' },
      { href: '/opname', label: 'Opname', menu: 'stok.opname', ikon: 'opname' },
      { href: '/pindah-stok', label: 'Pindah Stok', menu: 'stok.pindah', ikon: 'pindah' },
      { href: '/alasan-stok', label: 'Alasan', menu: 'stok.alasan', ikon: 'alasan' },
    ],
  },
  // tahap 4B: produksi (RANCANGAN 5).
  {
    judul: 'Produksi',
    item: [
      { href: '/perintah-produksi', label: 'Perintah Produksi', menu: 'produksi.perintah', ikon: 'perintah' },
      { href: '/pengeluaran-bahan', label: 'Pengeluaran Bahan', menu: 'produksi.pengeluaran', ikon: 'pengeluaran' },
      { href: '/hasil-produksi', label: 'Hasil Produksi', menu: 'produksi.hasil', ikon: 'hasil' },
      { href: '/produksi-cepat', label: 'Produksi Cepat', menu: 'produksi.cepat', ikon: 'cepat' },
    ],
  },
  // tahap 4C: pembelian (RANCANGAN 3); Hutang Pemasok di grup Keuangan.
  { judul: 'Pembelian', item: SIDEBAR_BELI.filter((i) => i.href !== '/hutang') },
  // tahap 6A: penjualan B2B sesudah Pembelian; Piutang Pelanggan di grup Keuangan.
  { judul: 'Penjualan B2B', item: SIDEBAR_B2B },
  // tahap 5A: rekening bank dan laporan penjualan.
  // tahap 5C: kas masuk dan keluar, pindah dana, dan rekonsiliasi bank (RANCANGAN 7 dan 8.2).
  {
    judul: 'Keuangan',
    item: [
      { href: '/kas', label: 'Kas Masuk/Keluar', menu: 'kas.transaksi', ikon: 'kas' },
      { href: '/pindah-dana', label: 'Pindah Dana', menu: 'kas.pindah', ikon: 'pindahdana' },
      { href: '/rekonsiliasi', label: 'Rekonsiliasi Bank', menu: 'kas.rekonsiliasi', ikon: 'rekonsiliasi' },
      ...SIDEBAR_REKENING,
      ...SIDEBAR_BELI.filter((i) => i.href === '/hutang'),
      SIDEBAR_PIUTANG,
    ],
  },
  // tahap 5B: akuntansi inti (RANCANGAN 8.2). Admin hanya melihat Akun dan Pemetaan; sisanya Owner.
  {
    judul: 'Akuntansi',
    item: [
      { href: '/akun', label: 'Akun dan Pemetaan', menu: 'akun.coa', ikon: 'akun' },
      { href: '/jurnal', label: 'Jurnal Umum', menu: 'akun.jurnal', ikon: 'jurnal' },
      { href: '/buku-besar', label: 'Buku Besar', menu: 'akun.buku_besar', ikon: 'bukubesar' },
      { href: '/laporan-keuangan', label: 'Laporan Keuangan', menu: 'laporan.keuangan', ikon: 'neraca' },
      { href: '/tutup-periode', label: 'Tutup Periode', menu: 'akun.tutup_periode', ikon: 'periode' },
    ],
  },
  // tahap 6B: aset tetap dan anggaran (RANCANGAN 8.2). Admin melihat Aset Tetap, Anggaran, dan Realisasi (Lihat);
  // Penyusutan dan Pelepasan Aset hanya Owner (aset.penyusutan).
  {
    judul: 'Aset dan Anggaran',
    item: [
      { href: '/aset', label: 'Aset Tetap', menu: 'aset.daftar', ikon: 'aset' },
      { href: '/penyusutan', label: 'Penyusutan', menu: 'aset.penyusutan', ikon: 'penyusutan' },
      { href: '/pelepasan-aset', label: 'Pelepasan Aset', menu: 'aset.penyusutan', ikon: 'pelepasan' },
      { href: '/anggaran', label: 'Anggaran', menu: 'anggaran.anggaran', ikon: 'anggaran' },
      { href: '/realisasi-anggaran', label: 'Realisasi Anggaran', menu: 'anggaran.anggaran', ikon: 'realisasi' },
    ],
  },
  { judul: 'Laporan', item: [SIDEBAR_SETORAN[1]] },
  // tahap 2, ditambah master lokasi sederhana tahap 4A (atur.lokasi).
  {
    judul: 'Pengaturan',
    item: [
      { href: '/lokasi', label: 'Lokasi', menu: 'atur.lokasi', ikon: 'lokasi' },
      // tahap 6A: profil usaha per cabang (atur.lokasi, Owner mengubah, Admin melihat).
      { href: '/profil-usaha', label: 'Profil Usaha', menu: 'atur.lokasi', ikon: 'profil' },
      { href: '/pengguna', label: 'Pengguna', menu: 'atur.pengguna', ikon: 'pengguna' },
      { href: '/peran', label: 'Peran dan Izin', menu: 'atur.peran', ikon: 'peran' },
      { href: '/saklar', label: 'Saklar Fitur', menu: 'atur.saklar', ikon: 'saklar' },
      // Keputusan pemilik 24 November 2026: aturan persetujuan dokumen, hanya Owner (KONTRAK 11 butir 156).
      { href: '/persetujuan', label: 'Aturan Persetujuan', menu: 'atur.persetujuan', ikon: 'persetujuan' },
      { href: '/audit', label: 'Jejak Audit', menu: 'atur.audit', ikon: 'audit' },
    ],
  },
]

export const SIDEBAR: ItemSidebar[] = SIDEBAR_GRUP.flatMap((g) => g.item)

export const grupMenu = () => {
  const peta = new Map<string, MenuIzin[]>()
  for (const m of MENU_IZIN) {
    if (!peta.has(m.grup)) peta.set(m.grup, [])
    peta.get(m.grup)!.push(m)
  }
  return [...peta.entries()]
}
