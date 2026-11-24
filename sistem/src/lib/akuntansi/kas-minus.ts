// Peringatan saldo kas atau bank yang menjadi minus karena posting (keputusan pemilik 24 November 2026, KONTRAK 11
// butir 133). Hanya peringatan, posting tidak diblokir: saldo awal kas dan bank belum dimigrasikan, jadi saldo buku
// bisa lebih kecil dari uang yang sebenarnya ada. Tanpa impor Next.
import type { DbAtauTx } from '../db'
import { formatRupiah } from '../master'
import { kunciBank, pembacaAkun } from './pemetaan'

// Saldo buku akun kas atau bank (debit dikurangi kredit semua jurnal yang berlaku). Rekening tanpa id memakai Kas Besar.
export async function saldoKasBank(db: DbAtauTx, bankAccountId: number | null) {
  let akun
  try {
    akun = await pembacaAkun(db)(bankAccountId ? kunciBank(bankAccountId) : 'kas_besar')
  } catch {
    // Pemetaan belum ada atau akun nonaktif: posting nanti yang menolak dengan pesannya sendiri.
    return null
  }
  const [r] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS n FROM journal_line l JOIN journal j ON j.id = l.journal_id
    WHERE j.posted_at IS NOT NULL AND l.account_id = ${akun.id}`
  return { akun, saldo: BigInt(r.n) }
}

const rp = (n: bigint) => (n < 0n ? `-${formatRupiah(-n)}` : formatRupiah(n))

// Kalimat peringatan bila uang keluar sebesar `keluar` membuat saldo buku minus, atau null bila tidak.
export async function peringatanKasMinus(db: DbAtauTx, bankAccountId: number | null, keluar: bigint) {
  if (keluar <= 0n) return null
  const s = await saldoKasBank(db, bankAccountId)
  if (!s) return null
  const sesudah = s.saldo - keluar
  if (sesudah >= 0n) return null
  return `Saldo ${s.akun.code} ${s.akun.name} di buku sekarang ${rp(s.saldo)} dan menjadi ${rp(sesudah)} sesudah posting ini. Posting tetap bisa karena saldo awal kas dan bank belum dimigrasikan, tetapi pastikan uangnya memang ada.`
}
