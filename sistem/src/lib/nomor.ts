// Nomor dokumen dari doc_sequence (KONTRAK 3.3). Dipanggil di dalam transaksi pembuat dokumen.
import type { DbAtauTx } from './db'
import { periodeYYMM } from './waktu'

export async function ambilNomor(tx: DbAtauTx, docType: string, awalan: string, tanggal: Date) {
  const periode = periodeYYMM(tanggal)
  const baris = await tx.$queryRaw<{ last_no: number }[]>`
    INSERT INTO doc_sequence (doc_type, period, prefix, last_no) VALUES (${docType}, ${periode}, ${awalan}, 1)
    ON CONFLICT (doc_type, period) DO UPDATE SET last_no = doc_sequence.last_no + 1
    RETURNING last_no`
  return `${awalan}-${periode}-${String(baris[0].last_no).padStart(4, '0')}`
}
