// Tutup periode bulanan (tahap 5B, RANCANGAN 2.3 butir 5 dan 8.2 "Tutup periode" Owner L T H). Periode Ditutup menolak
// semua posting dan pembatalan yang jurnalnya bertanggal di bulan itu. Owner bisa membuka lagi dengan alasan.
// Tanpa impor Next.
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, DbAtauTx } from '../db'
import { isOwner, pastikanIzin, type Pengguna } from '../izin-inti'
import { tanggalIso } from '../waktu'
import { namaPeriode } from './jurnal'

type Aktor = Pick<Pengguna, 'id' | 'izin' | 'peran'>
const MENU = 'akun.tutup_periode'

export const skemaBulan = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Bulan tidak sah.')
export const skemaBuka = z.object({ alasan: z.string().trim().min(5, 'Tulis alasan membuka periode, minimal 5 huruf.').max(300, 'Alasan paling panjang 300 huruf.') })

export const bulanIni = (sekarang = new Date()) => tanggalIso(sekarang).slice(0, 7)
export const geserBulan = (ym: string, n: number) => {
  const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 1))
  return d.toISOString().slice(0, 7)
}

async function kunciBulan(tx: DbAtauTx, ym: string) {
  await tx.$executeRaw`INSERT INTO fiscal_period (year_month, status) VALUES (${ym}, 'Terbuka') ON CONFLICT (year_month) DO NOTHING`
  const [p] = await tx.$queryRaw<{ id: number; status: string }[]>`SELECT id, status::text FROM fiscal_period WHERE year_month = ${ym} FOR UPDATE`
  return p
}

// Menutup satu bulan yang sudah lewat. Ditolak bila masih ada jurnal memorial Draft atau Diajukan di bulan itu.
export async function tutupPeriode(db: Db, k: Konteks, aktor: Aktor, bulan: unknown, sekarang = new Date()) {
  pastikanIzin(aktor, MENU, 'T')
  const ym = skemaBulan.parse(bulan)
  if (ym >= bulanIni(sekarang)) throw new GalatAturan(`${namaPeriode(ym)} belum berakhir. Periode hanya bisa ditutup sesudah bulannya lewat.`)
  return db.$transaction(async (tx) => {
    const p = await kunciBulan(tx, ym)
    if (p.status === 'Ditutup') throw new GalatAturan(`${namaPeriode(ym)} sudah ditutup.`)
    const awal = new Date(`${ym}-01T00:00:00Z`)
    const akhir = new Date(`${geserBulan(ym, 1)}-01T00:00:00Z`)
    const draf = await tx.journal.count({ where: { sourceType: 'memorial', postedAt: null, status: { in: ['Draft', 'Diajukan'] }, date: { gte: awal, lt: akhir } } })
    if (draf) throw new GalatAturan(`Masih ada ${draf} jurnal memorial Draft atau Diajukan bertanggal ${namaPeriode(ym)}. Posting atau batalkan dulu.`)
    const [r] = await tx.$queryRaw<{ n: bigint; d: bigint }[]>`
      SELECT COUNT(DISTINCT j.id)::bigint AS n, COALESCE(SUM(l.debit), 0)::bigint AS d FROM journal j JOIN journal_line l ON l.journal_id = j.id
      WHERE j.posted_at IS NOT NULL AND j.date >= ${awal} AND j.date < ${akhir}`
    const kini = new Date()
    await tx.fiscalPeriod.update({ where: { id: p.id }, data: { status: 'Ditutup', closedAt: kini, closedBy: aktor.id, stockClosedAt: kini } })
    await catatAudit(tx, k, {
      action: 'periode.tutup',
      docType: 'fiscal_period',
      docId: p.id,
      summary: `Menutup periode ${namaPeriode(ym)}: ${r.n} jurnal, total debit Rp ${r.d.toLocaleString('id-ID')}`,
      before: { status: p.status },
      after: { status: 'Ditutup', jurnal: r.n, debit: r.d },
    })
    return { ym, jurnal: Number(r.n) }
  })
}

// Membuka lagi periode yang sudah ditutup. Hanya Owner (izin Hapus tutup periode, padanan Close Period Delete ESB) dan
// wajib alasan.
export async function bukaPeriode(db: Db, k: Konteks, aktor: Aktor, bulan: unknown, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'H')
  if (!isOwner(aktor)) throw new GalatAturan('Periode yang sudah ditutup hanya bisa dibuka lagi oleh Owner atau Superadmin.')
  const ym = skemaBulan.parse(bulan)
  const d = skemaBuka.parse(masukan)
  return db.$transaction(async (tx) => {
    const p = await kunciBulan(tx, ym)
    if (p.status !== 'Ditutup') throw new GalatAturan(`${namaPeriode(ym)} masih terbuka.`)
    await tx.fiscalPeriod.update({ where: { id: p.id }, data: { status: 'Terbuka', reopenedAt: new Date(), reopenedBy: aktor.id, reopenReason: d.alasan } })
    await catatAudit(tx, k, { action: 'periode.buka', docType: 'fiscal_period', docId: p.id, summary: `Membuka lagi periode ${namaPeriode(ym)}. Alasan: ${d.alasan}`, before: { status: 'Ditutup' }, after: { status: 'Terbuka', alasan: d.alasan } })
    return { ym }
  })
}

// Daftar 13 bulan terakhir, ditambah bulan lain yang punya jurnal atau baris periode, beserta statusnya.
export async function daftarPeriode(db: DbAtauTx, sekarang = new Date()) {
  const ini = bulanIni(sekarang)
  const baris = await db.fiscalPeriod.findMany({ orderBy: { yearMonth: 'desc' }, take: 120, include: { closer: { select: { name: true } } } })
  const jumlah = await db.$queryRaw<{ ym: string; n: bigint; debit: bigint }[]>`
    SELECT to_char(j.date, 'YYYY-MM') AS ym, COUNT(DISTINCT j.id)::bigint AS n, COALESCE(SUM(l.debit), 0)::bigint AS debit
    FROM journal j JOIN journal_line l ON l.journal_id = j.id WHERE j.posted_at IS NOT NULL GROUP BY 1`
  const perBulan = new Map(jumlah.map((j) => [j.ym, j]))
  const perPeriode = new Map(baris.map((b) => [b.yearMonth, b]))
  const bulan = new Set<string>([...Array.from({ length: 13 }, (_, i) => geserBulan(ini, -i)), ...perPeriode.keys(), ...perBulan.keys()])
  const buka = [...new Set(baris.map((b) => b.reopenedBy).filter((x): x is number => !!x))]
  const nama = new Map((await db.appUser.findMany({ where: { id: { in: buka } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  return [...bulan]
    .filter((b) => b <= ini)
    .sort()
    .reverse()
    .map((ym) => {
      const p = perPeriode.get(ym)
      const j = perBulan.get(ym)
      return {
        ym,
        nama: namaPeriode(ym),
        status: p?.status ?? 'Terbuka',
        berjalan: ym === ini,
        ditutupOleh: p?.closer?.name ?? null,
        ditutupPada: p?.closedAt ?? null,
        dibukaOleh: p?.reopenedBy ? (nama.get(p.reopenedBy) ?? `#${p.reopenedBy}`) : null,
        dibukaPada: p?.reopenedAt ?? null,
        alasanBuka: p?.reopenReason ?? null,
        jurnal: Number(j?.n ?? 0),
        debit: j?.debit ?? 0n,
      }
    })
}
