// Master bagan akun (COA) dan pemetaan akun (tahap 5B, RANCANGAN 8.2 "Akun (COA) dan pemetaan akun", menu akun.coa).
// Akun tidak dihapus, hanya dinonaktifkan. Akun yang sudah punya jurnal tidak bisa diganti jenisnya. Tanpa impor Next.
import { z } from 'zod'
import type { AccountKind, Prisma } from '@/generated/prisma/client'
import { GalatAturan } from '../aksi'
import { catatAudit, type Konteks } from '../audit'
import type { Db, DbAtauTx } from '../db'
import { pastikanIzin, type Pengguna } from '../izin-inti'
import { jenisUntukKunci, KUNCI_PER_KODE, KUNCI_UMUM, kunciSah, TURUNAN } from './pemetaan'

type Aktor = Pick<Pengguna, 'id' | 'izin'>
const MENU = 'akun.coa'

export const JENIS_AKUN: Record<AccountKind, string> = { Aset: 'Aset', Kewajiban: 'Kewajiban', Ekuitas: 'Ekuitas', Pendapatan: 'Pendapatan', HPP: 'HPP', Beban: 'Beban' }
export const URUT_JENIS: AccountKind[] = ['Aset', 'Kewajiban', 'Ekuitas', 'Pendapatan', 'HPP', 'Beban']
// Saldo normal: debit untuk aset, HPP, dan beban; kredit untuk kewajiban, ekuitas, dan pendapatan.
export const normalDebit = (k: AccountKind) => k === 'Aset' || k === 'HPP' || k === 'Beban'

const centang = z.preprocess((v) => v === 'on' || v === 'true' || v === true, z.boolean())

export const skemaAkun = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'Isi kode akun.')
    .max(20, 'Kode akun paling panjang 20 karakter.')
    .regex(/^[0-9A-Za-z][0-9A-Za-z.-]*$/, 'Kode akun hanya angka, huruf, titik, dan tanda hubung.'),
  name: z.string().trim().min(2, 'Nama akun minimal 2 huruf.').max(80, 'Nama akun paling panjang 80 huruf.'),
  kind: z.enum(URUT_JENIS as [AccountKind, ...AccountKind[]], { message: 'Pilih jenis akun.' }),
  parentId: z.preprocess((v) => (v === '' || v === undefined || v === null ? null : v), z.coerce.number().int().positive().nullable()),
  isPostable: centang,
  isCashBank: centang,
  note: z.string().trim().max(200, 'Keterangan paling panjang 200 huruf.').default(''),
})

const jumlahJurnal = (db: DbAtauTx, id: number) => db.journalLine.count({ where: { accountId: id } })

async function periksaInduk(tx: DbAtauTx, d: z.infer<typeof skemaAkun>, id?: number) {
  if (d.parentId === null) return
  if (d.parentId === id) throw new GalatAturan('Akun tidak bisa menjadi induk dirinya sendiri.', 'parentId')
  const induk = await tx.account.findUnique({ where: { id: d.parentId } })
  if (!induk) throw new GalatAturan('Akun induk tidak ditemukan.', 'parentId')
  if (induk.isPostable) throw new GalatAturan(`${induk.code} ${induk.name} adalah akun transaksi, bukan akun induk. Pilih akun induk (pengelompok).`, 'parentId')
  if (induk.kind !== d.kind) throw new GalatAturan(`Jenis akun harus sama dengan induknya (${JENIS_AKUN[induk.kind]}).`, 'kind')
  // Cegah lingkaran: induk tidak boleh keturunan akun ini.
  if (id) {
    let cek: number | null = induk.parentId
    for (let i = 0; cek && i < 20; i++) {
      if (cek === id) throw new GalatAturan('Induk yang dipilih adalah turunan akun ini.', 'parentId')
      cek = (await tx.account.findUnique({ where: { id: cek }, select: { parentId: true } }))?.parentId ?? null
    }
  }
}

async function kodeUnik(tx: DbAtauTx, code: string, kecuali?: number) {
  const ada = await tx.account.findFirst({ where: { code: { equals: code, mode: 'insensitive' }, ...(kecuali ? { id: { not: kecuali } } : {}) } })
  if (ada) throw new GalatAturan(`Kode ${code} sudah dipakai ${ada.name}.`, 'code')
}

export async function tambahAkun(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaAkun.parse(masukan)
  return db.$transaction(async (tx) => {
    await kodeUnik(tx, d.code)
    await periksaInduk(tx, d)
    const a = await tx.account.create({ data: { ...d, isCashBank: d.isPostable && d.isCashBank && d.kind === 'Aset', createdBy: aktor.id, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'akun.tambah', docType: 'account', docId: a.id, summary: `Menambah akun ${a.code} ${a.name} (${JENIS_AKUN[a.kind]})`, after: d })
    return a
  })
}

export async function ubahAkun(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaAkun.parse(masukan)
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM account WHERE id = ${id} FOR UPDATE`
    const a = await tx.account.findUnique({ where: { id }, include: { _count: { select: { children: true, accountMappings: true } } } })
    if (!a) throw new GalatAturan('Akun tidak ditemukan.')
    await kodeUnik(tx, d.code, id)
    await periksaInduk(tx, d, id)
    const jurnal = await jumlahJurnal(tx, id)
    if (d.kind !== a.kind) {
      if (jurnal) throw new GalatAturan(`Jenis akun tidak bisa diubah karena akun ini sudah punya ${jurnal} baris jurnal.`, 'kind')
      if (a._count.children) throw new GalatAturan('Jenis akun induk tidak bisa diubah selama masih punya akun anak.', 'kind')
      const peta = await tx.accountMapping.findMany({ where: { accountId: id }, select: { key: true } })
      const salah = peta.find((m) => !jenisUntukKunci(m.key).includes(d.kind))
      if (salah) throw new GalatAturan(`Akun ini dipetakan ke "${salah.key}" yang butuh jenis ${jenisUntukKunci(salah.key).map((j) => JENIS_AKUN[j]).join(' atau ')}.`, 'kind')
    }
    if (!d.isPostable && a.isPostable) {
      if (jurnal) throw new GalatAturan('Akun yang sudah punya jurnal tidak bisa dijadikan akun induk.', 'isPostable')
      if (a._count.accountMappings) throw new GalatAturan('Akun yang dipakai di Pemetaan Akun tidak bisa dijadikan akun induk.', 'isPostable')
    }
    if (d.isPostable && !a.isPostable && a._count.children) throw new GalatAturan('Akun induk yang masih punya akun anak tidak bisa dijadikan akun transaksi.', 'isPostable')
    const data = { ...d, isCashBank: d.isPostable && d.isCashBank && d.kind === 'Aset' }
    const sebelum: Record<string, unknown> = {}
    const sesudah: Record<string, unknown> = {}
    for (const kunci of Object.keys(data) as (keyof typeof data)[]) {
      if (String(a[kunci] ?? '') !== String(data[kunci] ?? '')) {
        sebelum[kunci] = a[kunci]
        sesudah[kunci] = data[kunci]
      }
    }
    if (!Object.keys(sesudah).length) return { berubah: false }
    await tx.account.update({ where: { id }, data: { ...data, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: 'akun.ubah', docType: 'account', docId: id, summary: `Mengubah akun ${data.code} ${data.name}`, before: sebelum, after: sesudah })
    return { berubah: true }
  })
}

export async function ubahStatusAkun(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM account WHERE id = ${id} FOR UPDATE`
    const a = await tx.account.findUnique({ where: { id }, include: { parent: true, accountMappings: { select: { key: true } } } })
    if (!a) throw new GalatAturan('Akun tidak ditemukan.')
    if (a.active === aktif) return a
    if (!aktif) {
      if (a.accountMappings.length) throw new GalatAturan(`Akun ini masih dipakai di Pemetaan Akun (${a.accountMappings.map((m) => m.key).join(', ')}). Pindahkan pemetaannya dulu.`)
      if (await tx.account.count({ where: { parentId: id, active: true } })) throw new GalatAturan('Akun ini masih punya akun anak yang aktif. Nonaktifkan akun anaknya dulu.')
      const [s] = await tx.$queryRaw<{ saldo: bigint }[]>`
        SELECT COALESCE(SUM(l.debit - l.credit), 0)::bigint AS saldo FROM journal_line l JOIN journal j ON j.id = l.journal_id WHERE l.account_id = ${id} AND j.posted_at IS NOT NULL`
      if (s.saldo !== 0n) throw new GalatAturan('Saldo akun ini belum nol. Pindahkan saldonya lewat jurnal memorial dulu.')
    } else if (a.parent && !a.parent.active) throw new GalatAturan(`Aktifkan dulu akun induknya, ${a.parent.code} ${a.parent.name}.`)
    const b = await tx.account.update({ where: { id }, data: { active: aktif, updatedBy: aktor.id } })
    await catatAudit(tx, k, { action: aktif ? 'akun.aktifkan' : 'akun.nonaktifkan', docType: 'account', docId: id, summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} akun ${a.code} ${a.name}`, before: { active: a.active }, after: { active: aktif } })
    return b
  })
}

export type SaringAkun = { q?: string; jenis?: string; status?: string }

export type BarisPohon = { id: number; code: string; name: string; kind: AccountKind; isPostable: boolean; isCashBank: boolean; active: boolean; parentId: number | null; tingkat: number; anak: number; jurnal: number; peta: string[] }

// Seluruh bagan akun sebagai pohon berurutan (induk lalu anak-anaknya menurut kode). Bagan akun kedai kecil (puluhan
// sampai beberapa ratus akun), jadi dibaca utuh dengan batas 1000 baris.
export async function pohonAkun(db: DbAtauTx, s: SaringAkun = {}): Promise<BarisPohon[]> {
  const akun = await db.account.findMany({ orderBy: { code: 'asc' }, take: 1000, include: { _count: { select: { children: true, journalLines: true } }, accountMappings: { select: { key: true } } } })
  const anak = new Map<number | null, typeof akun>()
  for (const a of akun) {
    const p = a.parentId && akun.some((x) => x.id === a.parentId) ? a.parentId : null
    if (!anak.has(p)) anak.set(p, [])
    anak.get(p)!.push(a)
  }
  const hasil: BarisPohon[] = []
  const jalan = (induk: number | null, tingkat: number) => {
    const isi = (anak.get(induk) ?? []).sort((x, y) => (induk === null ? URUT_JENIS.indexOf(x.kind) - URUT_JENIS.indexOf(y.kind) : 0) || x.code.localeCompare(y.code, 'id', { numeric: true }))
    for (const a of isi) {
      hasil.push({ id: a.id, code: a.code, name: a.name, kind: a.kind, isPostable: a.isPostable, isCashBank: a.isCashBank, active: a.active, parentId: a.parentId, tingkat, anak: a._count.children, jurnal: a._count.journalLines, peta: a.accountMappings.map((m) => m.key) })
      jalan(a.id, tingkat + 1)
    }
  }
  jalan(null, 0)
  const q = s.q?.trim().toLowerCase().slice(0, 40)
  return hasil.filter(
    (a) =>
      (!q || a.code.toLowerCase().includes(q) || a.name.toLowerCase().includes(q)) &&
      (!s.jenis || a.kind === s.jenis) &&
      (s.status === 'aktif' ? a.active : s.status === 'nonaktif' ? !a.active : true),
  )
}

// Pilihan akun untuk formulir: hanya akun aktif yang bisa dijurnal, opsional dibatasi jenisnya.
export async function pilihanAkun(db: DbAtauTx, jenis?: AccountKind[]) {
  const a = await db.account.findMany({ where: { active: true, isPostable: true, ...(jenis ? { kind: { in: jenis } } : {}) }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, kind: true } })
  return a.sort((x, y) => x.code.localeCompare(y.code, 'id', { numeric: true }))
}

export const pilihanInduk = (db: DbAtauTx) => db.account.findMany({ where: { isPostable: false }, orderBy: { code: 'asc' }, select: { id: true, code: true, name: true, kind: true } })

export async function ambilAkun(db: DbAtauTx, id: number) {
  const a = await db.account.findUnique({ where: { id }, include: { parent: true, accountMappings: { select: { key: true } }, _count: { select: { children: true, journalLines: true } } } })
  if (!a) return null
  const [s] = await db.$queryRaw<{ debit: bigint; kredit: bigint }[]>`
    SELECT COALESCE(SUM(l.debit), 0)::bigint AS debit, COALESCE(SUM(l.credit), 0)::bigint AS kredit FROM journal_line l JOIN journal j ON j.id = l.journal_id WHERE l.account_id = ${id} AND j.posted_at IS NOT NULL`
  return { ...a, debit: s.debit, kredit: s.kredit }
}

// --- Pemetaan akun ---

export type BarisPeta = { kunci: string; nama: string; keterangan: string; jenis: AccountKind[]; akunId: number | null; umum: boolean; cadangan?: string }

export async function daftarPemetaan(db: DbAtauTx) {
  const peta = new Map((await db.accountMapping.findMany()).map((m) => [m.key, m.accountId]))
  const umum: BarisPeta[] = KUNCI_UMUM.map((k) => ({ kunci: k.kunci, nama: k.nama, keterangan: k.keterangan, jenis: k.jenis, akunId: peta.get(k.kunci) ?? null, umum: true }))
  const [metode, rekening, lokasi, alasan, kategoriAset] = await Promise.all([
    db.paymentMethod.findMany({ where: { kind: { not: 'tunai' } }, orderBy: { id: 'asc' }, select: { id: true, name: true, active: true } }),
    db.bankAccount.findMany({ orderBy: { id: 'asc' }, select: { id: true, bankName: true, accountNo: true, active: true } }),
    db.location.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, active: true } }),
    db.stockReason.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, code: true, active: true } }),
    db.assetCategory.findMany({ orderBy: { id: 'asc' }, select: { id: true, name: true, active: true } }),
  ])
  const turunan = (awalan: keyof typeof TURUNAN, id: number, nama: string, aktif: boolean, cadangan: string): BarisPeta => ({
    kunci: `${awalan}.${id}`,
    nama: `${nama}${aktif ? '' : ' (nonaktif)'}`,
    keterangan: '',
    jenis: TURUNAN[awalan].jenis,
    akunId: peta.get(`${awalan}.${id}`) ?? null,
    umum: false,
    cadangan,
  })
  return {
    umum,
    kelompok: [
      { judul: 'Piutang kliring per metode bayar non tunai', baris: metode.map((m) => turunan('kliring', m.id, m.name, m.active, 'kliring')) },
      { judul: 'Akun per rekening bank', baris: rekening.map((r) => turunan('bank', r.id, `${r.bankName} ${r.accountNo}`, r.active, 'bank')) },
      { judul: 'Akun persediaan per lokasi stok', baris: lokasi.map((l) => turunan('persediaan', l.id, l.name, l.active, 'persediaan')) },
      { judul: 'Lawan penyesuaian dan opname per alasan', baris: alasan.map((a) => turunan('alasan', a.id, a.name, a.active, a.code === 'saldo_awal' ? 'saldo_awal' : 'selisih_persediaan')) },
      // tahap 6B: tiga akun per kategori aset tetap.
      {
        judul: 'Akun aset tetap per kategori',
        baris: kategoriAset.flatMap((c) => [
          turunan('aset_tetap', c.id, `${c.name}: aset`, c.active, 'aset_tetap'),
          turunan('akumulasi_penyusutan', c.id, `${c.name}: akumulasi penyusutan`, c.active, 'akumulasi_penyusutan'),
          turunan('beban_penyusutan', c.id, `${c.name}: beban penyusutan`, c.active, 'beban_penyusutan'),
        ]),
      },
    ],
  }
}

// Menyimpan pemetaan dari formulir: nama isian = kunci, nilai = id akun (kosong = hapus, hanya untuk kunci turunan).
// Hanya kunci yang berubah yang ditulis; satu baris audit pemetaan.ubah berisi semua perubahan.
export async function simpanPemetaan(db: Db, k: Konteks, aktor: Aktor, isian: Record<string, unknown>) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const lama = new Map((await tx.accountMapping.findMany()).map((m) => [m.key, m.accountId]))
    const akun = new Map((await tx.account.findMany()).map((a) => [a.id, a]))
    const sebelum: Record<string, string | null> = {}
    const sesudah: Record<string, string | null> = {}
    const label = (id: number | null | undefined) => (id ? `${akun.get(id)?.code} ${akun.get(id)?.name}` : null)
    for (const [kunci, v] of Object.entries(isian)) {
      if (!kunciSah(kunci)) continue
      const teks = String(v ?? '').trim()
      const baru = teks === '' ? null : Number(teks)
      const kini = lama.get(kunci) ?? null
      if (baru === kini) continue
      const nama = KUNCI_PER_KODE.get(kunci)?.nama ?? kunci
      if (baru === null) {
        if (KUNCI_PER_KODE.has(kunci)) throw new GalatAturan(`Pemetaan "${nama}" wajib diisi.`, kunci)
        await tx.accountMapping.delete({ where: { key: kunci } })
      } else {
        const a = Number.isInteger(baru) ? akun.get(baru) : undefined
        if (!a) throw new GalatAturan(`Akun untuk "${nama}" tidak ditemukan.`, kunci)
        if (!a.active || !a.isPostable) throw new GalatAturan(`${a.code} ${a.name} nonaktif atau akun induk, tidak bisa dipakai untuk "${nama}".`, kunci)
        const jenis = jenisUntukKunci(kunci)
        if (!jenis.includes(a.kind)) throw new GalatAturan(`"${nama}" butuh akun berjenis ${jenis.map((j) => JENIS_AKUN[j]).join(' atau ')}; ${a.code} ${a.name} berjenis ${JENIS_AKUN[a.kind]}.`, kunci)
        await tx.accountMapping.upsert({ where: { key: kunci }, create: { key: kunci, accountId: a.id, updatedBy: aktor.id }, update: { accountId: a.id, updatedBy: aktor.id } })
      }
      sebelum[kunci] = label(kini)
      sesudah[kunci] = label(baru)
    }
    const n = Object.keys(sesudah).length
    if (n) await catatAudit(tx, k, { action: 'pemetaan.ubah', docType: 'account_mapping', summary: `Mengubah ${n} pemetaan akun: ${Object.keys(sesudah).join(', ')}`, before: sebelum, after: sesudah })
    return { berubah: n }
  })
}

export type { Prisma }
