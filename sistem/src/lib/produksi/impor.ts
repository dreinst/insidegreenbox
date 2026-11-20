// Impor resep menu dari admin lama (tahap 4B, KONTRAK 11). Sumbernya tabel RESEP di src/admin/contoh.ts (disalin ke sini
// karena berkas itu tidak bisa diimpor dari Node): kunci menu berupa slug nama menu, bahan berupa id bahan lama.
// Menu dicocokkan menurut nama (slug nama menu_item sama dengan kunci resep) dan bahan menurut nama produk (tanpa peduli
// huruf besar). Resep yang menu atau salah satu bahannya tidak cocok dilewati dan dilaporkan, tidak ditebak.
// Idempoten: menu yang sudah menunjuk resep (aktif atau nonaktif) dilewati.
import { catatAudit, type Konteks } from '../audit'
import type { Db } from '../db'
import { ambilNomor } from '../nomor'
import { hariIni } from '../stok/dokumen'
import { BAHAN_LAMA } from '../stok/impor'

type Takaran = [string, number]

export const RESEP_LAMA: Record<string, Takaran[]> = {
  espresso: [['kopi', 18]],
  'long-black': [['kopi', 18]],
  'iced-black': [['kopi', 18], ['es', 150], ['cup', 1]],
  latte: [['kopi', 18], ['susu', 180], ['cup', 1]],
  cappuccino: [['kopi', 18], ['susu', 150], ['cup', 1]],
  'iced-white': [['kopi', 18], ['susu', 120], ['es', 120], ['cup', 1]],
  'coffee-cloud': [['kopi', 18], ['susu', 150], ['whip', 40], ['es', 100], ['gula', 10], ['cup', 1]],
  'matcha-latte': [['matcha', 6], ['susu', 180], ['gula', 12], ['es', 100], ['cup', 1]],
  'iced-shaken-honey-lemon-tea': [['teh', 4], ['madu', 20], ['lemon', 2], ['es', 150], ['cup', 1]],
  'iced-shaken-mixed-berries-tea': [['teh', 4], ['berry', 25], ['es', 150], ['cup', 1]],
  'easy-nasgor': [['nasi', 200], ['ayam', 80], ['telur', 1], ['sayur', 40]],
  'real-potato-fries': [['kentang', 150]],
  'beef-sando': [['roti', 2], ['beef', 80], ['sayur', 30], ['kentang', 120]],
  piccolo: [['kopi', 18], ['susu', 60], ['cup', 1]],
  'magic-white-6oz': [['kopi', 18], ['susu', 120], ['cup', 1]],
  'dirty-latte': [['kopi', 18], ['susu', 150], ['es', 100], ['gula', 8], ['cup', 1]],
  'woc-white-on-crack': [['kopi', 36], ['susu', 120], ['es', 100], ['gula', 10], ['cup', 1]],
  'pour-over-coffee': [['kopi', 15], ['cup', 1]],
  'iced-pour-over-coffee': [['kopi', 15], ['es', 150], ['cup', 1]],
  'cold-brewed-coffee': [['kopi', 20], ['es', 120], ['cup', 1]],
  'mont-blanc': [['kopi', 18], ['susu', 100], ['whip', 40], ['es', 100], ['gula', 12], ['cup', 1]],
  'cold-brew-sorbet': [['kopi', 20], ['es', 200], ['gula', 15], ['cup', 1]],
  'oolong-cloud': [['oolong', 5], ['whip', 40], ['susu', 80], ['es', 120], ['gula', 10], ['cup', 1]],
  'rtd-classic': [['kopi', 25], ['soda', 200], ['kaleng', 1]],
  'rtd-fruity': [['kopi', 25], ['berry', 30], ['soda', 200], ['kaleng', 1]],
  'rtd-decaf': [['kopi', 25], ['soda', 200], ['kaleng', 1]],
  'sunset-soother': [['teh', 4], ['berry', 25], ['madu', 20], ['soda', 200], ['kaleng', 1]],
  'sunrise-booster': [['teh', 4], ['lemon', 2], ['madu', 20], ['soda', 200], ['kaleng', 1]],
  '70-chocolate': [['cokelat', 30], ['susu', 200], ['gula', 10], ['cup', 1]],
  'pecan-praline-matcha': [['matcha', 6], ['pecan', 15], ['susu', 180], ['es', 100], ['cup', 1]],
  'red-box': [['berry', 30], ['soda', 200], ['es', 150], ['lemon', 1], ['cup', 1]],
  napkin: [['teh', 4], ['lemon', 2], ['madu', 15], ['soda', 200], ['es', 150], ['cup', 1]],
  'sesame-pasta': [['pasta', 120], ['wijen', 40], ['ayam', 80], ['telur', 1]],
  'nanban-chicken-with-rice': [['nasi', 200], ['ayam', 120], ['tepung', 30], ['sayur', 40]],
  'salad-with-pan-seared-chicken': [['sayur', 150], ['ayam', 100]],
  'pad-kra-pao': [['nasi', 200], ['ayam', 90], ['telur', 1], ['sayur', 30]],
  'enoki-fries': [['enoki', 100], ['tepung', 25]],
  'soft-panna': [['whip', 100], ['susu', 60], ['gula', 15]],
  'sweet-waffle': [['tepung', 80], ['telur', 1], ['susu', 60], ['gula', 15]],
  'coffee-parfait': [['whip', 60], ['kopi', 10], ['biskuit', 30], ['susu', 50], ['gula', 10]],
}

// Slug nama menu, sama dengan id menu admin lama (src/store.ts: slug).
export const slugMenu = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

const NAMA_BAHAN = new Map(BAHAN_LAMA.map(([id, nama]) => [id, nama]))
const KONTEKS_IMPOR: Konteks = { userId: null, actorName: 'impor', ip: 'lokal', userAgent: 'impor-resep' }

export type HasilImporResep = { dibuat: string[]; dilewati: string[]; menuTakCocok: string[]; bahanTakCocok: { menu: string; bahan: string[] }[] }

export async function imporResep(db: Db, opsi: { konteks?: Konteks } = {}): Promise<HasilImporResep> {
  const k = opsi.konteks ?? KONTEKS_IMPOR
  const menu = await db.menuItem.findMany({ select: { id: true, name: true, bomId: true } })
  const perSlug = new Map<string, (typeof menu)[number][]>()
  for (const m of menu) perSlug.set(slugMenu(m.name), [...(perSlug.get(slugMenu(m.name)) ?? []), m])
  const produk = await db.product.findMany({ select: { id: true, name: true, baseUnitId: true } })
  const perNama = new Map<string, (typeof produk)[number][]>()
  for (const p of produk) perNama.set(p.name.toLowerCase(), [...(perNama.get(p.name.toLowerCase()) ?? []), p])

  const hasil: HasilImporResep = { dibuat: [], dilewati: [], menuTakCocok: [], bahanTakCocok: [] }
  for (const [kunci, takaran] of Object.entries(RESEP_LAMA)) {
    const cocok = perSlug.get(kunci) ?? []
    // Nama menu yang sama lebih dari sekali juga dianggap tidak cocok, karena tidak jelas menu mana yang dimaksud.
    if (cocok.length !== 1) {
      hasil.menuTakCocok.push(cocok.length ? `${kunci} (${cocok.length} menu bernama sama)` : kunci)
      continue
    }
    const m = cocok[0]
    if (m.bomId) {
      hasil.dilewati.push(m.name)
      continue
    }
    const kurang: string[] = []
    const baris = takaran.flatMap(([id, qty]) => {
      const nama = NAMA_BAHAN.get(id) ?? id
      const p = perNama.get(nama.toLowerCase()) ?? []
      if (p.length !== 1) {
        kurang.push(nama)
        return []
      }
      return [{ productId: p[0].id, unitId: p[0].baseUnitId, qty }]
    })
    if (kurang.length) {
      hasil.bahanTakCocok.push({ menu: m.name, bahan: kurang })
      continue
    }
    await db.$transaction(async (tx) => {
      // Cek ulang di bawah kunci supaya dua impor bersamaan tidak memasang dua resep ke satu menu.
      await tx.$executeRaw`SELECT id FROM menu_item WHERE id = ${m.id} FOR UPDATE`
      if ((await tx.menuItem.findUniqueOrThrow({ where: { id: m.id } })).bomId) return
      const code = await ambilNomor(tx, 'bom', 'RM', hariIni())
      const bom = await tx.bom.create({ data: { code, name: `Resep ${m.name}`, kind: 'menu', outputQty: 1, bomLines: { create: baris } } })
      await tx.menuItem.update({ where: { id: m.id }, data: { bomId: bom.id } })
      hasil.dibuat.push(m.name)
    })
  }
  if (hasil.dibuat.length) {
    await catatAudit(db, k, {
      action: 'impor.resep',
      docType: 'bom',
      summary: `Impor resep admin lama: ${hasil.dibuat.length} resep baru, ${hasil.menuTakCocok.length} menu tidak cocok, ${hasil.bahanTakCocok.length} resep dengan bahan tidak cocok`,
      after: hasil,
    })
  }
  return hasil
}
