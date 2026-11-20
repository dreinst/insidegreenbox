// Pembantu halaman rincian dokumen penjualan B2B: aksi panel status yang sudah diikat ke dokumen. Bentuk jejak status
// dipakai bersama dengan pembelian (_beli/panel.ts).
import type { JenisJual } from '@/lib/beli/dokumen'
import { hapusJualAksi, statusJualAksi } from './aksi'

export { isoHari, jejak } from '../_beli/panel'

export const aksiPanelJual = (jenis: JenisJual, id: number) => ({
  ajukan: statusJualAksi.bind(null, jenis, id, 'ajukan'),
  kembalikan: statusJualAksi.bind(null, jenis, id, 'kembalikan'),
  setujui: statusJualAksi.bind(null, jenis, id, 'setujui'),
  posting: statusJualAksi.bind(null, jenis, id, 'posting'),
  batal: statusJualAksi.bind(null, jenis, id, 'batal'),
  tutup: statusJualAksi.bind(null, jenis, id, 'tutup'),
  hapus: hapusJualAksi.bind(null, jenis, id),
})
