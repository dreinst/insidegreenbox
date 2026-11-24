// Modul Metode Bayar (tahap 3A). Akun kliring dan setoran dibiarkan kosong sampai akuntansi di tahap 5.
// tahap 6C: MDR pindah ke riwayat tarif payment_method_mdr (KONTRAK 11 butir 123).
// Izin memakai akun.metode_bayar. Tanpa Next.
import { z } from 'zod'
import { GalatAturan } from './aksi'
import { catatAudit, selisih, type Konteks } from './audit'
import type { Db, Tx } from './db'
import { pastikanIzin, type Pengguna } from './izin-inti'
import { PER_HALAMAN, labelKolom, pesanUnik, sesuaiHalaman, skemaCentang, skemaPersen, skemaTanggal, skemaTeksOpsional, skemaUang } from './master'
import { keTarif, tarifPada, teksTarif } from './mdr'
import { tanggalIso } from './waktu'

type Aktor = Pick<Pengguna, 'id' | 'izin'>
const MENU = 'akun.metode_bayar'

export const JENIS_METODE = { tunai: 'Tunai', qris: 'QRIS', debit: 'Debit', lainnya: 'Lainnya' } as const
export type JenisMetode = keyof typeof JENIS_METODE

const skemaDasar = {
  name: z.string().trim().min(2, 'Nama minimal 2 huruf.').max(40, 'Nama paling panjang 40 huruf.'),
  kind: z.enum(['tunai', 'qris', 'debit', 'lainnya'], { message: 'Pilih jenis metode.' }),
  openDrawer: skemaCentang,
}

// Tarif MDR (tahap 6C, KONTRAK 11 butir 123): persen, batas nominal per transaksi yang bebas MDR (kosong berarti
// semua transaksi kena MDR), dan tanggal mulai berlaku. Tanggal boleh mundur (tarif lama yang baru dicatat) atau
// maju sampai setahun (aturan yang sudah diumumkan).
const skemaTarif = {
  mdrPct: skemaPersen('MDR', { max: 20 }),
  freeLimit: z.preprocess((v) => (String(v ?? '').trim() === '' ? undefined : v), skemaUang({ label: 'Batas bebas MDR', min: 0n, max: 1_000_000_000n }).optional()),
  effectiveFrom: skemaTanggal('Tanggal mulai berlaku').refine((d) => d !== null, 'Isi tanggal mulai berlaku.'),
  note: skemaTeksOpsional('Keterangan', 200),
}

export const skemaMetode = z.object({ ...skemaDasar, ...skemaTarif })
export const skemaUbahMetode = z.object(skemaDasar)
export const skemaTambahTarif = z.object(skemaTarif)

type MasukanTarif = z.infer<typeof skemaTambahTarif>

const hariIniIso = () => tanggalIso(new Date())

function periksaTarif(kind: string, d: MasukanTarif) {
  if (kind === 'tunai' && Number(d.mdrPct) !== 0) throw new GalatAturan('Metode tunai tidak punya MDR. Isi 0.', 'mdrPct')
  const iso = d.effectiveFrom!.toISOString().slice(0, 10)
  const batasMaju = tanggalIso(new Date(Date.now() + 366 * 86400000))
  if (iso < '2000-01-01' || iso > batasMaju) throw new GalatAturan('Tanggal mulai berlaku paling jauh setahun dari hari ini.', 'effectiveFrom')
}

// payment_method.mdr_pct tidak dibaca lagi untuk hitungan. Kolom ini disamakan dengan persen tarif yang berlaku hari ini
// supaya image lama tetap memakai angka yang masuk akal bila rilis dimundurkan (KONTRAK 11 butir 123).
async function samakanPersenLama(tx: Tx, metodeId: number) {
  const t = await tarifPada(tx, metodeId, hariIniIso())
  await tx.paymentMethod.update({ where: { id: metodeId }, data: { mdrPct: t?.mdrPct ?? 0 } })
}

const dataTarif = (d: MasukanTarif) => ({ mdrPct: d.mdrPct, freeLimit: d.freeLimit ?? null, effectiveFrom: d.effectiveFrom!, note: d.note })
const jejakTarif = (t: { mdrPct: unknown; freeLimit: bigint | null; effectiveFrom: Date; note?: string }) => ({
  mdrPct: String(t.mdrPct),
  freeLimit: t.freeLimit,
  effectiveFrom: t.effectiveFrom.toISOString().slice(0, 10),
  ...(t.note !== undefined ? { note: t.note } : {}),
})

export async function tambahMetode(db: Db, k: Konteks, aktor: Aktor, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaMetode.parse(masukan)
  periksaTarif(d.kind, d)
  try {
    return await db.$transaction(async (tx) => {
      if (await tx.paymentMethod.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' } } })) throw new GalatAturan('Nama metode bayar sudah dipakai.', 'name')
      const m = await tx.paymentMethod.create({ data: { name: d.name, kind: d.kind, mdrPct: d.mdrPct, openDrawer: d.openDrawer } })
      const t = await tx.paymentMethodMdr.create({ data: { paymentMethodId: m.id, ...dataTarif(d), createdBy: aktor.id } })
      await samakanPersenLama(tx, m.id)
      await catatAudit(tx, k, {
        action: 'metode_bayar.tambah',
        docType: 'payment_method',
        docId: m.id,
        summary: `Menambah metode bayar ${m.name} (${JENIS_METODE[d.kind]}, MDR ${teksTarif(keTarif(t))} sejak ${jejakTarif(t).effectiveFrom})`,
        after: { name: m.name, kind: m.kind, openDrawer: m.openDrawer, tarif: jejakTarif(t) },
      })
      return m
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nama metode bayar sudah dipakai.', 'name')
    throw e
  }
}

export async function ubahMetode(db: Db, k: Konteks, aktor: Aktor, id: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'U')
  const d = skemaUbahMetode.parse(masukan)
  try {
    return await db.$transaction(async (tx) => {
      const m = await tx.paymentMethod.findUnique({ where: { id } })
      if (!m) throw new GalatAturan('Metode bayar tidak ditemukan.')
      if (await tx.paymentMethod.findFirst({ where: { name: { equals: d.name, mode: 'insensitive' }, NOT: { id } } })) throw new GalatAturan('Nama metode bayar sudah dipakai.', 'name')
      if (d.kind === 'tunai' && m.kind !== 'tunai') {
        // Tunai selalu ber-MDR 0: tarif yang berlaku sekarang dan tarif yang akan datang harus 0.
        const sekarang = await tarifPada(tx, id, hariIniIso())
        const nanti = await tx.paymentMethodMdr.count({ where: { paymentMethodId: id, mdrPct: { gt: 0 }, effectiveFrom: { gt: new Date(`${hariIniIso()}T00:00:00Z`) } } })
        if ((sekarang && Number(sekarang.mdrPct) > 0) || nanti) throw new GalatAturan('Metode tunai tidak punya MDR. Tambah tarif 0% yang berlaku hari ini dulu, lalu ganti jenisnya.', 'kind')
      }
      const s = selisih({ name: m.name, kind: m.kind, openDrawer: m.openDrawer }, { name: d.name, kind: d.kind, openDrawer: d.openDrawer })
      if (!s.berubah.length) return { m, berubah: 0 }
      const b = await tx.paymentMethod.update({ where: { id }, data: { name: d.name, kind: d.kind, openDrawer: d.openDrawer } })
      await catatAudit(tx, k, { action: 'metode_bayar.ubah', docType: 'payment_method', docId: id, summary: `Mengubah ${labelKolom(s.berubah)} metode bayar ${b.name}`, before: s.sebelum, after: s.sesudah })
      return { m: b, berubah: s.berubah.length }
    })
  } catch (e) {
    if (pesanUnik(e)) throw new GalatAturan('Nama metode bayar sudah dipakai.', 'name')
    throw e
  }
}

// Owner menambah tarif MDR bertanggal (izin Tambah, sama dengan menambah metode). Riwayat tidak diubah atau dihapus,
// dan satu tanggal hanya punya satu tarif. Setoran yang sudah dibuat tidak dihitung ulang; hanya baris shift baru yang
// masuk lewat Muat ulang baris memakai tarif terbaru.
export async function tambahTarif(db: Db, k: Konteks, aktor: Aktor, metodeId: number, masukan: unknown) {
  pastikanIzin(aktor, MENU, 'T')
  const d = skemaTambahTarif.parse(masukan)
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM payment_method WHERE id = ${metodeId} FOR UPDATE`
    const m = await tx.paymentMethod.findUnique({ where: { id: metodeId } })
    if (!m) throw new GalatAturan('Metode bayar tidak ditemukan.')
    periksaTarif(m.kind, d)
    const iso = d.effectiveFrom!.toISOString().slice(0, 10)
    if (await tx.paymentMethodMdr.findFirst({ where: { paymentMethodId: metodeId, effectiveFrom: d.effectiveFrom! } })) {
      throw new GalatAturan(`Sudah ada tarif yang berlaku mulai ${new Intl.DateTimeFormat('id-ID', { dateStyle: 'long', timeZone: 'UTC' }).format(d.effectiveFrom!)}. Pilih tanggal lain.`, 'effectiveFrom')
    }
    const lama = await tarifPada(tx, metodeId, iso)
    const t = await tx.paymentMethodMdr.create({ data: { paymentMethodId: metodeId, ...dataTarif(d), createdBy: aktor.id } })
    await samakanPersenLama(tx, metodeId)
    await catatAudit(tx, k, {
      action: 'metode_bayar.tarif',
      docType: 'payment_method',
      docId: metodeId,
      summary: `Menambah tarif MDR ${m.name}: ${teksTarif(keTarif(t))} mulai ${iso}`,
      before: lama ? jejakTarif(lama) : null,
      after: { id: t.id, ...jejakTarif(t) },
    })
    return t
  })
}

// Riwayat tarif terbaru lebih dulu, beserta nama pencatatnya dan penanda tarif yang berlaku hari ini.
export async function riwayatTarif(db: Db, metodeId: number) {
  const baris = await db.paymentMethodMdr.findMany({ where: { paymentMethodId: metodeId }, orderBy: { effectiveFrom: 'desc' } })
  const orang = new Map((await db.appUser.findMany({ where: { id: { in: baris.map((b) => b.createdBy).filter((x): x is number => !!x) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]))
  const hari = hariIniIso()
  const berlaku = baris.find((b) => b.effectiveFrom.toISOString().slice(0, 10) <= hari)
  return baris.map((b) => {
    const iso = b.effectiveFrom.toISOString().slice(0, 10)
    return { ...b, iso, tarif: keTarif(b), oleh: b.createdBy ? (orang.get(b.createdBy) ?? `#${b.createdBy}`) : 'Migrasi atau seed', keadaan: iso > hari ? ('nanti' as const) : b.id === berlaku?.id ? ('berlaku' as const) : ('lama' as const) }
  })
}

export async function ubahStatusMetode(db: Db, k: Konteks, aktor: Aktor, id: number, aktif: boolean) {
  pastikanIzin(aktor, MENU, 'U')
  return db.$transaction(async (tx) => {
    const m = await tx.paymentMethod.findUnique({ where: { id } })
    if (!m) throw new GalatAturan('Metode bayar tidak ditemukan.')
    if (m.active === aktif) return m
    if (!aktif && (await tx.paymentMethod.count({ where: { active: true, NOT: { id } } })) === 0) throw new GalatAturan('Ini satu-satunya metode bayar aktif. Kasir butuh minimal satu.')
    const baru = await tx.paymentMethod.update({ where: { id }, data: { active: aktif } })
    await catatAudit(tx, k, { action: aktif ? 'metode_bayar.aktifkan' : 'metode_bayar.nonaktifkan', docType: 'payment_method', docId: id, summary: `${aktif ? 'Mengaktifkan' : 'Menonaktifkan'} metode bayar ${m.name}`, before: { active: m.active }, after: { active: aktif } })
    return baru
  })
}

export type SaringMetode = { q?: string; jenis?: string; status?: string; hal?: string }

export async function daftarMetode(db: Db, s: SaringMetode) {
  const q = s.q?.trim().slice(0, 64)
  const status = s.status === 'aktif' || s.status === 'nonaktif' ? s.status : undefined
  const jenis = s.jenis && s.jenis in JENIS_METODE ? s.jenis : undefined
  const hal = sesuaiHalaman(s.hal)
  const where = { ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}), ...(jenis ? { kind: jenis } : {}), ...(status ? { active: status === 'aktif' } : {}) }
  const [baris, total] = await Promise.all([
    db.paymentMethod.findMany({ where, orderBy: [{ active: 'desc' }, { id: 'asc' }], skip: (hal - 1) * PER_HALAMAN, take: PER_HALAMAN }),
    db.paymentMethod.count({ where }),
  ])
  return { baris, total, hal, jumlahHal: Math.max(1, Math.ceil(total / PER_HALAMAN)) }
}
