// Shift kasir (tahap 3B, RANCANGAN 6.1): buka dengan modal, kas masuk dan keluar laci, dan tutup dengan hitung buta.
// Sejak tahap 6C tutup shift selalu berhasil dengan kas dihitung yang dikirim, tanpa persetujuan Owner. Selisih tanpa
// alasan menandai shift (reason_missing) dan menahan kasirnya membuka shift baru sampai alasan diisi (KONTRAK 11
// butir 121). Persetujuan Owner hanya tersisa untuk shift lama yang masih "Perlu persetujuan".
// Tanpa Next, dipanggil aksi server dan tes.
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { GalatAturan } from './aksi'
import { jurnalKasLaci, jurnalSelisihShift } from './akuntansi/dokumen'
import { catatAudit, type Konteks } from './audit'
import type { Db, DbAtauTx, Tx } from './db'
import { pastikanIzin, punyaIzin, type Pengguna } from './izin-inti'
import { ALASAN_SELISIH_MIN, kasSeharusnya, PECAHAN, rupiah, totalPecahan } from './hitung-kasir'
import { akhirHari, awalHari } from './waktu'

type Aktor = Pick<Pengguna, 'id' | 'izin' | 'saklar' | 'peran'>

// Pemegang Lihat laporan penjualan melihat semua shift dan transaksi; selain itu hanya milik sendiri
// (RANCANGAN 8.2 "milik sendiri", admin lama memakai izin laporan untuk riwayat semua shift).
export const lihatSemuaKasir = (p: Pick<Pengguna, 'izin'>) => punyaIzin(p.izin, 'laporan.penjualan', 'L')

const BATAS_UANG = 1_000_000_000

// Rupiah dari isian teks: titik, spasi, dan "Rp" diabaikan.
export const uang = (pesan: string, opsi: { boleh0?: boolean } = {}) =>
  z.preprocess(
    (v) => (typeof v === 'number' ? String(v) : String(v ?? '').replace(/[^\d]/g, '')),
    z
      .string()
      .min(1, pesan)
      .transform(Number)
      .refine((n) => n <= BATAS_UANG, 'Nilai terlalu besar.')
      .refine((n) => opsi.boleh0 || n > 0, pesan),
  )

export const skemaBuka = z.object({ modal: uang('Isi modal awal laci.', { boleh0: true }) })

export const skemaKas = z.object({
  jenis: z.enum(['masuk', 'keluar'], { message: 'Pilih kas masuk atau kas keluar.' }),
  jumlah: uang('Isi jumlah kas lebih dari nol.'),
  alasan: z.string().trim().min(3, 'Alasan minimal 3 huruf.').max(120, 'Alasan paling panjang 120 huruf.'),
})

const jumlahLembar = z.preprocess((v) => String(v ?? '').replace(/[^\d]/g, '') || '0', z.string().transform(Number).refine((n) => n <= 100000, 'Jumlah lembar terlalu besar.'))

export const skemaTutup = z
  .object({
    kasDihitung: z.preprocess((v) => String(v ?? '').replace(/[^\d]/g, ''), z.string()),
    // Alasan selisih, boleh kosong. Aturannya sama untuk angka cocok maupun tidak, supaya hitung buta tidak bocor.
    catatan: z
      .string()
      .trim()
      .max(200, 'Alasan paling panjang 200 huruf.')
      .refine((t) => t === '' || t.length >= ALASAN_SELISIH_MIN, `Alasan minimal ${ALASAN_SELISIH_MIN} huruf, atau kosongkan.`)
      .default(''),
    ...Object.fromEntries(PECAHAN.map((p) => [`pecahan_${p}`, jumlahLembar])),
  })
  .transform((d, ctx) => {
    const lembar: Record<number, number> = {}
    for (const p of PECAHAN) {
      const n = (d as Record<string, unknown>)[`pecahan_${p}`] as number
      if (n > 0) lembar[p] = n
    }
    const dariPecahan = Object.keys(lembar).length > 0
    if (!dariPecahan && d.kasDihitung === '') {
      ctx.addIssue({ code: 'custom', path: ['kasDihitung'], message: 'Isi kas dihitung atau hitung per pecahan.' })
      return z.NEVER
    }
    const kas = dariPecahan ? totalPecahan(lembar) : Number(d.kasDihitung)
    if (kas > BATAS_UANG) {
      ctx.addIssue({ code: 'custom', path: ['kasDihitung'], message: 'Nilai terlalu besar.' })
      return z.NEVER
    }
    return { kas, lembar: dariPecahan ? lembar : null, catatan: d.catatan }
  })

export const skemaAlasan = z.object({
  alasan: z.string().trim().min(ALASAN_SELISIH_MIN, `Alasan minimal ${ALASAN_SELISIH_MIN} huruf.`).max(200, 'Alasan paling panjang 200 huruf.'),
})

export const skemaSetujui = z.object({ catatan: z.string().trim().min(3, 'Catatan persetujuan minimal 3 huruf.').max(200, 'Catatan paling panjang 200 huruf.') })

// Lokasi shift: lokasi bawaan pengguna, lalu lokasi aktif berjenis outlet, lalu lokasi aktif mana saja.
export async function lokasiKasir(db: DbAtauTx, userId: number) {
  const u = await db.appUser.findUnique({ where: { id: userId }, select: { location: { include: { branch: true } } } })
  if (u?.location?.active) return u.location
  return (
    (await db.location.findFirst({ where: { active: true, kind: 'outlet' }, include: { branch: true }, orderBy: { id: 'asc' } })) ??
    (await db.location.findFirst({ where: { active: true }, include: { branch: true }, orderBy: { id: 'asc' } }))
  )
}

export const shiftTerbuka = (db: DbAtauTx, userId: number) => db.shift.findFirst({ where: { userId, status: 'Buka' }, orderBy: { id: 'desc' } })

// Shift tertutup milik pengguna yang selisihnya belum beralasan (tahap 6C). Menahan buka shift baru.
export const shiftTanpaAlasan = (db: DbAtauTx, userId: number) => db.shift.findFirst({ where: { userId, reasonMissing: true }, orderBy: { id: 'asc' }, select: { id: true } })

// Mengunci baris shift sampai transaksi selesai. Penjualan, void, kas laci, dan tutup shift semuanya mengunci
// shift lebih dulu, jadi tidak ada penjualan yang lolos sesudah kas dihitung.
export async function kunciShift(tx: Tx, id: number) {
  await tx.$queryRaw`SELECT id FROM shift WHERE id = ${id} FOR UPDATE`
  return tx.shift.findUnique({ where: { id }, include: { user: { select: { id: true, name: true, username: true, roleId: true } } } })
}

export async function bukaShift(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, 'kasir.shift', 'T')
  const d = skemaBuka.parse(masukan)
  return db.$transaction(async (tx) => {
    // Kunci baris pengguna supaya dua permintaan bersamaan tidak membuka dua shift.
    await tx.$queryRaw`SELECT id FROM app_user WHERE id = ${aktor.id} FOR UPDATE`
    if (await shiftTerbuka(tx, aktor.id)) throw new GalatAturan('Kamu masih punya shift terbuka. Tutup dulu sebelum membuka shift baru.')
    const tanpaAlasan = await shiftTanpaAlasan(tx, aktor.id)
    if (tanpaAlasan) throw new GalatAturan(`Shift #${tanpaAlasan.id} ditutup dengan selisih kas tanpa alasan. Isi alasan selisihnya dulu di rincian shift #${tanpaAlasan.id}, lalu buka shift baru.`)
    const lokasi = await lokasiKasir(tx, aktor.id)
    if (!lokasi) throw new GalatAturan('Belum ada lokasi outlet aktif. Hubungi Owner.')
    const s = await tx.shift.create({ data: { userId: aktor.id, locationId: lokasi.id, openCash: BigInt(d.modal) } })
    await catatAudit(tx, k, {
      action: 'shift.buka',
      docType: 'shift',
      docId: s.id,
      summary: `Membuka shift #${s.id} di ${lokasi.name} dengan modal ${rupiah(d.modal)}`,
      after: { openCash: s.openCash, locationId: lokasi.id, status: s.status },
    })
    return s
  })
}

function pastikanPemilik(aktor: Aktor, s: { userId: number }) {
  if (s.userId !== aktor.id && !lihatSemuaKasir(aktor)) throw new GalatAturan('Shift tidak ditemukan.')
}

export async function catatKasLaci(db: Db, k: Konteks, aktor: Aktor, shiftId: number, masukan: unknown) {
  pastikanIzin(aktor, 'kasir.shift', 'U')
  const d = skemaKas.parse(masukan)
  return db.$transaction(async (tx) => {
    const s = await kunciShift(tx, shiftId)
    if (!s) throw new GalatAturan('Shift tidak ditemukan.')
    pastikanPemilik(aktor, s)
    if (s.status !== 'Buka') throw new GalatAturan('Shift sudah ditutup, kas laci tidak bisa dicatat lagi.')
    const m = await tx.shiftCashMove.create({ data: { shiftId, kind: d.jenis, amount: BigInt(d.jumlah), reason: d.alasan, createdBy: aktor.id } })
    // tahap 5B: kas laci di luar penjualan dijurnal ke lawan dari pemetaan laci_masuk atau laci_keluar.
    const jurnal = await jurnalKasLaci(tx, m.id, aktor.id)
    await catatAudit(tx, k, {
      action: 'shift.kas',
      docType: 'shift',
      docId: shiftId,
      summary: `Kas ${d.jenis} ${rupiah(d.jumlah)} di shift #${shiftId}: ${d.alasan}`,
      after: { moveId: m.id, kind: d.jenis, amount: m.amount, reason: d.alasan, jurnal: jurnal?.no ?? null },
    })
    return m
  })
}

// Uang tunai penjualan, kas masuk, dan kas keluar satu shift. Penjualan void tidak dihitung.
export async function angkaKasShift(db: DbAtauTx, shiftId: number) {
  const [tunai, gerak] = await Promise.all([
    db.salePayment.aggregate({ _sum: { amount: true }, where: { sale: { shiftId, status: 'Selesai' }, paymentMethod: { kind: 'tunai' } } }),
    db.shiftCashMove.groupBy({ by: ['kind'], _sum: { amount: true }, where: { shiftId } }),
  ])
  const dari = (jenis: string) => Number(gerak.find((g) => g.kind === jenis)?._sum.amount ?? 0)
  return { tunai: Number(tunai._sum.amount ?? 0), masuk: dari('masuk'), keluar: dari('keluar') }
}

export async function tutupShift(db: Db, k: Konteks, aktor: Aktor, shiftId: number, masukan: unknown) {
  pastikanIzin(aktor, 'kasir.shift', 'U')
  const d = skemaTutup.parse(masukan)
  return db.$transaction(async (tx) => {
    const s = await kunciShift(tx, shiftId)
    if (!s) throw new GalatAturan('Shift tidak ditemukan.')
    pastikanPemilik(aktor, s)
    if (s.status !== 'Buka') throw new GalatAturan('Shift ini sudah ditutup.')
    const a = await angkaKasShift(tx, shiftId)
    const harus = kasSeharusnya(Number(s.openCash), a.tunai, a.masuk, a.keluar)
    const selisih = d.kas - harus
    // Hitung buta (butir 17): tutup selalu berhasil dengan kas dihitung yang dikirim. Selisih tanpa alasan hanya
    // menandai shift, dan kasir mengisi alasannya sesudah melihat selisih di rincian shift (KONTRAK 11 butir 121).
    const reasonMissing = selisih !== 0 && d.catatan === ''
    const baru = await tx.shift.update({
      where: { id: shiftId },
      data: {
        closedAt: new Date(),
        closedBy: aktor.id,
        expectedCash: BigInt(harus),
        countedCash: BigInt(d.kas),
        cashDiff: BigInt(selisih),
        denominationsJson: (d.lembar ?? undefined) as Prisma.InputJsonValue | undefined,
        note: d.catatan,
        diffLimit: null,
        reasonMissing,
        status: 'Tutup',
      },
    })
    // tahap 5B: selisih kas dijurnal saat shift ditutup (RANCANGAN 6.1).
    const jurnal = await jurnalSelisihShift(tx, shiftId, aktor.id)
    await catatAudit(tx, k, {
      action: 'shift.tutup',
      docType: 'shift',
      docId: shiftId,
      summary: `Menutup shift #${shiftId} ${s.user.name}: seharusnya ${rupiah(harus)}, dihitung ${rupiah(d.kas)}, selisih ${selisih < 0 ? '-' : selisih > 0 ? '+' : ''}${rupiah(Math.abs(selisih))}${selisih === 0 ? '' : d.catatan ? `, alasan: ${d.catatan}` : ', alasan belum diisi'}`,
      before: { status: s.status },
      after: { status: 'Tutup', expectedCash: harus, countedCash: d.kas, cashDiff: selisih, denominations: d.lembar, note: d.catatan, reasonMissing, ...a, jurnal: jurnal?.no ?? null },
    })
    return baru
  })
}

// Alasan selisih diisi sesudah shift ditutup (tahap 6C): oleh kasir pemilik shift, atau oleh pemegang Lihat laporan
// penjualan (Owner dan Admin). Hanya untuk shift yang ditandai belum beralasan; angka shift dan jurnal tidak berubah.
export async function isiAlasanSelisih(db: Db, k: Konteks, aktor: Aktor, shiftId: number, masukan: unknown) {
  pastikanIzin(aktor, 'kasir.shift', 'U')
  const d = skemaAlasan.parse(masukan)
  return db.$transaction(async (tx) => {
    const s = await kunciShift(tx, shiftId)
    if (!s) throw new GalatAturan('Shift tidak ditemukan.')
    pastikanPemilik(aktor, s)
    if (!s.reasonMissing) throw new GalatAturan('Shift ini tidak sedang menunggu alasan selisih.')
    const baru = await tx.shift.update({ where: { id: shiftId }, data: { note: d.alasan, reasonMissing: false } })
    await catatAudit(tx, k, {
      action: 'shift.alasan_selisih',
      docType: 'shift',
      docId: shiftId,
      summary: `Mengisi alasan selisih ${rupiah(Number(s.cashDiff ?? 0))} shift #${shiftId} ${s.user.name}: ${d.alasan}`,
      before: { note: s.note, reasonMissing: true },
      after: { note: d.alasan, reasonMissing: false },
    })
    return baru
  })
}

// Hanya untuk shift lama yang ditutup sebelum tahap 6C dan masih berstatus "Perlu persetujuan" (KONTRAK 11 butir 121).
export async function setujuiShift(db: Db, k: Konteks, aktor: Aktor, shiftId: number, masukan: unknown) {
  pastikanIzin(aktor, 'kasir.shift', 'S')
  const d = skemaSetujui.parse(masukan)
  return db.$transaction(async (tx) => {
    const s = await kunciShift(tx, shiftId)
    if (!s) throw new GalatAturan('Shift tidak ditemukan.')
    if (s.status !== 'PerluPersetujuan') throw new GalatAturan('Shift ini tidak sedang menunggu persetujuan.')
    const baru = await tx.shift.update({ where: { id: shiftId }, data: { status: 'Tutup', approvedBy: aktor.id, approvedAt: new Date(), approvalNote: d.catatan } })
    await catatAudit(tx, k, {
      action: 'shift.setujui',
      docType: 'shift',
      docId: shiftId,
      summary: `Menyetujui selisih kas ${rupiah(Number(s.cashDiff ?? 0))} shift #${shiftId} ${s.user.name}: ${d.catatan}`,
      before: { status: s.status },
      after: { status: 'Tutup', approvalNote: d.catatan },
    })
    return baru
  })
}

export const PER_HALAMAN_SHIFT = 50
export const STATUS_SHIFT = { Buka: 'Buka', Tutup: 'Ditutup', PerluPersetujuan: 'Perlu persetujuan' } as const
export type SaringShift = { dari?: string; sampai?: string; status?: string; kasir?: string; hal?: string }

const tanggalSah = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) ? s : undefined)

export async function daftarShift(db: Db, aktor: Aktor, s: SaringShift) {
  const hal = Math.max(1, Math.min(1000, Number(s.hal) || 1))
  const dari = tanggalSah(s.dari)
  const sampai = tanggalSah(s.sampai)
  const where: Prisma.ShiftWhereInput = {}
  if (dari || sampai) where.openedAt = { ...(dari ? { gte: awalHari(dari) } : {}), ...(sampai ? { lte: akhirHari(sampai) } : {}) }
  if (s.status && s.status in STATUS_SHIFT) where.status = s.status as keyof typeof STATUS_SHIFT
  if (!lihatSemuaKasir(aktor)) where.userId = aktor.id
  else if (Number(s.kasir) > 0) where.userId = Number(s.kasir)
  const [baris, total] = await Promise.all([
    db.shift.findMany({ where, orderBy: { id: 'desc' }, skip: (hal - 1) * PER_HALAMAN_SHIFT, take: PER_HALAMAN_SHIFT, include: { user: { select: { name: true } }, location: { select: { name: true } }, _count: { select: { sales: { where: { status: 'Selesai' } } } } } }),
    db.shift.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN_SHIFT)) }
}

export async function ambilShift(db: Db, aktor: Aktor, id: number) {
  const s = await db.shift.findUnique({
    where: { id },
    include: { user: { select: { id: true, name: true, username: true } }, approver: { select: { name: true } }, location: { select: { name: true } }, shiftCashMoves: { orderBy: { id: 'asc' } } },
  })
  if (!s || (s.userId !== aktor.id && !lihatSemuaKasir(aktor))) return null
  return s
}

// Rekap per metode bayar untuk shift yang sudah ditutup (dipakai rincian dan layar sesudah tutup).
export async function rekapMetode(db: DbAtauTx, shiftId: number) {
  const [per, jumlah] = await Promise.all([
    db.salePayment.groupBy({ by: ['paymentMethodId'], _sum: { amount: true }, _count: { _all: true }, where: { sale: { shiftId, status: 'Selesai' } } }),
    db.sale.groupBy({ by: ['status'], _count: { _all: true }, _sum: { total: true, rounding: true }, where: { shiftId } }),
  ])
  const metode = await db.paymentMethod.findMany({ where: { id: { in: per.map((p) => p.paymentMethodId) } } })
  return {
    metode: per.map((p) => ({ nama: metode.find((m) => m.id === p.paymentMethodId)?.name ?? `#${p.paymentMethodId}`, n: p._count._all, total: Number(p._sum.amount ?? 0) })),
    selesai: jumlah.find((j) => j.status === 'Selesai')?._count._all ?? 0,
    void: jumlah.find((j) => j.status === 'Void')?._count._all ?? 0,
    omzet: Number(jumlah.find((j) => j.status === 'Selesai')?._sum.total ?? 0),
    // Pembulatan tunai (KONTRAK 11 butir 142): jumlah per metode = omzet + pembulatan.
    pembulatan: Number(jumlah.find((j) => j.status === 'Selesai')?._sum.rounding ?? 0),
  }
}
