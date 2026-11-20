// Mesin jurnal (KONTRAK bagian 14). Satu-satunya jalan menulis journal dan journal_line yang berlaku: setiap dokumen
// yang diposting membentuk satu jurnal seimbang di transaksi pemanggil, dan pembatalannya membentuk satu jurnal balik.
// Tanggal di periode yang sudah ditutup ditolak. Tanpa impor Next.
import { GalatAturan } from '../aksi'
import type { DbAtauTx, Tx } from '../db'
import { ambilNomor } from '../nomor'
import { tanggalIso } from '../waktu'
import { pembacaAkun } from './pemetaan'

// Akun baris: id akun, kunci pemetaan, atau beberapa kunci yang dicoba berurutan (misalnya ['kliring.3', 'kliring']).
export type KunciAkun = number | string | string[]

export type BarisJurnal = {
  akun: KunciAkun
  debit?: bigint
  kredit?: bigint
  memo?: string
  supplierId?: number | null
  customerId?: number | null
  // tahap 5C: rekening bank_account yang digerakkan baris ini, untuk Rekonsiliasi Bank (KONTRAK 11).
  bankAccountId?: number | null
}

// Dokumen sumber jurnal. tanggal adalah tanggal jurnal (Date UTC tengah malam, sama dengan kolom date).
export type KepalaJurnal = {
  docType: string
  docId: number
  docNo: string
  tanggal: Date
  memo: string
  oleh: number | null
}

export type HasilJurnal = { id: number; no: string; total: bigint }

// Satu baris dari nilai bertanda: plus menjadi debit, minus menjadi kredit.
export const dk = (akun: KunciAkun, nilai: bigint, memo?: string): BarisJurnal => (nilai >= 0n ? { akun, debit: nilai, memo } : { akun, kredit: -nilai, memo })

// Tanggal jurnal dari waktu kejadian: tanggal WIB sebagai Date UTC tengah malam.
export const tanggalJurnal = (waktu: Date) => new Date(`${tanggalIso(waktu)}T00:00:00Z`)

// Periode YYYY-MM dari tanggal kolom date.
export const periodeDari = (tanggal: Date) => tanggal.toISOString().slice(0, 7)

const NAMA_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
export const namaPeriode = (ym: string) => `${NAMA_BULAN[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`

// Membuat baris periode bila belum ada, lalu menguncinya bersama (FOR SHARE) sampai transaksi selesai, supaya tutup
// periode (FOR UPDATE) menunggu posting yang sedang jalan dan sebaliknya. Periode Ditutup ditolak.
export async function pastikanPeriodeTerbuka(tx: DbAtauTx, tanggal: Date, untuk = 'Posting') {
  const ym = periodeDari(tanggal)
  await tx.$executeRaw`INSERT INTO fiscal_period (year_month, status) VALUES (${ym}, 'Terbuka') ON CONFLICT (year_month) DO NOTHING`
  const [p] = await tx.$queryRaw<{ id: number; status: string }[]>`SELECT id, status::text FROM fiscal_period WHERE year_month = ${ym} FOR SHARE`
  if (p.status === 'Ditutup') {
    throw new GalatAturan(`${untuk} bertanggal ${tanggalIso(tanggal)} ditolak karena periode ${namaPeriode(ym)} sudah ditutup. Koreksinya lewat dokumen di periode yang masih terbuka, atau minta Owner membuka periode itu.`)
  }
  return p.id
}

type BarisSiap = { accountId: number; debit: bigint; credit: bigint; memo: string; supplierId: number | null; customerId: number | null; bankAccountId: number | null }

// Menerjemahkan akun, memeriksa angka, membuang baris nol, dan menggabung baris dengan akun dan sisi yang sama.
async function susunBaris(tx: DbAtauTx, baris: BarisJurnal[]) {
  const akun = pembacaAkun(tx)
  const gabung = new Map<string, BarisSiap>()
  for (const [i, b] of baris.entries()) {
    const debit = b.debit ?? 0n
    const kredit = b.kredit ?? 0n
    if (typeof debit !== 'bigint' || typeof kredit !== 'bigint') throw new GalatAturan(`Baris jurnal ke-${i + 1}: nilai harus rupiah bulat.`)
    if (debit < 0n || kredit < 0n) throw new GalatAturan(`Baris jurnal ke-${i + 1}: debit dan kredit tidak boleh minus.`)
    if (debit > 0n && kredit > 0n) throw new GalatAturan(`Baris jurnal ke-${i + 1}: isi debit atau kredit saja.`)
    if (debit === 0n && kredit === 0n) continue
    const a = await akun(b.akun)
    const sisi = debit > 0n ? 'D' : 'K'
    const kunci = `${a.id}:${sisi}:${b.supplierId ?? ''}:${b.customerId ?? ''}:${b.bankAccountId ?? ''}`
    const ada = gabung.get(kunci)
    if (ada) {
      ada.debit += debit
      ada.credit += kredit
    } else gabung.set(kunci, { accountId: a.id, debit, credit: kredit, memo: (b.memo ?? '').slice(0, 200), supplierId: b.supplierId ?? null, customerId: b.customerId ?? null, bankAccountId: b.bankAccountId ?? null })
  }
  const hasil = [...gabung.values()].sort((x, y) => Number(y.debit > 0n) - Number(x.debit > 0n))
  const debit = hasil.reduce((n, b) => n + b.debit, 0n)
  const kredit = hasil.reduce((n, b) => n + b.credit, 0n)
  return { baris: hasil, debit, kredit }
}

const rp = (n: bigint) => `Rp ${n.toLocaleString('id-ID')}`

export function periksaKepala(k: KepalaJurnal) {
  if (!k.docType || !Number.isInteger(k.docId) || k.docId <= 0) throw new GalatAturan('Dokumen sumber jurnal tidak lengkap.')
  if (!(k.tanggal instanceof Date) || Number.isNaN(k.tanggal.getTime())) throw new GalatAturan('Tanggal jurnal tidak sah.')
}

async function tulis(tx: Tx, k: KepalaJurnal, baris: BarisSiap[], total: bigint, balikDari: number | null): Promise<HasilJurnal> {
  const periodId = await pastikanPeriodeTerbuka(tx, k.tanggal)
  const no = await ambilNomor(tx, 'journal', 'JU', k.tanggal)
  const sekarang = new Date()
  const j = await tx.journal.create({
    data: {
      no,
      date: k.tanggal,
      periodId,
      sourceType: k.docType,
      sourceId: k.docId,
      docNo: k.docNo.slice(0, 60),
      memo: k.memo.slice(0, 300),
      reversalOfId: balikDari,
      status: 'Diposting',
      postedBy: k.oleh,
      postedAt: sekarang,
      createdBy: k.oleh,
      journalLines: { create: baris },
    },
  })
  return { id: j.id, no, total }
}

// Membentuk jurnal maju sebuah dokumen. Dipanggil di dalam db.$transaction milik pemanggil, sekali per dokumen.
// Mengembalikan null bila semua baris bernilai 0 (tidak ada yang dijurnal). Ditolak bila tidak seimbang, bila
// tanggalnya di periode tertutup, atau bila dokumen itu sudah punya jurnal.
export async function buatJurnal(tx: Tx, k: KepalaJurnal, baris: BarisJurnal[]): Promise<HasilJurnal | null> {
  periksaKepala(k)
  const s = await susunBaris(tx, baris)
  if (s.debit !== s.kredit) throw new GalatAturan(`Jurnal ${k.docNo || k.docType} tidak seimbang: debit ${rp(s.debit)}, kredit ${rp(s.kredit)}.`)
  if (!s.baris.length) return null
  const ada = await tx.journal.findFirst({ where: { sourceType: k.docType, sourceId: k.docId, reversalOfId: null }, select: { no: true } })
  if (ada) throw new GalatAturan(`Dokumen ${k.docNo || k.docType} sudah punya jurnal ${ada.no}.`)
  return tulis(tx, k, s.baris, s.debit, null)
}

// tahap 5C: baris jurnal yang sudah dicocokkan ke mutasi bank terkunci dari pembatalan dokumen sumbernya (RANCANGAN 7).
// Pencocokannya dilepas dulu di Rekonsiliasi Bank, atau rekonsiliasinya dibatalkan.
export async function pastikanBelumDicocokkan(tx: DbAtauTx, journalId: number, dok: string) {
  const m = await tx.bankReconcileMatch.findFirst({
    where: { journalLine: { journalId } },
    select: { bankStatementLine: { select: { date: true, bankReconcile: { select: { no: true } } } } },
  })
  if (m) {
    const rk = m.bankStatementLine.bankReconcile?.no
    throw new GalatAturan(`${dok} tidak bisa dibatalkan karena baris banknya sudah dicocokkan dengan mutasi rekening ${tanggalIso(m.bankStatementLine.date)}${rk ? ` di ${rk}` : ''}. Lepas pencocokannya dulu di Rekonsiliasi Bank.`)
  }
}

// Jurnal maju dokumen yang sudah berlaku, bila ada.
export const jurnalMaju = (db: DbAtauTx, docType: string, docId: number) =>
  db.journal.findFirst({ where: { sourceType: docType, sourceId: docId, reversalOfId: null, postedAt: { not: null } }, include: { journalLines: true, reversals: { select: { id: true, no: true } } } })

// Membentuk jurnal balik untuk pembatalan dokumen yang sudah berlaku. k.tanggal = hari pembatalan. Tanpa baris,
// jurnal maju dibalik persis (debit jadi kredit). Dengan baris (misalnya dari gerak balik stok yang nilainya bisa
// sedikit berbeda, KONTRAK 11 butir 32), baris itu yang dipakai. Mengembalikan null bila dokumen tidak punya jurnal maju.
// Ditolak bila jurnal maju ada di periode tertutup (RANCANGAN 2.3 butir 5) atau sudah pernah dibalik.
export async function buatJurnalBalik(tx: Tx, k: KepalaJurnal, baris?: BarisJurnal[]): Promise<HasilJurnal | null> {
  periksaKepala(k)
  const asal = await jurnalMaju(tx, k.docType, k.docId)
  if (!asal) return null
  if (asal.reversals.length) throw new GalatAturan(`Jurnal ${asal.no} sudah pernah dibalik.`)
  await pastikanPeriodeTerbuka(tx, asal.date, `Pembatalan dokumen ${k.docNo || k.docType}`)
  await pastikanBelumDicocokkan(tx, asal.id, k.docNo || k.docType)
  const isi: BarisJurnal[] =
    baris ?? asal.journalLines.map((l) => ({ akun: l.accountId, debit: l.credit, kredit: l.debit, memo: l.memo, supplierId: l.supplierId, customerId: l.customerId, bankAccountId: l.bankAccountId }))
  const s = await susunBaris(tx, isi)
  if (s.debit !== s.kredit) throw new GalatAturan(`Jurnal balik ${k.docNo || k.docType} tidak seimbang: debit ${rp(s.debit)}, kredit ${rp(s.kredit)}.`)
  if (!s.baris.length) return null
  return tulis(tx, { ...k, memo: k.memo || `Balik ${asal.no}` }, s.baris, s.debit, asal.id)
}
