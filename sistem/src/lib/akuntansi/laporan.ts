// Laporan akuntansi (tahap 5B, RANCANGAN 9): Buku Besar, Neraca Saldo, Laba Rugi, dan Neraca. Semuanya dibaca dari
// journal_line milik jurnal yang sudah berlaku (posted_at terisi). Tanpa impor Next.
import { Prisma, type AccountKind } from '@/generated/prisma/client'
import type { DbAtauTx } from '../db'
import { tanggalIso } from '../waktu'
import { URUT_JENIS, JENIS_AKUN, normalDebit } from './akun'
import { namaPeriode } from './jurnal'
import { bulanIni, geserBulan } from './periode'

const N = (v: unknown) => Number(v ?? 0)
const tglSah = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : undefined)
const bulanSah = (s?: string) => (s && /^\d{4}-(0[1-9]|1[0-2])$/.test(s) ? s : undefined)
const tgl = (iso: string) => new Date(`${iso}T00:00:00Z`)
const BATAS_BULAN = 24

// Rentang bulan untuk Neraca Saldo, Laba Rugi, dan Neraca. Bawaan bulan berjalan, paling panjang 24 bulan.
export function rentangBulan(s: { dari?: string; sampai?: string }, ini = bulanIni()) {
  let sampai = bulanSah(s.sampai) ?? ini
  let dari = bulanSah(s.dari) ?? sampai
  if (dari > sampai) [dari, sampai] = [sampai, dari]
  let catatan: string | undefined
  if (geserBulan(dari, BATAS_BULAN - 1) < sampai) {
    dari = geserBulan(sampai, -(BATAS_BULAN - 1))
    catatan = `Rentang paling panjang ${BATAS_BULAN} bulan, jadi dimulai dari ${namaPeriode(dari)}.`
  }
  const awal = `${dari}-01`
  const akhirBulan = new Date(Date.UTC(Number(sampai.slice(0, 4)), Number(sampai.slice(5, 7)), 0)).toISOString().slice(0, 10)
  return { dari, sampai, awal, akhir: akhirBulan, catatan, judul: dari === sampai ? namaPeriode(dari) : `${namaPeriode(dari)} sampai ${namaPeriode(sampai)}` }
}

// Rentang tanggal Buku Besar. Bawaan awal bulan berjalan sampai hari ini, paling panjang 366 hari.
export function rentangTanggal(s: { dari?: string; sampai?: string }, hariIni = tanggalIso(new Date())) {
  let sampai = tglSah(s.sampai) ?? hariIni
  let dari = tglSah(s.dari) ?? `${sampai.slice(0, 7)}-01`
  if (dari > sampai) [dari, sampai] = [sampai, dari]
  let catatan: string | undefined
  if ((tgl(sampai).getTime() - tgl(dari).getTime()) / 86_400_000 >= 366) {
    dari = new Date(tgl(sampai).getTime() - 365 * 86_400_000).toISOString().slice(0, 10)
    catatan = `Rentang paling panjang 366 hari, jadi dimulai dari ${dari}.`
  }
  return { dari, sampai, catatan }
}

type BarisSaldo = { id: number; code: string; name: string; kind: AccountKind; parent_id: number | null; active: boolean; awal_d: bigint; awal_k: bigint; mut_d: bigint; mut_k: bigint }

// Debit dan kredit per akun: sebelum tanggal awal (saldo awal) dan di dalam rentang (mutasi).
async function saldoPerAkun(db: DbAtauTx, awal: string, akhir: string) {
  return db.$queryRaw<BarisSaldo[]>`
    SELECT a.id, a.code, a.name, a.kind::text AS kind, a.parent_id, a.active,
      COALESCE(x.awal_d, 0)::bigint AS awal_d, COALESCE(x.awal_k, 0)::bigint AS awal_k, COALESCE(x.mut_d, 0)::bigint AS mut_d, COALESCE(x.mut_k, 0)::bigint AS mut_k
    FROM account a LEFT JOIN (
      SELECT l.account_id,
        SUM(l.debit) FILTER (WHERE j.date < ${tgl(awal)}) AS awal_d, SUM(l.credit) FILTER (WHERE j.date < ${tgl(awal)}) AS awal_k,
        SUM(l.debit) FILTER (WHERE j.date >= ${tgl(awal)}) AS mut_d, SUM(l.credit) FILTER (WHERE j.date >= ${tgl(awal)}) AS mut_k
      FROM journal_line l JOIN journal j ON j.id = l.journal_id
      WHERE j.posted_at IS NOT NULL AND j.date <= ${tgl(akhir)}
      GROUP BY l.account_id
    ) x ON x.account_id = a.id
    WHERE a.is_postable
    ORDER BY a.code`
}

const urutKode = <T extends { code: string; kind: AccountKind }>(a: T, b: T) => URUT_JENIS.indexOf(a.kind) - URUT_JENIS.indexOf(b.kind) || a.code.localeCompare(b.code, 'id', { numeric: true })

// --- Neraca Saldo ---

export type BarisNeracaSaldo = { id: number; kode: string; nama: string; jenis: string; awalD: number; awalK: number; mutD: number; mutK: number; akhirD: number; akhirK: number }

const sisiSaldo = (d: bigint) => ({ d: d > 0n ? Number(d) : 0, k: d < 0n ? Number(-d) : 0 })

export async function neracaSaldo(db: DbAtauTx, s: { dari?: string; sampai?: string; semua?: string }) {
  const r = rentangBulan(s)
  const baris = (await saldoPerAkun(db, r.awal, r.akhir)).sort(urutKode)
  const hasil: BarisNeracaSaldo[] = []
  for (const b of baris) {
    const awal = sisiSaldo(b.awal_d - b.awal_k)
    const akhir = sisiSaldo(b.awal_d - b.awal_k + b.mut_d - b.mut_k)
    const ada = awal.d || awal.k || b.mut_d || b.mut_k || akhir.d || akhir.k
    if (!ada && s.semua !== '1') continue
    hasil.push({ id: b.id, kode: b.code, nama: b.name, jenis: JENIS_AKUN[b.kind], awalD: awal.d, awalK: awal.k, mutD: N(b.mut_d), mutK: N(b.mut_k), akhirD: akhir.d, akhirK: akhir.k })
  }
  const jumlah = hasil.reduce(
    (a, b) => ({ ...a, awalD: a.awalD + b.awalD, awalK: a.awalK + b.awalK, mutD: a.mutD + b.mutD, mutK: a.mutK + b.mutK, akhirD: a.akhirD + b.akhirD, akhirK: a.akhirK + b.akhirK }),
    { id: 0, kode: '', nama: 'Jumlah', jenis: '', awalD: 0, awalK: 0, mutD: 0, mutK: 0, akhirD: 0, akhirK: 0 } as BarisNeracaSaldo,
  )
  return { rentang: r, baris: hasil, jumlah, seimbang: jumlah.akhirD === jumlah.akhirK && jumlah.mutD === jumlah.mutK }
}

// --- Laba Rugi dan Neraca ---

export type BarisLaporan = { jenis: 'judul' | 'akun' | 'jumlah' | 'hasil'; kode: string; nama: string; nilai: number | null; persen?: number | null; id?: number }

// Laba rugi rentang [awal, akhir] per akun: pendapatan bernilai kredit - debit, HPP dan beban debit - kredit.
async function nilaiLabaRugi(db: DbAtauTx, awal: string | null, akhir: string) {
  const baris = await db.$queryRaw<{ id: number; code: string; name: string; kind: AccountKind; d: bigint; k: bigint }[]>`
    SELECT a.id, a.code, a.name, a.kind::text AS kind, COALESCE(SUM(l.debit), 0)::bigint AS d, COALESCE(SUM(l.credit), 0)::bigint AS k
    FROM journal_line l JOIN journal j ON j.id = l.journal_id JOIN account a ON a.id = l.account_id
    WHERE j.posted_at IS NOT NULL AND j.date <= ${tgl(akhir)} AND (${awal}::date IS NULL OR j.date >= ${awal}::date)
      AND a.kind IN ('Pendapatan', 'HPP', 'Beban')
    GROUP BY a.id ORDER BY a.code`
  return baris.map((b) => ({ ...b, nilai: b.kind === 'Pendapatan' ? N(b.k) - N(b.d) : N(b.d) - N(b.k) })).sort(urutKode)
}

const labaDari = (b: { kind: AccountKind; nilai: number }[]) => b.reduce((n, x) => n + (x.kind === 'Pendapatan' ? x.nilai : -x.nilai), 0)

export async function labaRugi(db: DbAtauTx, s: { dari?: string; sampai?: string }) {
  const r = rentangBulan(s)
  const akun = await nilaiLabaRugi(db, r.awal, r.akhir)
  const per = (k: AccountKind) => akun.filter((a) => a.kind === k && a.nilai !== 0)
  const total = (k: AccountKind) => per(k).reduce((n, a) => n + a.nilai, 0)
  const pendapatan = total('Pendapatan')
  const persen = (v: number) => (pendapatan ? Math.round((v / pendapatan) * 1000) / 10 : null)
  const hpp = total('HPP')
  const beban = total('Beban')
  const baris: BarisLaporan[] = []
  const kelompok = (k: AccountKind, judul: string) => {
    baris.push({ jenis: 'judul', kode: '', nama: judul, nilai: null })
    for (const a of per(k)) baris.push({ jenis: 'akun', kode: a.code, nama: a.name, nilai: a.nilai, persen: persen(a.nilai), id: a.id })
    baris.push({ jenis: 'jumlah', kode: '', nama: `Jumlah ${judul.toLowerCase()}`, nilai: total(k), persen: persen(total(k)) })
  }
  kelompok('Pendapatan', 'Pendapatan')
  kelompok('HPP', 'Harga pokok penjualan')
  baris.push({ jenis: 'hasil', kode: '', nama: 'Laba kotor', nilai: pendapatan - hpp, persen: persen(pendapatan - hpp) })
  kelompok('Beban', 'Beban operasional')
  const bersih = pendapatan - hpp - beban
  baris.push({ jenis: 'hasil', kode: '', nama: 'Laba bersih', nilai: bersih, persen: persen(bersih) })
  // Pemeriksaan: laba bersih sama dengan selisih kredit - debit semua akun laba rugi di rentang ini.
  return { rentang: r, baris, ringkas: { pendapatan, hpp, labaKotor: pendapatan - hpp, beban, bersih }, cek: bersih === labaDari(akun) }
}

// Neraca per akhir bulan sampai (atau per hari ini bila bulan berjalan). Laba rugi tahun berjalan dan tahun-tahun
// sebelumnya dihitung dari jurnal dan ditampilkan di akun pemetaan laba_berjalan dan laba_ditahan, karena tutup buku
// tahunan belum ada. Neraca seimbang bila aset = kewajiban + ekuitas.
export async function neraca(db: DbAtauTx, s: { sampai?: string; dari?: string }) {
  const r = rentangBulan({ dari: s.sampai ?? s.dari, sampai: s.sampai ?? s.dari })
  const hariIni = tanggalIso(new Date())
  const per = r.akhir > hariIni ? hariIni : r.akhir
  const awalTahun = `${per.slice(0, 4)}-01-01`
  const sebelumTahun = new Date(tgl(awalTahun).getTime() - 86_400_000).toISOString().slice(0, 10)
  const [saldo, lrTahun, lrLalu, peta] = await Promise.all([
    db.$queryRaw<{ id: number; code: string; name: string; kind: AccountKind; d: bigint; k: bigint }[]>`
      SELECT a.id, a.code, a.name, a.kind::text AS kind, COALESCE(SUM(l.debit), 0)::bigint AS d, COALESCE(SUM(l.credit), 0)::bigint AS k
      FROM journal_line l JOIN journal j ON j.id = l.journal_id JOIN account a ON a.id = l.account_id
      WHERE j.posted_at IS NOT NULL AND j.date <= ${tgl(per)} AND a.kind IN ('Aset', 'Kewajiban', 'Ekuitas')
      GROUP BY a.id`,
    nilaiLabaRugi(db, awalTahun, per),
    nilaiLabaRugi(db, null, sebelumTahun),
    db.accountMapping.findMany({ where: { key: { in: ['laba_berjalan', 'laba_ditahan'] } }, include: { account: true } }),
  ])
  const akun = new Map(saldo.map((b) => [b.id, { id: b.id, code: b.code, name: b.name, kind: b.kind, nilai: b.kind === 'Aset' ? N(b.d) - N(b.k) : N(b.k) - N(b.d) }]))
  const tambah = (kunci: string, nilai: number) => {
    const m = peta.find((p) => p.key === kunci)
    if (!m || !nilai) return
    const a = akun.get(m.accountId) ?? { id: m.account.id, code: m.account.code, name: m.account.name, kind: m.account.kind, nilai: 0 }
    a.nilai += nilai
    akun.set(a.id, a)
  }
  const labaBerjalan = labaDari(lrTahun)
  const labaLalu = labaDari(lrLalu)
  tambah('laba_berjalan', labaBerjalan)
  tambah('laba_ditahan', labaLalu)
  const daftar = [...akun.values()].filter((a) => a.nilai !== 0).sort(urutKode)
  const total = (k: AccountKind) => daftar.filter((a) => a.kind === k).reduce((n, a) => n + a.nilai, 0)
  const baris: BarisLaporan[] = []
  const kelompok = (k: AccountKind, judul: string) => {
    baris.push({ jenis: 'judul', kode: '', nama: judul, nilai: null })
    for (const a of daftar.filter((x) => x.kind === k)) baris.push({ jenis: 'akun', kode: a.code, nama: a.name, nilai: a.nilai, id: a.id })
    baris.push({ jenis: 'jumlah', kode: '', nama: `Jumlah ${judul.toLowerCase()}`, nilai: total(k) })
  }
  kelompok('Aset', 'Aset')
  kelompok('Kewajiban', 'Kewajiban')
  kelompok('Ekuitas', 'Ekuitas')
  const aset = total('Aset')
  const pasiva = total('Kewajiban') + total('Ekuitas')
  baris.push({ jenis: 'hasil', kode: '', nama: 'Jumlah kewajiban dan ekuitas', nilai: pasiva })
  return { rentang: r, per, baris, ringkas: { aset, kewajiban: total('Kewajiban'), ekuitas: total('Ekuitas'), labaBerjalan, labaLalu }, seimbang: aset === pasiva, selisih: aset - pasiva }
}

// --- Buku Besar ---

export const PER_HALAMAN_BB = 100
export type BarisBukuBesar = { lineId: number; jurnalId: number; tanggal: string; dibuat: Date; no: string; sumber: string; docNo: string; sourceId: number | null; keterangan: string; debit: number; kredit: number; saldo: number }

// Buku besar satu akun (akun induk mencakup semua turunannya). Saldo berjalan dihitung di basis data untuk seluruh
// rentang lalu dipotong per halaman, jadi saldo di halaman berikutnya tetap benar. Saldo dalam arti saldo normal akun.
// semua: untuk CSV, seluruh baris rentang itu (paling banyak 20.000) tanpa halaman.
export async function bukuBesar(db: DbAtauTx, s: { akun?: string; dari?: string; sampai?: string; sumber?: string; hal?: string }, opsi: { semua?: boolean } = {}) {
  const r = rentangTanggal(s)
  const id = Number(s.akun)
  const akun = Number.isInteger(id) && id > 0 ? await db.account.findUnique({ where: { id } }) : null
  if (!akun) return { rentang: r, akun: null }
  const hal = Math.max(1, Math.min(10000, Number(s.hal) || 1))
  const tanda = normalDebit(akun.kind) ? 1n : -1n
  const sumber = s.sumber && /^[a-z_]{2,40}$/.test(s.sumber) ? s.sumber : null
  const ids = Prisma.sql`(WITH RECURSIVE t AS (SELECT id FROM account WHERE id = ${akun.id} UNION ALL SELECT a.id FROM account a JOIN t ON a.parent_id = t.id) SELECT id FROM t)`
  const [awal] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS n FROM journal_line l JOIN journal j ON j.id = l.journal_id
    WHERE j.posted_at IS NOT NULL AND j.date < ${tgl(r.dari)} AND l.account_id IN ${ids}`
  const saldoAwal = N(awal.n * tanda)
  const [jml] = await db.$queryRaw<{ n: bigint; d: bigint; k: bigint }[]>`
    SELECT COUNT(*)::bigint AS n, COALESCE(SUM(l.debit), 0)::bigint AS d, COALESCE(SUM(l.credit), 0)::bigint AS k FROM journal_line l JOIN journal j ON j.id = l.journal_id
    WHERE j.posted_at IS NOT NULL AND j.date >= ${tgl(r.dari)} AND j.date <= ${tgl(r.sampai)} AND l.account_id IN ${ids}
      AND (${sumber}::text IS NULL OR j.source_type = ${sumber})`
  const baris = await db.$queryRaw<{ line_id: number; jurnal_id: number; tanggal: Date; dibuat: Date; no: string; source_type: string; source_id: number | null; doc_no: string; memo: string; debit: bigint; credit: bigint; jalan: bigint }[]>`
    SELECT l.id AS line_id, j.id AS jurnal_id, j.date AS tanggal, j.posted_at AS dibuat, j.no, j.source_type, j.source_id, j.doc_no,
      CASE WHEN l.memo <> '' THEN l.memo ELSE j.memo END AS memo, l.debit, l.credit,
      (SUM(l.debit - l.credit) OVER (ORDER BY j.date, j.id, l.id))::bigint AS jalan
    FROM journal_line l JOIN journal j ON j.id = l.journal_id
    WHERE j.posted_at IS NOT NULL AND j.date >= ${tgl(r.dari)} AND j.date <= ${tgl(r.sampai)} AND l.account_id IN ${ids}
      AND (${sumber}::text IS NULL OR j.source_type = ${sumber})
    ORDER BY j.date, j.id, l.id OFFSET ${opsi.semua ? 0 : (hal - 1) * PER_HALAMAN_BB} LIMIT ${opsi.semua ? 20_000 : PER_HALAMAN_BB}`
  const mutasi = (N(jml.d) - N(jml.k)) * Number(tanda)
  return {
    rentang: r,
    akun,
    normalDebit: tanda === 1n,
    saldoAwal,
    debit: N(jml.d),
    kredit: N(jml.k),
    // Dengan saringan sumber, saldo akhir hanya menjumlah mutasi sumber itu.
    saldoAkhir: saldoAwal + mutasi,
    hal,
    total: N(jml.n),
    jumlahHal: Math.max(1, Math.ceil(N(jml.n) / PER_HALAMAN_BB)),
    baris: baris.map(
      (b): BarisBukuBesar => ({
        lineId: b.line_id,
        jurnalId: b.jurnal_id,
        tanggal: b.tanggal.toISOString().slice(0, 10),
        dibuat: b.dibuat,
        no: b.no,
        sumber: b.source_type,
        docNo: b.doc_no,
        sourceId: b.source_id,
        keterangan: b.memo,
        debit: N(b.debit),
        kredit: N(b.credit),
        saldo: saldoAwal + N(b.jalan * tanda),
      }),
    ),
  }
}

// --- Pencocokan persediaan ---

// Nilai persediaan di buku (akun yang dipetakan ke persediaan dan persediaan.<lokasi>) lawan nilai stok, dan barang
// dalam proses lawan wip_value perintah produksi. Tanpa per, stok dibaca dari stock_balance.
export async function cocokkanPersediaan(db: DbAtauTx, per?: string) {
  const sampai = per ? tgl(per) : null
  const [buku] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS n FROM journal_line l JOIN journal j ON j.id = l.journal_id
    WHERE j.posted_at IS NOT NULL AND (${sampai}::date IS NULL OR j.date <= ${sampai}::date)
      AND l.account_id IN (SELECT account_id FROM account_mapping WHERE key = 'persediaan' OR key LIKE 'persediaan.%')`
  const [stok] = sampai
    ? await db.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(value), 0)::bigint AS n FROM stock_ledger WHERE date <= ${sampai}::date`
    : await db.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(value), 0)::bigint AS n FROM stock_balance`
  const [bdp] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS n FROM journal_line l JOIN journal j ON j.id = l.journal_id
    WHERE j.posted_at IS NOT NULL AND (${sampai}::date IS NULL OR j.date <= ${sampai}::date)
      AND l.account_id IN (SELECT account_id FROM account_mapping WHERE key = 'bdp')`
  const [wip] = await db.$queryRaw<{ n: bigint }[]>`SELECT COALESCE(SUM(wip_value), 0)::bigint AS n FROM production_order`
  return { buku: N(buku.n), stok: N(stok.n), cocok: buku.n === stok.n, bdpBuku: N(bdp.n), bdpProduksi: per ? null : N(wip.n) }
}

// Jenis sumber jurnal yang pernah dipakai, untuk saringan.
export const sumberJurnal = async (db: DbAtauTx) => (await db.$queryRaw<{ s: string }[]>`SELECT DISTINCT source_type AS s FROM journal ORDER BY 1`).map((x) => x.s)
