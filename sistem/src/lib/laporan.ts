// Laporan penjualan dan POS (tahap 5A, RANCANGAN 9), dibaca langsung dari sale, sale_line, sale_payment, shift,
// dan shift_cash_move. Penjualan void tidak ikut dijumlah; jumlah dan nilainya ditampilkan terpisah. Tanggal
// penjualan memakai waktu sale.at di WIB, tanggal shift memakai waktu shift dibuka di WIB. Tanpa Next.
import { Prisma } from '@/generated/prisma/client'
import type { Db } from './db'
import { persen } from './hitung-kasir'
import { saklarNyala, type Pengguna } from './izin-inti'
import { MODE, KATEGORI_PAKET } from './penjualan'
import { dariKolomTanggal, keKolomTanggal, metodeTunaiUtama, nilaiSistem, syaratShiftTanggal } from './setoran'
import { STATUS_SHIFT } from './shift'
import { akhirHari, awalHari, tanggalIso, ZONA } from './waktu'

export type SaringLaporan = {
  dari?: string
  sampai?: string
  tanggal?: string
  kasir?: string
  shift?: string
  mode?: string
  metode?: string
  kategori?: string
  kelompok?: string
  setoran?: string
  q?: string
  hal?: string
}

const BATAS_HARI = 366
const tanggalSah = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s ? s : undefined)
const geser = (iso: string, hari: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + hari * 86_400_000).toISOString().slice(0, 10)
const jarakHari = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

// Rentang tanggal WIB. Bawaan tujuh hari terakhir seperti admin lama, paling panjang 366 hari.
export function rentang(s: Pick<SaringLaporan, 'dari' | 'sampai'>, hariIni = tanggalIso(new Date())) {
  let sampai = tanggalSah(s.sampai) ?? hariIni
  let dari = tanggalSah(s.dari) ?? geser(sampai, -6)
  if (dari > sampai) [dari, sampai] = [sampai, dari]
  let catatan: string | undefined
  if (jarakHari(dari, sampai) >= BATAS_HARI) {
    dari = geser(sampai, -(BATAS_HARI - 1))
    catatan = `Rentang paling panjang ${BATAS_HARI} hari, jadi dimulai dari ${dari}.`
  }
  return { dari, sampai, catatan }
}

const angka = (v: string | undefined) => (Number(v) > 0 && Number.isInteger(Number(v)) ? Number(v) : undefined)
const N = (v: unknown) => Number(v ?? 0)

// Pemegang saklar pos.lihat_void_nonsales melihat jumlah dan nilai void (RANCANGAN 8.3).
export const lihatVoid = (p: Pick<Pengguna, 'saklar'>) => saklarNyala(p, 'pos.lihat_void_nonsales')

type Rentang = ReturnType<typeof rentang>

// Syarat penjualan bersama: rentang tanggal, kasir pemilik shift, shift, mode, dan metode bayar.
function syaratJual(r: Rentang, s: SaringLaporan) {
  const w = [Prisma.sql`s.at >= ${awalHari(r.dari)} AND s.at <= ${akhirHari(r.sampai)}`]
  if (angka(s.kasir)) w.push(Prisma.sql`sh.user_id = ${angka(s.kasir)}`)
  if (angka(s.shift)) w.push(Prisma.sql`s.shift_id = ${angka(s.shift)}`)
  if (s.mode && s.mode in MODE) w.push(Prisma.sql`s.mode = ${s.mode}`)
  if (angka(s.metode)) w.push(Prisma.sql`EXISTS (SELECT 1 FROM sale_payment p WHERE p.sale_id = s.id AND p.payment_method_id = ${angka(s.metode)})`)
  return Prisma.join(w, ' AND ')
}

// 1. Rekap Penjualan per hari, kasir, atau shift.
export const KELOMPOK_REKAP = { hari: 'Per hari', kasir: 'Per kasir', shift: 'Per shift' } as const
export type BarisRekap = { kunci: string; label: string; n: number; kotor: number; potongan: number; bersih: number; service: number; pajak: number; total: number; nVoid: number; nilaiVoid: number }

export async function rekapPenjualan(db: Db, s: SaringLaporan) {
  const r = rentang(s)
  const kelompok = (s.kelompok && s.kelompok in KELOMPOK_REKAP ? s.kelompok : 'hari') as keyof typeof KELOMPOK_REKAP
  const kunci = {
    hari: Prisma.sql`to_char(s.at AT TIME ZONE ${ZONA}, 'YYYY-MM-DD')`,
    kasir: Prisma.sql`u.name || '#' || u.id`,
    shift: Prisma.sql`lpad(sh.id::text, 10, '0')`,
  }[kelompok]
  const label = {
    hari: Prisma.sql`to_char(s.at AT TIME ZONE ${ZONA}, 'YYYY-MM-DD')`,
    kasir: Prisma.sql`u.name`,
    shift: Prisma.sql`'#' || sh.id || ' ' || u.name`,
  }[kelompok]
  const baris = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT ${kunci} AS kunci, ${label} AS label,
      COUNT(*) FILTER (WHERE s.status = 'Selesai')::bigint AS n,
      COALESCE(SUM(s.sub) FILTER (WHERE s.status = 'Selesai'), 0)::bigint AS kotor,
      COALESCE(SUM(s.disc) FILTER (WHERE s.status = 'Selesai'), 0)::bigint AS potongan,
      COALESCE(SUM(s.svc) FILTER (WHERE s.status = 'Selesai'), 0)::bigint AS service,
      COALESCE(SUM(s.tax) FILTER (WHERE s.status = 'Selesai'), 0)::bigint AS pajak,
      COALESCE(SUM(s.total) FILTER (WHERE s.status = 'Selesai'), 0)::bigint AS total,
      COUNT(*) FILTER (WHERE s.status = 'Void')::bigint AS nvoid,
      COALESCE(SUM(s.total) FILTER (WHERE s.status = 'Void'), 0)::bigint AS nilaivoid
    FROM sale s JOIN shift sh ON sh.id = s.shift_id JOIN app_user u ON u.id = sh.user_id
    WHERE ${syaratJual(r, s)}
    GROUP BY 1, 2 ORDER BY 1`
  const hasil: BarisRekap[] = baris.map((b) => ({
    kunci: String(b.kunci),
    label: String(b.label),
    n: N(b.n),
    kotor: N(b.kotor),
    potongan: N(b.potongan),
    bersih: N(b.kotor) - N(b.potongan),
    service: N(b.service),
    pajak: N(b.pajak),
    total: N(b.total),
    nVoid: N(b.nvoid),
    nilaiVoid: N(b.nilaivoid),
  }))
  const jumlah = hasil.reduce(
    (a, b) => ({ ...a, n: a.n + b.n, kotor: a.kotor + b.kotor, potongan: a.potongan + b.potongan, bersih: a.bersih + b.bersih, service: a.service + b.service, pajak: a.pajak + b.pajak, total: a.total + b.total, nVoid: a.nVoid + b.nVoid, nilaiVoid: a.nilaiVoid + b.nilaiVoid }),
    { kunci: '', label: 'Jumlah', n: 0, kotor: 0, potongan: 0, bersih: 0, service: 0, pajak: 0, total: 0, nVoid: 0, nilaiVoid: 0 } as BarisRekap,
  )
  return { rentang: r, kelompok, baris: hasil, jumlah }
}

// 2. Rekap Penjualan Menu per menu (paket set sebagai baris sendiri) atau per kategori. Potongan member dialokasikan
// ke baris menu biasa sebanding nilainya; sisa pembulatan dibagi ke baris dengan sisa pecahan terbesar, sehingga
// jumlah potongan per transaksi sama persis dengan sale.disc. Baris paket tidak kena potongan (KONTRAK 11 butir 24).
export const KELOMPOK_MENU = { menu: 'Per menu', kategori: 'Per kategori' } as const
export type BarisMenu = { kunci: string; nama: string; kategori: string; qty: number; kotor: number; potongan: number; bersih: number; kontribusi: number }

export async function rekapMenu(db: Db, s: SaringLaporan) {
  const r = rentang(s)
  const kelompok = (s.kelompok && s.kelompok in KELOMPOK_MENU ? s.kelompok : 'menu') as keyof typeof KELOMPOK_MENU
  const saring: Prisma.Sql[] = [Prisma.sql`TRUE`]
  if (s.kategori) saring.push(Prisma.sql`c.category = ${s.kategori.slice(0, 40)}`)
  const q = s.q?.trim().slice(0, 60)
  if (q) saring.push(Prisma.sql`c.name ILIKE ${`%${q.replace(/[\\%_]/g, (x) => `\\${x}`)}%`}`)
  const kunci = kelompok === 'menu' ? Prisma.sql`CASE WHEN c.menu_set_id IS NOT NULL THEN 'p' || c.menu_set_id ELSE 'm' || c.menu_item_id END` : Prisma.sql`c.category`
  const baris = await db.$queryRaw<Record<string, unknown>[]>`
    WITH b AS (
      SELECT l.id, l.sale_id, l.qty, (l.price * l.qty)::bigint AS nilai, (l.menu_set_id IS NULL) AS reguler,
        l.menu_item_id, l.menu_set_id, l.name, l.category, s.disc
      FROM sale_line l JOIN sale s ON s.id = l.sale_id JOIN shift sh ON sh.id = s.shift_id
      WHERE s.status = 'Selesai' AND ${syaratJual(r, s)}
    ), r AS (
      SELECT b.*, (SUM(CASE WHEN b.reguler THEN b.nilai ELSE 0 END) OVER (PARTITION BY b.sale_id))::bigint AS subreg FROM b
    ), a AS (
      SELECT r.*,
        CASE WHEN r.reguler AND r.subreg > 0 THEN (r.disc * r.nilai) / r.subreg ELSE 0 END AS dasar,
        CASE WHEN r.reguler AND r.subreg > 0 THEN (r.disc * r.nilai) % r.subreg ELSE 0 END AS sisa
      FROM r
    ), c AS (
      SELECT a.*, a.dasar + CASE WHEN a.reguler AND ROW_NUMBER() OVER (PARTITION BY a.sale_id, a.reguler ORDER BY a.sisa DESC, a.id)
        <= a.disc - SUM(a.dasar) OVER (PARTITION BY a.sale_id) THEN 1 ELSE 0 END AS potong
      FROM a
    )
    SELECT ${kunci} AS kunci, (array_agg(c.name ORDER BY c.id DESC))[1] AS nama, (array_agg(c.category ORDER BY c.id DESC))[1] AS kategori,
      SUM(c.qty)::bigint AS qty, SUM(c.nilai)::bigint AS kotor, SUM(c.potong)::bigint AS potongan
    FROM c WHERE ${Prisma.join(saring, ' AND ')}
    GROUP BY 1 ORDER BY SUM(c.nilai) - SUM(c.potong) DESC, 1`
  const kat = new Map((await db.menuCategory.findMany({ select: { code: true, name: true } })).map((k) => [k.code, k.name]))
  const namaKategori = (kode: string) => (kode === KATEGORI_PAKET ? 'Paket set' : (kat.get(kode) ?? kode))
  const totalBersih = baris.reduce((a, b) => a + N(b.kotor) - N(b.potongan), 0)
  const hasil: BarisMenu[] = baris.map((b) => {
    const bersih = N(b.kotor) - N(b.potongan)
    const kategori = namaKategori(String(b.kategori))
    return { kunci: String(b.kunci), nama: kelompok === 'menu' ? String(b.nama) : kategori, kategori, qty: N(b.qty), kotor: N(b.kotor), potongan: N(b.potongan), bersih, kontribusi: totalBersih ? Math.round((bersih / totalBersih) * 1000) / 10 : 0 }
  })
  const jumlah = hasil.reduce((a, b) => ({ ...a, qty: a.qty + b.qty, kotor: a.kotor + b.kotor, potongan: a.potongan + b.potongan, bersih: a.bersih + b.bersih }), { kunci: '', nama: kelompok === 'menu' ? '' : 'Jumlah', kategori: kelompok === 'menu' ? 'Jumlah' : '', qty: 0, kotor: 0, potongan: 0, bersih: 0, kontribusi: hasil.length ? 100 : 0 } as BarisMenu)
  const v = await db.$queryRaw<{ n: bigint; nilai: bigint }[]>`
    SELECT COUNT(*)::bigint AS n, COALESCE(SUM(s.sub), 0)::bigint AS nilai FROM sale s JOIN shift sh ON sh.id = s.shift_id WHERE s.status = 'Void' AND ${syaratJual(r, s)}`
  const kategoriPilihan = [...[...kat.entries()].map(([kode, nama]) => ({ kode, nama })), { kode: KATEGORI_PAKET, nama: 'Paket set' }]
  return { rentang: r, kelompok, baris: hasil, jumlah, void: { n: N(v[0]?.n), nilai: N(v[0]?.nilai) }, kategoriPilihan }
}

// Syarat "sudah disetor": shift dan metode ada di setoran Diposting yang barisnya tidak batal. Pembayaran tunai
// dicocokkan ke setoran tunai mana pun, karena uang laci satu wadah.
const SUDAH_SETOR = Prisma.sql`EXISTS (
  SELECT 1 FROM pos_settlement_line sl JOIN pos_settlement st ON st.id = sl.pos_settlement_id JOIN payment_method lm ON lm.id = sl.payment_method_id
  WHERE sl.shift_id = s.shift_id AND NOT sl.cancelled AND st.status = 'Diposting'
    AND (sl.payment_method_id = p.payment_method_id OR (lm.kind = 'tunai' AND pm.kind = 'tunai')))`

// 3. Ringkasan Pembayaran per metode.
export type BarisBayar = { id: number; metode: string; n: number; nominal: number; mdr: number; neto: number; sudah: number; belum: number; mdrPct: number }

export async function ringkasanPembayaran(db: Db, s: SaringLaporan) {
  const r = rentang(s)
  const w = [Prisma.sql`s.status = 'Selesai'`, Prisma.sql`s.at >= ${awalHari(r.dari)} AND s.at <= ${akhirHari(r.sampai)}`]
  if (angka(s.kasir)) w.push(Prisma.sql`sh.user_id = ${angka(s.kasir)}`)
  if (angka(s.metode)) w.push(Prisma.sql`p.payment_method_id = ${angka(s.metode)}`)
  if (s.setoran === 'sudah') w.push(SUDAH_SETOR)
  if (s.setoran === 'belum') w.push(Prisma.sql`NOT ${SUDAH_SETOR}`)
  const baris = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT pm.id, pm.name, pm.mdr_pct::text AS mdr, COUNT(DISTINCT s.id)::bigint AS n, SUM(p.amount)::bigint AS nominal,
      COALESCE(SUM(p.amount) FILTER (WHERE ${SUDAH_SETOR}), 0)::bigint AS sudah
    FROM sale_payment p JOIN sale s ON s.id = p.sale_id JOIN shift sh ON sh.id = s.shift_id JOIN payment_method pm ON pm.id = p.payment_method_id
    WHERE ${Prisma.join(w, ' AND ')}
    GROUP BY pm.id, pm.name, pm.mdr_pct ORDER BY pm.id`
  const hasil: BarisBayar[] = baris.map((b) => {
    const nominal = N(b.nominal)
    const mdrPct = Number(b.mdr)
    const mdr = persen(nominal, mdrPct)
    return { id: N(b.id), metode: String(b.name), n: N(b.n), nominal, mdr, neto: nominal - mdr, sudah: N(b.sudah), belum: nominal - N(b.sudah), mdrPct }
  })
  const jumlah = hasil.reduce((a, b) => ({ ...a, n: a.n + b.n, nominal: a.nominal + b.nominal, mdr: a.mdr + b.mdr, neto: a.neto + b.neto, sudah: a.sudah + b.sudah, belum: a.belum + b.belum }), { id: 0, metode: 'Jumlah', n: 0, nominal: 0, mdr: 0, neto: 0, sudah: 0, belum: 0, mdrPct: 0 } as BarisBayar)
  // Transaksi dihitung per metode, jadi satu transaksi dengan dua metode muncul di dua baris. Jumlah transaksi
  // di baris Jumlah dihitung tanpa ganda.
  const unik = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT s.id)::bigint AS n FROM sale_payment p JOIN sale s ON s.id = p.sale_id JOIN shift sh ON sh.id = s.shift_id JOIN payment_method pm ON pm.id = p.payment_method_id
    WHERE ${Prisma.join(w, ' AND ')}`
  jumlah.n = N(unik[0]?.n)
  const wv = [Prisma.sql`s.status = 'Void'`, Prisma.sql`s.at >= ${awalHari(r.dari)} AND s.at <= ${akhirHari(r.sampai)}`]
  if (angka(s.kasir)) wv.push(Prisma.sql`sh.user_id = ${angka(s.kasir)}`)
  if (angka(s.metode)) wv.push(Prisma.sql`p.payment_method_id = ${angka(s.metode)}`)
  const v = await db.$queryRaw<{ n: bigint; nilai: bigint }[]>`
    SELECT COUNT(DISTINCT s.id)::bigint AS n, COALESCE(SUM(p.amount), 0)::bigint AS nilai FROM sale_payment p JOIN sale s ON s.id = p.sale_id JOIN shift sh ON sh.id = s.shift_id
    WHERE ${Prisma.join(wv, ' AND ')}`
  return { rentang: r, baris: hasil, jumlah, void: { n: N(v[0]?.n), nilai: N(v[0]?.nilai) } }
}

// 4. Tutup Harian POS: semua shift yang dibuka pada satu tanggal WIB.
export type SetoranRingkas = { id: number; no: string; status: string }

export async function tutupHarian(db: Db, s: SaringLaporan) {
  const tanggal = tanggalSah(s.tanggal) ?? tanggalIso(new Date())
  const shifts = await db.shift.findMany({
    where: { ...syaratShiftTanggal(tanggal), ...(angka(s.kasir) ? { userId: angka(s.kasir) } : {}) },
    orderBy: { openedAt: 'asc' },
    include: {
      user: { select: { name: true } },
      approver: { select: { name: true } },
      shiftCashMoves: { select: { kind: true, amount: true } },
      posSettlementLines: { where: { cancelled: false }, include: { posSettlement: { select: { id: true, no: true, status: true } } } },
    },
  })
  const ids = shifts.map((x) => x.id)
  const [bayar, jual, metode, tunaiUtama, setoranHari] = await Promise.all([
    db.salePayment.findMany({ where: { sale: { shiftId: { in: ids }, status: 'Selesai' } }, select: { amount: true, paymentMethodId: true, sale: { select: { shiftId: true } } } }),
    db.sale.groupBy({ by: ['shiftId', 'status'], where: { shiftId: { in: ids } }, _count: { _all: true }, _sum: { total: true } }),
    db.paymentMethod.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, kind: true } }),
    metodeTunaiUtama(db),
    db.posSettlement.findMany({ where: { date: keKolomTanggal(tanggal), status: { not: 'Batal' } }, include: { paymentMethod: { select: { name: true } } }, orderBy: { id: 'asc' } }),
  ])
  const jenis = new Map(metode.map((m) => [m.id, m]))
  const nonTunai = metode.filter((m) => m.kind !== 'tunai' && bayar.some((b) => b.paymentMethodId === m.id))
  const baris = shifts.map((sh) => {
    const milik = bayar.filter((b) => b.sale.shiftId === sh.id)
    const tunai = milik.filter((b) => jenis.get(b.paymentMethodId)?.kind === 'tunai').reduce((a, b) => a + Number(b.amount), 0)
    const masuk = sh.shiftCashMoves.filter((m) => m.kind === 'masuk').reduce((a, m) => a + Number(m.amount), 0)
    const keluar = sh.shiftCashMoves.filter((m) => m.kind === 'keluar').reduce((a, m) => a + Number(m.amount), 0)
    const perMetode = Object.fromEntries(nonTunai.map((m) => [m.id, milik.filter((b) => b.paymentMethodId === m.id).reduce((a, b) => a + Number(b.amount), 0)]))
    const selesai = jual.find((j) => j.shiftId === sh.id && j.status === 'Selesai')
    const batal = jual.find((j) => j.shiftId === sh.id && j.status === 'Void')
    // Status setoran per metode: nomor setoran yang memuat shift ini, "Belum" bila belum ada.
    const setoran: Record<string, SetoranRingkas | null> = {}
    for (const m of [...(tunaiUtama ? [tunaiUtama] : []), ...nonTunai]) {
      const l = sh.posSettlementLines.find((x) => x.paymentMethodId === m.id)
      setoran[m.id] = l ? { id: l.posSettlement.id, no: l.posSettlement.no, status: l.posSettlement.status } : null
    }
    return {
      id: sh.id,
      kasir: sh.user.name,
      buka: sh.openedAt,
      tutup: sh.closedAt,
      status: sh.status,
      namaStatus: STATUS_SHIFT[sh.status],
      persetujuan: sh.status === 'PerluPersetujuan' ? 'Menunggu Owner' : sh.approvedAt ? `Disetujui ${sh.approver?.name ?? ''}`.trim() : '-',
      modal: Number(sh.openCash),
      tunai,
      masuk,
      keluar,
      // Kas seharusnya dan selisih hanya ada sesudah shift ditutup (hitung buta, KONTRAK 11 butir 17).
      seharusnya: sh.expectedCash === null ? null : Number(sh.expectedCash),
      dihitung: sh.countedCash === null ? null : Number(sh.countedCash),
      selisih: sh.cashDiff === null ? null : Number(sh.cashDiff),
      perMetode,
      nTransaksi: selesai?._count._all ?? 0,
      penjualan: Number(selesai?._sum.total ?? 0),
      nVoid: batal?._count._all ?? 0,
      nilaiVoid: Number(batal?._sum.total ?? 0),
      setoran,
    }
  })
  // Belum disetor per metode: nilai sistem shift ditutup yang belum masuk setoran Diposting.
  const ditutup = shifts.filter((x) => x.status !== 'Buka')
  const belum: { metode: string; nilai: number; shift: number }[] = []
  for (const m of [...(tunaiUtama ? [tunaiUtama] : []), ...nonTunai]) {
    const nilai = await nilaiSistem(db, ditutup, m)
    const sisa = ditutup.filter((x) => !x.posSettlementLines.some((l) => l.paymentMethodId === m.id && l.posSettlement.status === 'Diposting') && (m.kind === 'tunai' || (nilai.get(x.id) ?? 0) !== 0))
    if (sisa.length) belum.push({ metode: m.name, nilai: sisa.reduce((a, x) => a + (nilai.get(x.id) ?? 0), 0), shift: sisa.length })
  }
  const ringkas = {
    shift: baris.length,
    masihBuka: baris.filter((b) => b.status === 'Buka').length,
    transaksi: baris.reduce((a, b) => a + b.nTransaksi, 0),
    penjualan: baris.reduce((a, b) => a + b.penjualan, 0),
    nVoid: baris.reduce((a, b) => a + b.nVoid, 0),
    nilaiVoid: baris.reduce((a, b) => a + b.nilaiVoid, 0),
    selisih: baris.reduce((a, b) => a + (b.selisih ?? 0), 0),
  }
  return {
    tanggal,
    baris,
    nonTunai: nonTunai.map((m) => ({ id: m.id, nama: m.name })),
    tunaiUtama: tunaiUtama ? { id: tunaiUtama.id, nama: tunaiUtama.name } : null,
    ringkas,
    setoran: setoranHari.map((x) => ({ id: x.id, no: x.no, metode: x.paymentMethod.name, status: x.status, sistem: Number(x.expectedTotal), disetor: Number(x.actualTotal), mdr: Number(x.mdrFee), selisih: Number(x.diff), tanggal: dariKolomTanggal(x.date) })),
    belum,
  }
}

// 5. Selisih kas per kasir: shift yang sudah ditutup dalam rentang, untuk memantau pola berulang (RANCANGAN 6.1).
export type BarisSelisihKasir = { id: number; kasir: string; n: number; nBeda: number; persenBeda: number; nKurang: number; kurang: number; nLebih: number; lebih: number; bersih: number; terbesar: number; nOwner: number }
export const PER_HALAMAN_SELISIH = 50

export async function selisihKas(db: Db, s: SaringLaporan) {
  const r = rentang(s)
  const w = [Prisma.sql`sh.status <> 'Buka'`, Prisma.sql`sh.opened_at >= ${awalHari(r.dari)} AND sh.opened_at <= ${akhirHari(r.sampai)}`]
  if (angka(s.kasir)) w.push(Prisma.sql`sh.user_id = ${angka(s.kasir)}`)
  const baris = await db.$queryRaw<Record<string, unknown>[]>`
    SELECT u.id, u.name, COUNT(*)::bigint AS n,
      COUNT(*) FILTER (WHERE sh.cash_diff <> 0)::bigint AS nbeda,
      COUNT(*) FILTER (WHERE sh.cash_diff < 0)::bigint AS nkurang, COALESCE(SUM(-sh.cash_diff) FILTER (WHERE sh.cash_diff < 0), 0)::bigint AS kurang,
      COUNT(*) FILTER (WHERE sh.cash_diff > 0)::bigint AS nlebih, COALESCE(SUM(sh.cash_diff) FILTER (WHERE sh.cash_diff > 0), 0)::bigint AS lebih,
      COALESCE(SUM(sh.cash_diff), 0)::bigint AS bersih, COALESCE(MAX(ABS(sh.cash_diff)), 0)::bigint AS terbesar,
      COUNT(*) FILTER (WHERE sh.status = 'PerluPersetujuan' OR sh.approved_by IS NOT NULL)::bigint AS nowner
    FROM shift sh JOIN app_user u ON u.id = sh.user_id
    WHERE ${Prisma.join(w, ' AND ')}
    GROUP BY u.id, u.name ORDER BY COUNT(*) FILTER (WHERE sh.cash_diff <> 0) DESC, u.name`
  const hasil: BarisSelisihKasir[] = baris.map((b) => ({
    id: N(b.id),
    kasir: String(b.name),
    n: N(b.n),
    nBeda: N(b.nbeda),
    persenBeda: N(b.n) ? Math.round((N(b.nbeda) / N(b.n)) * 100) : 0,
    nKurang: N(b.nkurang),
    kurang: N(b.kurang),
    nLebih: N(b.nlebih),
    lebih: N(b.lebih),
    bersih: N(b.bersih),
    terbesar: N(b.terbesar),
    nOwner: N(b.nowner),
  }))
  const hal = Math.max(1, Math.min(1000, Number(s.hal) || 1))
  const where: Prisma.ShiftWhereInput = { status: { not: 'Buka' }, cashDiff: { not: 0 }, openedAt: { gte: awalHari(r.dari), lte: akhirHari(r.sampai) }, ...(angka(s.kasir) ? { userId: angka(s.kasir) } : {}) }
  const [rinci, total] = await Promise.all([
    db.shift.findMany({ where, orderBy: { openedAt: 'desc' }, skip: (hal - 1) * PER_HALAMAN_SELISIH, take: PER_HALAMAN_SELISIH, include: { user: { select: { name: true } }, approver: { select: { name: true } } } }),
    db.shift.count({ where }),
  ])
  return { rentang: r, baris: hasil, rinci, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN_SELISIH)) }
}

// Pilihan saringan: kasir yang pernah punya shift, metode bayar, dan shift terbaru.
export async function pilihanSaring(db: Db) {
  const [kasir, metode, shift] = await Promise.all([
    db.appUser.findMany({ where: { shifts: { some: {} } }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    db.paymentMethod.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true } }),
    db.shift.findMany({ orderBy: { id: 'desc' }, take: 60, select: { id: true, openedAt: true, user: { select: { name: true } } } }),
  ])
  return { kasir, metode, shift }
}
