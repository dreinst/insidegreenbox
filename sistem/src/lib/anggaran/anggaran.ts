// Anggaran tahunan per akun pendapatan, HPP, dan beban, dirinci per bulan (tahap 6B, RANCANGAN 8.2 "Anggaran dan
// realisasi" Owner L T U H S, Admin L). Status Draft, Disetujui, Batal. Anggaran Disetujui tidak diubah: revisinya
// dibuat dengan menyalin menjadi versi baru (Draft), dan saat versi baru disetujui versi lama ditandai digantikan,
// sehingga riwayat setiap versi tetap ada. Satu anggaran yang berlaku per tahun. Tanpa impor Next.
import type { AccountKind } from '@/generated/prisma/client'
import { z } from 'zod'
import { GalatAturan } from '../aksi'
import { catatAudit, selisih, type Konteks } from '../audit'
import { idSkema, kunciBaris, pastikanSalahSatu, type Aktor } from '../beli/dokumen'
import type { Db, DbAtauTx, Tx } from '../db'
import { pastikanIzin } from '../izin-inti'
import { formatRupiah, PER_HALAMAN, sesuaiHalaman, skemaUang } from '../master'
import { ambilNomor } from '../nomor'
import { hariIni } from '../stok/dokumen'

export const MENU_ANGGARAN = 'anggaran.anggaran'
export const JENIS_ANGGARAN: AccountKind[] = ['Pendapatan', 'HPP', 'Beban']
const BATAS = 100_000_000_000n

export const NAMA_BULAN_PENDEK = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']

const skemaTahun = z
  .string()
  .trim()
  .regex(/^\d{4}$/, 'Tahun berupa empat angka, misalnya 2027.')
  .transform(Number)
  .pipe(z.number().min(2000, 'Tahun paling awal 2000.').max(2100, 'Tahun paling akhir 2100.'))

export const skemaAnggaran = z.object({
  name: z.string().trim().min(3, 'Nama anggaran minimal 3 huruf.').max(80, 'Nama anggaran paling panjang 80 huruf.'),
  year: skemaTahun,
  note: z.string().trim().max(300, 'Catatan paling panjang 300 huruf.').default(''),
})

export const skemaAkunAnggaran = z.object({
  accountId: idSkema('akun'),
  tahunan: z.string().default('').pipe(skemaUang({ label: 'Jumlah setahun', min: 0n, max: BATAS * 12n, wajib: false })),
})

// Jumlah setahun dibagi rata ke 12 bulan; sisa pembagian masuk Desember.
export function bagiRata(total: bigint) {
  const per = total / 12n
  return Array.from({ length: 12 }, (_, i) => (i === 11 ? total - per * 11n : per))
}

async function muatDraf(tx: Tx, id: number) {
  await kunciBaris(tx, 'budget', id)
  const b = await tx.budget.findUnique({ where: { id } })
  if (!b) throw new GalatAturan('Anggaran tidak ditemukan.')
  if (b.status !== 'Draft') throw new GalatAturan('Hanya draf anggaran yang bisa diubah. Untuk anggaran Disetujui, buat revisi.')
  return b
}

export async function buatAnggaran(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU_ANGGARAN, 'T')
  const d = skemaAnggaran.parse(masukan)
  return db.$transaction(async (tx) => {
    const no = await ambilNomor(tx, 'budget', 'AG', hariIni())
    const b = await tx.budget.create({ data: { ...d, no, version: 1, status: 'Draft', createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'anggaran.tambah', docType: 'budget', docId: b.id, summary: `Membuat draf anggaran ${no} ${d.name} tahun ${d.year}`, after: { no, ...d } })
    return b
  })
}

export async function ubahKepalaAnggaran(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU_ANGGARAN, ['T', 'U'])
  const d = skemaAnggaran.parse(masukan)
  return db.$transaction(async (tx) => {
    const b = await muatDraf(tx, id)
    if (b.revisedFromId && d.year !== b.year) throw new GalatAturan('Tahun revisi harus sama dengan anggaran asalnya.', 'year')
    const beda = selisih({ name: b.name, year: b.year, note: b.note }, d)
    if (!beda.berubah.length) return 0
    await tx.budget.update({ where: { id }, data: { ...d, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'anggaran.ubah', docType: 'budget', docId: id, summary: `Mengubah kepala anggaran ${b.no}`, before: beda.sebelum, after: beda.sesudah })
    return beda.berubah.length
  })
}

async function akunBoleh(tx: DbAtauTx, id: number) {
  const a = await tx.account.findUnique({ where: { id } })
  if (!a || !a.active || !a.isPostable) throw new GalatAturan('Akun tidak ditemukan, nonaktif, atau akun induk.', 'accountId')
  if (!JENIS_ANGGARAN.includes(a.kind)) throw new GalatAturan('Anggaran hanya untuk akun pendapatan, HPP, dan beban.', 'accountId')
  return a
}

// Menambah satu akun ke draf dengan 12 baris bulanan dari jumlah setahun yang dibagi rata.
export async function tambahAkunAnggaran(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanSalahSatu(aktor, MENU_ANGGARAN, ['T', 'U'])
  const d = skemaAkunAnggaran.parse(masukan)
  return db.$transaction(async (tx) => {
    const b = await muatDraf(tx, id)
    const a = await akunBoleh(tx, d.accountId)
    if (await tx.budgetLine.count({ where: { budgetId: id, accountId: a.id } })) throw new GalatAturan(`${a.code} ${a.name} sudah ada di anggaran ini.`, 'accountId')
    if ((await tx.budgetLine.groupBy({ by: ['accountId'], where: { budgetId: id } })).length >= 150) throw new GalatAturan('Satu anggaran paling banyak 150 akun.')
    const bulan = bagiRata(d.tahunan)
    await tx.budgetLine.createMany({ data: bulan.map((amount, i) => ({ budgetId: id, accountId: a.id, month: i + 1, amount })) })
    await tx.budget.update({ where: { id }, data: { updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'anggaran.akun_tambah', docType: 'budget', docId: id, summary: `Menambah ${a.code} ${a.name} ke anggaran ${b.no}, setahun ${formatRupiah(d.tahunan)}`, after: { akun: a.code, tahunan: d.tahunan, bulan } })
  })
}

export async function hapusAkunAnggaran(db: Db, k: Konteks, aktor: Aktor, id: number, accountId: number) {
  pastikanSalahSatu(aktor, MENU_ANGGARAN, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const b = await muatDraf(tx, id)
    const baris = await tx.budgetLine.findMany({ where: { budgetId: id, accountId }, include: { account: true }, orderBy: { month: 'asc' } })
    if (!baris.length) throw new GalatAturan('Akun itu tidak ada di anggaran ini.')
    await tx.budgetLine.deleteMany({ where: { budgetId: id, accountId } })
    await catatAudit(tx, k, { action: 'anggaran.akun_hapus', docType: 'budget', docId: id, summary: `Menghapus ${baris[0].account.code} ${baris[0].account.name} dari anggaran ${b.no}`, before: { akun: baris[0].account.code, bulan: baris.map((x) => x.amount) } })
  })
}

// Simpan semua isian rincian (n_<id akun>_<bulan>). Isian yang tidak dikirim tidak berubah.
export async function simpanRincianAnggaran(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: Record<string, unknown>) {
  pastikanSalahSatu(aktor, MENU_ANGGARAN, ['T', 'U'])
  return db.$transaction(async (tx) => {
    const b = await muatDraf(tx, id)
    const baris = await tx.budgetLine.findMany({ where: { budgetId: id }, include: { account: { select: { code: true } } } })
    const ubah: { akun: string; bulan: number; sebelum: bigint; sesudah: bigint }[] = []
    for (const x of baris) {
      const kunci = `n_${x.accountId}_${x.month}`
      if (!(kunci in masukan)) continue
      const v = skemaUang({ label: `${x.account.code} ${NAMA_BULAN_PENDEK[x.month - 1]}`, min: 0n, max: BATAS, wajib: false }).safeParse(String(masukan[kunci] ?? ''))
      if (!v.success) throw new GalatAturan(v.error.issues[0].message, kunci)
      if (v.data === x.amount) continue
      await tx.budgetLine.update({ where: { id: x.id }, data: { amount: v.data } })
      ubah.push({ akun: x.account.code, bulan: x.month, sebelum: x.amount, sesudah: v.data })
    }
    if (!ubah.length) return 0
    await tx.budget.update({ where: { id }, data: { updatedBy: aktor.id } })
    const total = (await tx.budgetLine.aggregate({ where: { budgetId: id }, _sum: { amount: true } }))._sum.amount ?? 0n
    await catatAudit(tx, k, {
      action: 'anggaran.rincian',
      docType: 'budget',
      docId: id,
      summary: `Mengubah ${ubah.length} angka anggaran ${b.no}, total ${formatRupiah(total)}`,
      before: ubah.map((u) => ({ akun: u.akun, bulan: u.bulan, jumlah: u.sebelum })),
      after: ubah.map((u) => ({ akun: u.akun, bulan: u.bulan, jumlah: u.sesudah })),
    })
    return ubah.length
  })
}

export async function hapusAnggaran(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU_ANGGARAN, 'H')
  return db.$transaction(async (tx) => {
    const b = await muatDraf(tx, id)
    await tx.budget.delete({ where: { id } })
    await catatAudit(tx, k, { action: 'anggaran.hapus', docType: 'budget', docId: id, summary: `Menghapus draf anggaran ${b.no} ${b.name}`, before: { no: b.no, name: b.name, year: b.year, version: b.version } })
  })
}

// Anggaran yang berlaku untuk tahun itu (Disetujui dan belum digantikan revisi).
export const anggaranBerlaku = (db: DbAtauTx, tahun: number) => db.budget.findFirst({ where: { year: tahun, status: 'Disetujui', replacedAt: null } })

export async function setujuiAnggaran(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU_ANGGARAN, 'S')
  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('anggaran_setuju'))`
    const b = await muatDraf(tx, id)
    const total = (await tx.budgetLine.aggregate({ where: { budgetId: id }, _sum: { amount: true } }))._sum.amount ?? 0n
    if (total <= 0n) throw new GalatAturan('Isi minimal satu angka anggaran lebih dari 0 dulu.')
    const berlaku = await anggaranBerlaku(tx, b.year)
    const sekarang = new Date()
    let diganti: string | null = null
    if (berlaku) {
      if (berlaku.id !== b.revisedFromId) throw new GalatAturan(`Tahun ${b.year} sudah punya anggaran Disetujui ${berlaku.no}. Buat revisi dari anggaran itu supaya riwayatnya tersimpan.`)
      await tx.budget.update({ where: { id: berlaku.id }, data: { replacedAt: sekarang, replacedBy: aktor.id, updatedBy: aktor.id } })
      diganti = berlaku.no
    }
    await tx.budget.update({ where: { id }, data: { status: 'Disetujui', approvedBy: aktor.id, approvedAt: sekarang, updatedBy: aktor.id } })
    await catatAudit(tx, k, {
      action: 'anggaran.setujui',
      docType: 'budget',
      docId: id,
      summary: `Menyetujui anggaran ${b.no} ${b.name} tahun ${b.year} versi ${b.version}, total ${formatRupiah(total)}${diganti ? `, menggantikan ${diganti}` : ''}`,
      before: { status: b.status },
      after: { status: 'Disetujui', total, menggantikan: diganti },
    })
  })
}

// Draft dibatalkan pemegang Ubah; anggaran Disetujui yang masih berlaku dibatalkan pemegang Setujui dengan alasan.
export async function batalAnggaran(db: Db, k: Konteks, aktor: Aktor, id: number, alasan: string) {
  pastikanIzin(aktor, MENU_ANGGARAN, 'L')
  const teks = alasan.trim()
  if (teks.length > 300) throw new GalatAturan('Alasan paling panjang 300 huruf.', 'alasan')
  return db.$transaction(async (tx) => {
    await kunciBaris(tx, 'budget', id)
    const b = await tx.budget.findUnique({ where: { id } })
    if (!b) throw new GalatAturan('Anggaran tidak ditemukan.')
    if (b.status === 'Draft') pastikanIzin(aktor, MENU_ANGGARAN, 'U')
    else if (b.status === 'Disetujui') {
      pastikanIzin(aktor, MENU_ANGGARAN, 'S')
      if (b.replacedAt) throw new GalatAturan('Anggaran ini sudah digantikan revisinya, jadi tidak perlu dibatalkan.')
      if (teks.length < 5) throw new GalatAturan('Tulis alasan pembatalan, minimal 5 huruf.', 'alasan')
    } else throw new GalatAturan('Anggaran ini sudah dibatalkan.')
    await tx.budget.update({ where: { id }, data: { status: 'Batal', cancelledBy: aktor.id, cancelledAt: new Date(), cancelReason: teks || null, updatedBy: aktor.id } })
    // Membatalkan revisi yang sedang berlaku mengembalikan versi asalnya menjadi berlaku lagi, supaya tahun itu tidak
    // tiba-tiba tanpa anggaran (audit C-10).
    let dipulihkan: string | null = null
    if (b.status === 'Disetujui' && b.revisedFromId) {
      await kunciBaris(tx, 'budget', b.revisedFromId)
      const asal = await tx.budget.findUnique({ where: { id: b.revisedFromId } })
      if (asal && asal.status === 'Disetujui' && asal.replacedAt) {
        await tx.budget.update({ where: { id: asal.id }, data: { replacedAt: null, replacedBy: null, updatedBy: aktor.id } })
        dipulihkan = asal.no
      }
    }
    await catatAudit(tx, k, {
      action: 'anggaran.batal',
      docType: 'budget',
      docId: id,
      summary: `Membatalkan anggaran ${b.no} ${b.name}${dipulihkan ? `; ${dipulihkan} berlaku lagi` : ''}${teks ? `. Alasan: ${teks}` : ''}`,
      before: { status: b.status },
      after: { status: 'Batal', ...(dipulihkan ? { dipulihkan } : {}) },
    })
  })
}

// Revisi: salin anggaran Disetujui yang berlaku menjadi draf versi berikutnya. Satu draf revisi terbuka per anggaran.
export async function revisiAnggaran(db: Db, k: Konteks, aktor: Aktor, id: number) {
  pastikanIzin(aktor, MENU_ANGGARAN, 'T')
  return db.$transaction(async (tx) => {
    await kunciBaris(tx, 'budget', id)
    const asal = await tx.budget.findUnique({ where: { id }, include: { budgetLines: true } })
    if (!asal) throw new GalatAturan('Anggaran tidak ditemukan.')
    if (asal.status !== 'Disetujui' || asal.replacedAt) throw new GalatAturan('Revisi dibuat dari anggaran Disetujui yang masih berlaku.')
    const terbuka = await tx.budget.findFirst({ where: { revisedFromId: id, status: 'Draft' } })
    if (terbuka) throw new GalatAturan(`Sudah ada draf revisi ${terbuka.no}. Lanjutkan atau batalkan draf itu dulu.`)
    const versi = ((await tx.budget.aggregate({ where: { year: asal.year, OR: [{ id }, { revisedFromId: id }] }, _max: { version: true } }))._max.version ?? asal.version) + 1
    const no = await ambilNomor(tx, 'budget', 'AG', hariIni())
    const b = await tx.budget.create({ data: { no, name: asal.name, year: asal.year, note: asal.note, version: Math.max(versi, asal.version + 1), revisedFromId: id, status: 'Draft', createdBy: aktor.id, updatedBy: aktor.id } })
    if (asal.budgetLines.length) await tx.budgetLine.createMany({ data: asal.budgetLines.map((x) => ({ budgetId: b.id, accountId: x.accountId, month: x.month, amount: x.amount, note: x.note })) })
    await catatAudit(tx, k, { action: 'anggaran.revisi', docType: 'budget', docId: b.id, summary: `Membuat revisi ${no} versi ${b.version} dari anggaran ${asal.no}`, after: { no, dari: asal.no, version: b.version, baris: asal.budgetLines.length } })
    return b
  })
}

export type SaringAnggaran = { tahun?: string; status?: string; hal?: string }

export async function daftarAnggaran(db: Db, s: SaringAnggaran) {
  const hal = sesuaiHalaman(s.hal)
  const where = {
    ...(s.tahun && /^\d{4}$/.test(s.tahun) ? { year: Number(s.tahun) } : {}),
    ...(s.status === 'Draft' || s.status === 'Disetujui' || s.status === 'Batal' ? { status: s.status as 'Draft' | 'Disetujui' | 'Batal' } : {}),
  }
  const [baris, total] = await Promise.all([
    db.budget.findMany({ where, orderBy: [{ year: 'desc' }, { version: 'desc' }, { id: 'desc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.budget.count({ where }),
  ])
  const jumlah = baris.length ? await db.budgetLine.groupBy({ by: ['budgetId'], where: { budgetId: { in: baris.map((b) => b.id) } }, _sum: { amount: true } }) : []
  const peta = new Map(jumlah.map((j) => [j.budgetId, j._sum.amount ?? 0n]))
  return { baris: baris.map((b) => ({ ...b, jumlah: peta.get(b.id) ?? 0n })), total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}

export async function muatAnggaran(db: DbAtauTx, id: number) {
  const b = await db.budget.findUnique({
    where: { id },
    include: {
      budgetLines: { include: { account: { select: { id: true, code: true, name: true, kind: true } } }, orderBy: [{ accountId: 'asc' }, { month: 'asc' }] },
      revisedFrom: { select: { id: true, no: true, version: true } },
      revisions: { select: { id: true, no: true, version: true, status: true }, orderBy: { version: 'asc' } },
    },
  })
  if (!b) return null
  const akun = new Map<number, { id: number; code: string; name: string; kind: AccountKind; bulan: bigint[]; total: bigint }>()
  for (const x of b.budgetLines) {
    if (!akun.has(x.accountId)) akun.set(x.accountId, { ...x.account, bulan: Array(12).fill(0n), total: 0n })
    const a = akun.get(x.accountId)!
    a.bulan[x.month - 1] = x.amount
    a.total += x.amount
  }
  const urut = [...akun.values()].sort((x, y) => x.code.localeCompare(y.code, 'id', { numeric: true }))
  return { ...b, akun: urut, total: urut.reduce((n, a) => n + a.total, 0n) }
}

// Akun yang boleh ditambahkan ke anggaran (pendapatan, HPP, beban; aktif dan bisa diposting).
export const pilihanAkunAnggaran = (db: DbAtauTx) =>
  db.account.findMany({ where: { kind: { in: JENIS_ANGGARAN }, active: true, isPostable: true }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, kind: true } })
