// Penjualan kasir dan void (tahap 3B). Tanpa Next, dipanggil aksi server dan tes.
// Jurnal dan potong stok dari resep belum dibuat di tahap ini (KONTRAK 11): sale.hpp diisi 0, dan jurnal serta
// mutasi stok penjualan dibentuk ulang dari data sale saat modulnya dibangun.
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { GalatAturan } from './aksi'
import { catatAudit, type Konteks } from './audit'
import type { Db, DbAtauTx } from './db'
import { angkaWa, bagiBayar, hitungTotal, persenMember, rupiah, tingkatMember } from './hitung-kasir'
import { isOwner, pastikanIzin, punyaIzin, saklarNyala, type Pengguna } from './izin-inti'
import { ambilNomor } from './nomor'
import { periksaPenyetujuVoid } from './pin'
import { kunciShift, lihatSemuaKasir } from './shift'
import { akhirHari, awalHari } from './waktu'

type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar' | 'peran'>

export const MODE = { dinein: 'Dine in', takeaway: 'Take away' } as const

const bulat = (pesan: string, min: number, maks: number) => z.coerce.number({ message: pesan }).int(pesan).min(min, pesan).max(maks, pesan)

export const skemaJual = z
  .object({
    mode: z.enum(['dinein', 'takeaway'], { message: 'Pilih dine in atau take away.' }),
    meja: z.string().trim().max(10, 'Nomor meja paling panjang 10 huruf.').default(''),
    memberId: z.coerce.number().int().positive().nullable().default(null),
    baris: z
      .array(z.object({ menuItemId: bulat('Menu tidak sah.', 1, 2_000_000_000), qty: bulat('Qty 1 sampai 999.', 1, 999), catatan: z.string().trim().max(80, 'Catatan baris paling panjang 80 huruf.').default('') }))
      .min(1, 'Keranjang masih kosong.')
      .max(100, 'Paling banyak 100 baris per transaksi.'),
    bayar: z.array(z.object({ metodeId: bulat('Metode bayar tidak sah.', 1, 2_000_000_000), jumlah: bulat('Jumlah bayar tidak sah.', 0, 1_000_000_000) })).max(10, 'Paling banyak 10 pembayaran.'),
  })
  .refine((d) => d.mode !== 'dinein' || d.meja !== '', { path: ['meja'], message: 'Isi nomor meja untuk dine in.' })

// Mengambil persen pajak dan service lokasi shift.
const biayaDari = (b: { taxPct: Prisma.Decimal; servicePct: Prisma.Decimal }) => ({ pajak: Number(b.taxPct), service: Number(b.servicePct) })

export async function cariMember(db: DbAtauTx, wa: string) {
  const digit = angkaWa(wa)
  if (digit.length < 5) return null
  const baris = await db.$queryRaw<{ id: number }[]>`
    SELECT id FROM member WHERE regexp_replace(regexp_replace(wa, '[^0-9]', '', 'g'), '^62', '0') = ${digit} LIMIT 1`
  if (!baris.length) return null
  const [m, tingkat] = await Promise.all([db.member.findUniqueOrThrow({ where: { id: baris[0].id } }), db.memberTier.findMany()])
  const t = tingkat.map((x) => ({ id: x.id, name: x.name, minVisits: x.minVisits, discountPct: Number(x.discountPct) }))
  return { id: m.id, name: m.name, tingkat: tingkatMember(m, t)?.name ?? '', persen: persenMember(m, t) }
}

export async function simpanPenjualan(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, 'kasir.layar', 'T')
  const d = skemaJual.parse(masukan)
  return db.$transaction(async (tx) => {
    const buka = await tx.shift.findFirst({ where: { userId: aktor.id, status: 'Buka' }, select: { id: true } })
    if (!buka) throw new GalatAturan('Belum ada shift terbuka atas namamu. Buka shift dulu.')
    const s = await kunciShift(tx, buka.id)
    if (!s || s.status !== 'Buka') throw new GalatAturan('Shift sudah ditutup. Buka shift baru dulu.')
    const lokasi = await tx.location.findUniqueOrThrow({ where: { id: s.locationId }, include: { branch: true } })

    const ids = [...new Set(d.baris.map((b) => b.menuItemId))]
    const menu = await tx.menuItem.findMany({ where: { id: { in: ids }, active: true } })
    if (menu.length !== ids.length) throw new GalatAturan('Ada menu yang sudah tidak aktif atau terhapus. Muat ulang layar kasir.')
    const per = new Map(menu.map((m) => [m.id, m]))
    const baris = d.baris.map((b) => ({ ...b, m: per.get(b.menuItemId)! }))

    let member: { id: number; name: string } | null = null
    let pctMember = 0
    if (d.memberId) {
      const m = await tx.member.findUnique({ where: { id: d.memberId } })
      if (!m) throw new GalatAturan('Member tidak ditemukan.', 'member')
      const tingkat = (await tx.memberTier.findMany()).map((x) => ({ id: x.id, minVisits: x.minVisits, discountPct: Number(x.discountPct) }))
      member = { id: m.id, name: m.name }
      pctMember = persenMember(m, tingkat)
    }

    const biaya = biayaDari(lokasi.branch)
    // Semua menu_item dihitung baris reguler (kena potongan member). Paket atau early set dari sesi A menyusul.
    const t = hitungTotal(baris.map((b) => ({ harga: Number(b.m.price), qty: b.qty, reguler: true })), pctMember, biaya)

    const idMetode = [...new Set(d.bayar.map((b) => b.metodeId))]
    const metode = await tx.paymentMethod.findMany({ where: { id: { in: idMetode }, active: true } })
    if (metode.length !== idMetode.length) throw new GalatAturan('Ada metode bayar yang tidak aktif. Muat ulang layar kasir.', 'bayar')
    const perMetode = new Map(metode.map((m) => [m.id, m]))
    const bagi = bagiBayar(
      t.total,
      d.bayar.map((b) => ({ metodeId: b.metodeId, jumlah: b.jumlah, tunai: perMetode.get(b.metodeId)!.kind === 'tunai', nama: perMetode.get(b.metodeId)!.name })),
    )
    if (!bagi.ok) throw new GalatAturan(bagi.pesan, 'bayar')

    const sekarang = new Date()
    const no = await ambilNomor(tx, 'sale', 'GB', sekarang)
    const jual = await tx.sale.create({
      data: {
        shiftId: s.id,
        memberId: member?.id ?? null,
        no,
        at: sekarang,
        mode: d.mode,
        tableNo: d.mode === 'dinein' ? d.meja : null,
        sub: BigInt(t.sub),
        disc: BigInt(t.disc),
        svc: BigInt(t.svc),
        tax: BigInt(t.tax),
        total: BigInt(t.total),
        hpp: 0n,
        memberPct: pctMember,
        svcPct: biaya.service,
        taxPct: biaya.pajak,
        createdBy: aktor.id,
        saleLines: { create: baris.map((b) => ({ menuItemId: b.m.id, qty: b.qty, price: b.m.price, note: b.catatan, hpp: 0n, name: b.m.name, category: b.m.category })) },
        salePayments: { create: bagi.baris.map((b) => ({ paymentMethodId: b.metodeId, amount: BigInt(b.amount), paid: BigInt(b.paid), change: BigInt(b.change) })) },
      },
    })
    if (member) await tx.member.update({ where: { id: member.id }, data: { visits: { increment: 1 } } })
    const namaBayar = bagi.baris.map((b) => `${perMetode.get(b.metodeId)!.name} ${rupiah(b.amount)}`).join(', ')
    await catatAudit(tx, k, {
      action: 'penjualan.simpan',
      docType: 'sale',
      docId: jual.id,
      summary: `Penjualan ${no} ${rupiah(t.total)} di shift #${s.id}${namaBayar ? `, ${namaBayar}` : ''}`,
      after: {
        no,
        shiftId: s.id,
        mode: d.mode,
        meja: d.mode === 'dinein' ? d.meja : null,
        member: member?.name ?? null,
        memberPct: pctMember,
        ...t,
        baris: baris.map((b) => ({ menu: b.m.name, qty: b.qty, harga: b.m.price, catatan: b.catatan })),
        bayar: bagi.baris.map((b) => ({ metode: perMetode.get(b.metodeId)!.name, amount: b.amount, paid: b.paid, change: b.change })),
      },
    })
    return { id: jual.id, no, total: t.total, kembalian: bagi.kembalian }
  })
}

export const skemaVoid = z.object({
  alasan: z.string().trim().min(3, 'Alasan void minimal 3 huruf.').max(200, 'Alasan paling panjang 200 huruf.'),
  penyetujuId: z.preprocess((v) => (v === '' || v === undefined || v === null ? null : v), z.coerce.number().int().positive().nullable()).default(null),
  pinPenyetuju: z.string().max(10).default(''),
})

// Void langsung butuh Ubah di kasir.transaksi dan saklar pos.void. Tanpa itu, void butuh PIN penyetuju yang berhak
// (RANCANGAN 8.3: Kasir meminta PIN Admin).
export const bolehVoidLangsung = (p: Pick<Pengguna, 'izin' | 'saklar'>) => punyaIzin(p.izin, 'kasir.transaksi', 'U') && saklarNyala(p, 'pos.void')

export async function voidPenjualan(db: Db, k: Konteks, aktor: Aktor, saleId: number, masukan: unknown) {
  pastikanIzin(aktor, 'kasir.transaksi', 'L')
  const d = skemaVoid.parse(masukan)
  const langsung = bolehVoidLangsung(aktor)
  let penyetuju: { id: number; name: string; roleCode: string } | null = null
  if (!langsung) {
    if (!d.penyetujuId) throw new GalatAturan('Pilih penyetuju void.', 'penyetujuId')
    if (!d.pinPenyetuju) throw new GalatAturan('Isi PIN penyetuju.', 'pinPenyetuju')
    // Cek isi transaksi dulu supaya PIN tidak dipakai menebak untuk transaksi yang memang tidak bisa di-void.
    // Peran calon penyetuju ikut menentukan boleh tidaknya void sesudah shift ditutup.
    const calon = await db.appUser.findUnique({ where: { id: d.penyetujuId }, select: { role: { select: { code: true } } } })
    await cekBisaVoid(db, aktor, saleId, { roleCode: calon?.role.code ?? '' })
    penyetuju = await periksaPenyetujuVoid(db, { userId: d.penyetujuId, pin: d.pinPenyetuju, ip: k.ip, userAgent: k.userAgent })
  }
  return db.$transaction(async (tx) => {
    const awal = await tx.sale.findUnique({ where: { id: saleId }, select: { shiftId: true } })
    if (!awal) throw new GalatAturan('Transaksi tidak ditemukan.')
    const s = await kunciShift(tx, awal.shiftId)
    await tx.$queryRaw`SELECT id FROM sale WHERE id = ${saleId} FOR UPDATE`
    const jual = await cekBisaVoid(tx, aktor, saleId, penyetuju)
    const baru = await tx.sale.update({
      where: { id: saleId },
      data: { status: 'Void', voidBy: aktor.id, voidAt: new Date(), voidReason: d.alasan, voidApprovedBy: penyetuju?.id ?? null },
    })
    if (jual.memberId) await tx.member.updateMany({ where: { id: jual.memberId, visits: { gt: 0 } }, data: { visits: { decrement: 1 } } })
    await catatAudit(tx, k, {
      action: 'penjualan.void',
      docType: 'sale',
      docId: saleId,
      summary: `Void ${jual.no} ${rupiah(jual.total)}${penyetuju ? `, disetujui ${penyetuju.name} dengan PIN` : ''}${s?.status !== 'Buka' ? ' sesudah shift ditutup' : ''}. Alasan: ${d.alasan}`,
      before: { status: jual.status },
      after: { status: 'Void', voidReason: d.alasan, voidApprovedBy: penyetuju?.id ?? null, shiftStatus: s?.status },
    })
    return baru
  })
}

// Aturan void: transaksi terlihat oleh aktor, belum void, dan shiftnya masih terbuka kecuali yang mengizinkan Owner.
async function cekBisaVoid(db: DbAtauTx, aktor: Aktor, saleId: number, penyetuju: { roleCode: string } | null) {
  const jual = await db.sale.findUnique({ where: { id: saleId }, include: { shift: { select: { userId: true, status: true } } } })
  if (!jual || (jual.shift.userId !== aktor.id && !lihatSemuaKasir(aktor))) throw new GalatAturan('Transaksi tidak ditemukan.')
  if (jual.status === 'Void') throw new GalatAturan('Transaksi ini sudah void.')
  const pemberiIzinOwner = penyetuju ? penyetuju.roleCode === 'owner' : isOwner(aktor)
  if (jual.shift.status !== 'Buka' && !pemberiIzinOwner) throw new GalatAturan('Shift transaksi ini sudah ditutup. Void sesudah shift ditutup hanya bisa oleh Owner.')
  return jual
}

export const PER_HALAMAN_JUAL = 50
export type SaringJual = { dari?: string; sampai?: string; shift?: string; metode?: string; status?: string; q?: string; hal?: string }

const tanggalSah = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined)

export function syaratJual(aktor: Aktor, s: SaringJual): Prisma.SaleWhereInput {
  const w: Prisma.SaleWhereInput = {}
  const dari = tanggalSah(s.dari)
  const sampai = tanggalSah(s.sampai)
  if (dari || sampai) w.at = { ...(dari ? { gte: awalHari(dari) } : {}), ...(sampai ? { lte: akhirHari(sampai) } : {}) }
  if (Number(s.shift) > 0) w.shiftId = Number(s.shift)
  if (Number(s.metode) > 0) w.salePayments = { some: { paymentMethodId: Number(s.metode) } }
  if (s.status === 'Selesai' || s.status === 'Void') w.status = s.status
  const q = s.q?.trim().slice(0, 30)
  if (q) w.no = { contains: q.toUpperCase() }
  if (!lihatSemuaKasir(aktor)) w.shift = { userId: aktor.id }
  return w
}

export async function daftarPenjualan(db: Db, aktor: Aktor, s: SaringJual) {
  const hal = Math.max(1, Math.min(1000, Number(s.hal) || 1))
  const where = syaratJual(aktor, s)
  const [baris, total, jumlah] = await Promise.all([
    db.sale.findMany({
      where,
      orderBy: { id: 'desc' },
      skip: (hal - 1) * PER_HALAMAN_JUAL,
      take: PER_HALAMAN_JUAL,
      include: { shift: { select: { id: true, user: { select: { name: true } } } }, salePayments: { include: { paymentMethod: { select: { name: true } } } } },
    }),
    db.sale.count({ where }),
    db.sale.aggregate({ where: { ...where, status: 'Selesai' }, _sum: { total: true }, _count: { _all: true } }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN_JUAL)), omzet: Number(jumlah._sum.total ?? 0), selesai: jumlah._count._all }
}

export async function ambilPenjualan(db: Db, aktor: Aktor, id: number) {
  const j = await db.sale.findUnique({
    where: { id },
    include: {
      saleLines: { orderBy: { id: 'asc' } },
      salePayments: { include: { paymentMethod: { select: { name: true, kind: true } } }, orderBy: { id: 'asc' } },
      member: { select: { name: true, wa: true } },
      shift: { select: { id: true, status: true, userId: true, user: { select: { name: true } }, location: { select: { name: true, branch: true } } } },
    },
  })
  if (!j || (j.shift.userId !== aktor.id && !lihatSemuaKasir(aktor))) return null
  const ids = [j.voidBy, j.voidApprovedBy, j.createdBy].filter((x): x is number => !!x)
  const nama = new Map((await db.appUser.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  return { ...j, namaVoid: j.voidBy ? nama.get(j.voidBy) : undefined, namaPenyetuju: j.voidApprovedBy ? nama.get(j.voidApprovedBy) : undefined, namaKasir: j.createdBy ? nama.get(j.createdBy) : j.shift.user.name }
}
