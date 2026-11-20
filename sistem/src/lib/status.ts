// Status dokumen dan transisi yang sah (KONTRAK 3.2, RANCANGAN 2.2). Dipakai semua modul dokumen mulai tahap 4.
export const STATUS = ['Draft', 'Diajukan', 'Disetujui', 'Diposting', 'Selesai', 'Batal'] as const
export type StatusDokumen = (typeof STATUS)[number]

// rencana: tidak menggerakkan stok atau jurnal. pelaksana: bergerak saat Diposting.
// pelaksana_setuju: pelaksana yang wajib disetujui dulu lalu diposting saat uang keluar.
export type GolonganDokumen = 'rencana' | 'pelaksana' | 'pelaksana_setuju'

export const JENIS_DOKUMEN: Record<string, { golongan: GolonganDokumen; awalan: string; nama: string }> = {
  purchase_request: { golongan: 'rencana', awalan: 'PR', nama: 'Permintaan Pembelian' },
  purchase_order: { golongan: 'rencana', awalan: 'PO', nama: 'Pesanan Pembelian' },
  production_order: { golongan: 'rencana', awalan: 'PP', nama: 'Perintah Produksi' },
  sales_order: { golongan: 'rencana', awalan: 'SO', nama: 'Pesanan Penjualan' },
  budget: { golongan: 'rencana', awalan: 'AG', nama: 'Anggaran' },
  goods_receipt: { golongan: 'pelaksana', awalan: 'TB', nama: 'Penerimaan Barang' },
  purchase_invoice: { golongan: 'pelaksana', awalan: 'FB', nama: 'Faktur Pembelian' },
  purchase_return: { golongan: 'pelaksana', awalan: 'RB', nama: 'Retur Pembelian' },
  direct_purchase: { golongan: 'pelaksana', awalan: 'BL', nama: 'Pembelian Langsung' },
  purchase_payment: { golongan: 'pelaksana_setuju', awalan: 'BB', nama: 'Pembayaran Pembelian' },
  stock_adjustment: { golongan: 'pelaksana', awalan: 'PS', nama: 'Penyesuaian Stok' },
  stock_opname: { golongan: 'pelaksana', awalan: 'OP', nama: 'Stock Opname' },
  stock_transfer: { golongan: 'pelaksana', awalan: 'PD', nama: 'Pindah Stok' },
  material_issue: { golongan: 'pelaksana', awalan: 'KB', nama: 'Pengeluaran Bahan' },
  production_result: { golongan: 'pelaksana', awalan: 'HP', nama: 'Hasil Produksi' },
  quick_production: { golongan: 'pelaksana', awalan: 'PC', nama: 'Produksi Cepat' },
  pos_settlement: { golongan: 'pelaksana', awalan: 'ST', nama: 'Setoran POS' },
  cash_transaction: { golongan: 'pelaksana_setuju', awalan: 'KS', nama: 'Kas Masuk dan Keluar' },
  bank_reconcile: { golongan: 'pelaksana', awalan: 'RK', nama: 'Rekonsiliasi Bank' },
  sales_invoice: { golongan: 'pelaksana', awalan: 'FJ', nama: 'Faktur Penjualan' },
  customer_payment: { golongan: 'pelaksana', awalan: 'TP', nama: 'Penerimaan Pelanggan' },
  sales_return: { golongan: 'pelaksana', awalan: 'RJ', nama: 'Retur Penjualan' },
  asset_disposal: { golongan: 'pelaksana', awalan: 'LA', nama: 'Pelepasan Aset' },
}

type Peta = Record<StatusDokumen, StatusDokumen[]>

const TRANSISI: Record<GolonganDokumen, Peta> = {
  rencana: {
    Draft: ['Diajukan', 'Disetujui', 'Batal'],
    Diajukan: ['Draft', 'Disetujui', 'Batal'],
    Disetujui: ['Selesai', 'Batal'],
    Diposting: [],
    Selesai: [],
    Batal: [],
  },
  pelaksana: {
    Draft: ['Diajukan', 'Diposting', 'Batal'],
    Diajukan: ['Draft', 'Diposting', 'Batal'],
    Disetujui: ['Diposting', 'Batal'],
    Diposting: ['Batal'],
    Selesai: [],
    Batal: [],
  },
  pelaksana_setuju: {
    Draft: ['Diajukan', 'Batal'],
    Diajukan: ['Draft', 'Disetujui', 'Batal'],
    Disetujui: ['Diposting', 'Batal'],
    Diposting: ['Batal'],
    Selesai: [],
    Batal: [],
  },
}

// butuhSetuju: dokumen ini terkena approval_rule, jadi tidak boleh melompati Diajukan.
export function transisiSah(golongan: GolonganDokumen, dari: StatusDokumen, ke: StatusDokumen, opsi: { butuhSetuju?: boolean } = {}) {
  if (!TRANSISI[golongan][dari].includes(ke)) return false
  if (opsi.butuhSetuju && dari === 'Draft' && (ke === 'Disetujui' || ke === 'Diposting')) return false
  return true
}

export const bolehDiubah = (s: StatusDokumen) => s === 'Draft'
export const bolehDihapus = (s: StatusDokumen) => s === 'Draft'
