// Mesin stok (KONTRAK 12). Satu-satunya jalan untuk mengubah qty dan nilai persediaan: setiap gerak menulis satu baris
// stock_ledger lalu memperbarui stock_balance di transaksi milik pemanggil. Penilaian rata-rata tertimbang per lokasi.
// Tanpa impor Next, jadi bisa dipakai modul pembelian, produksi, kasir, skrip impor, dan tes.
import { GalatAturan } from '../aksi'
import type { DbAtauTx, Tx } from '../db'
import { Desimal, NOL, QTY_MAKS, des, keHarga, keRupiah, type Angka } from './angka'

// Dokumen asal gerak. tanggal adalah tanggal dokumen (kolom date di ledger); waktu tulis (at) selalu sekarang.
export type DokumenAsal = {
  docType: string
  docId: number
  docNo: string
  tanggal: Date
  oleh: number | null
}

export type Gerak = {
  productId: number
  locationId: number
  // Bertanda, dalam satuan dasar produk, paling banyak 3 desimal. Plus masuk, minus keluar. Tidak boleh 0.
  qty: Angka
  // Hanya untuk masuk: harga per satuan dasar. Kosong berarti harga rata-rata lokasi saat ini.
  hargaSatuan?: Angka | null
  // Masuk: nilai total rupiah, mengalahkan hargaSatuan (dipakai bila nilai baris sudah pasti).
  // Keluar (tahap 4C): nilai keluar pasti, bertanda minus, misalnya retur pembelian dengan harga penerimaannya.
  // Harga rata-rata sisa dihitung ulang dari saldo sesudahnya.
  nilai?: bigint | null
  lineId?: number | null
}

export type OpsiGerak = {
  // Izinkan saldo qty di bawah 0 walau lokasi tidak mengizinkan (misalnya karena saklar). Bawaan: ikut lokasi.
  izinkanMinus?: boolean
  // Barang masuk ini harga beli: product.last_cost diperbarui dengan harga satuannya.
  hargaBeli?: boolean
}

export type HasilGerak = {
  ledgerId: number
  productId: number
  locationId: number
  lineId: number | null
  qty: Desimal
  hargaSatuan: Desimal
  // Nilai dokumen gerak ini (tanpa koreksi). Nilai di ledger = nilai + koreksi.
  nilai: bigint
  // Koreksi nilai saat barang masuk menutup saldo nol atau minus (KONTRAK 11 butir 127). Plus berarti nilai persediaan
  // bertambah, minus berkurang. Lawannya di jurnal adalah HPP. 0 untuk gerak lain.
  koreksi: bigint
  saldoQty: Desimal
  saldoNilai: bigint
  hargaRata: Desimal
}

// Langkah internal. nilaiTetap dipakai gerak balik (nilai persis dokumen asal), nilaiIkut dipakai pindah stok
// (nilai masuk = nilai keluar langkah ke-i, tanda dibalik).
// tahap 4B: nilaiDari dipakai produksi (nilai masuk = jumlah nilai keluar langkah-langkah itu, tanda dibalik, + tambahan).
// koreksiTetap dipakai gerak balik barang keluar: koreksi gerak masuk asalnya ikut dibalik persis.
type Langkah = Gerak & { nilaiTetap?: bigint; koreksiTetap?: bigint; nilaiIkut?: number; nilaiDari?: { langkah: number[]; tambahan: bigint } }

type Saldo = { qty: Desimal; nilai: bigint; rata: Desimal }

const kunciPasang = (p: number, l: number) => `${p}:${l}`

function periksaLangkah(l: Langkah, i: number) {
  if (!Number.isInteger(l.productId) || l.productId <= 0) throw new GalatAturan(`Gerak ke-${i + 1}: produk tidak sah.`)
  if (!Number.isInteger(l.locationId) || l.locationId <= 0) throw new GalatAturan(`Gerak ke-${i + 1}: lokasi tidak sah.`)
  const q = des(l.qty)
  if (!q.isFinite() || q.isZero()) throw new GalatAturan(`Gerak ke-${i + 1}: qty tidak boleh 0.`)
  if (q.decimalPlaces() > 3) throw new GalatAturan(`Gerak ke-${i + 1}: qty paling banyak 3 desimal.`)
  if (q.abs().gt(QTY_MAKS)) throw new GalatAturan(`Gerak ke-${i + 1}: qty terlalu besar.`)
  if (q.isNeg() && l.hargaSatuan !== undefined && l.hargaSatuan !== null) throw new GalatAturan(`Gerak ke-${i + 1}: barang keluar selalu memakai harga rata-rata.`)
  if (q.isNeg() && l.nilai !== undefined && l.nilai !== null && l.nilai > 0n) throw new GalatAturan(`Gerak ke-${i + 1}: nilai barang keluar harus minus.`)
  if (l.hargaSatuan !== undefined && l.hargaSatuan !== null && des(l.hargaSatuan).isNeg()) throw new GalatAturan(`Gerak ke-${i + 1}: harga satuan tidak boleh minus.`)
  if (l.nilaiIkut !== undefined && (l.nilaiIkut >= i || l.nilaiIkut < 0)) throw new GalatAturan(`Gerak ke-${i + 1}: rujukan nilai tidak sah.`)
  if (l.nilaiDari && (!q.isPos() || l.nilaiDari.langkah.some((j) => j >= i || j < 0) || l.nilaiDari.tambahan < 0n)) throw new GalatAturan(`Gerak ke-${i + 1}: rujukan nilai tidak sah.`)
  return q
}

// Mengunci baris stock_balance semua pasangan produk-lokasi dengan urutan tetap (produk lalu lokasi), supaya dua
// transaksi yang menyentuh pasangan yang sama tidak saling mengunci silang. Baris yang belum ada dibuat dulu.
async function kunciSaldo(tx: Tx, pasang: [number, number][]) {
  const urut = [...pasang].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const saldo = new Map<string, Saldo>()
  for (const [p, l] of urut) {
    await tx.$executeRaw`INSERT INTO stock_balance (product_id, location_id, updated_at) VALUES (${p}, ${l}, now()) ON CONFLICT (product_id, location_id) DO NOTHING`
    const [b] = await tx.$queryRaw<{ qty: Desimal; value: bigint; avg_cost: Desimal }[]>`
      SELECT qty, value, avg_cost FROM stock_balance WHERE product_id = ${p} AND location_id = ${l} FOR UPDATE`
    saldo.set(kunciPasang(p, l), { qty: des(b.qty), nilai: BigInt(b.value), rata: des(b.avg_cost) })
  }
  return saldo
}

async function terapkan(tx: Tx, dok: DokumenAsal, langkah: Langkah[], opsi: OpsiGerak, balik: boolean): Promise<HasilGerak[]> {
  if (!langkah.length) return []
  if (!Number.isInteger(dok.docId) || !dok.docType) throw new GalatAturan('Dokumen asal gerak stok tidak lengkap.')
  const qty = langkah.map(periksaLangkah)

  const idProduk = [...new Set(langkah.map((l) => l.productId))]
  const idLokasi = [...new Set(langkah.map((l) => l.locationId))]
  const [produk, lokasi] = await Promise.all([
    tx.product.findMany({ where: { id: { in: idProduk } }, select: { id: true, name: true, lastCost: true, baseUnit: { select: { symbol: true } } } }),
    tx.location.findMany({ where: { id: { in: idLokasi } }, select: { id: true, name: true, allowNegativeStock: true } }),
  ])
  const pr = new Map(produk.map((p) => [p.id, p]))
  const lk = new Map(lokasi.map((l) => [l.id, l]))
  for (const id of idProduk) if (!pr.has(id)) throw new GalatAturan(`Produk ${id} tidak ditemukan.`)
  for (const id of idLokasi) if (!lk.has(id)) throw new GalatAturan(`Lokasi ${id} tidak ditemukan.`)

  const pasang = [...new Map(langkah.map((l) => [kunciPasang(l.productId, l.locationId), [l.productId, l.locationId] as [number, number]])).values()]
  const saldo = await kunciSaldo(tx, pasang)

  const hasil: HasilGerak[] = []
  const hargaBeliBaru = new Map<number, Desimal>()
  for (const [i, l] of langkah.entries()) {
    const q = qty[i]
    const p = pr.get(l.productId)!
    const lokasiIni = lk.get(l.locationId)!
    const s = saldo.get(kunciPasang(l.productId, l.locationId))!
    const qtyBaru = s.qty.plus(q)
    let nilai: bigint
    let harga: Desimal
    let koreksi = 0n
    let rataBaru = s.rata
    if (q.isPos()) {
      // Masuk: nilai dari rujukan, nilai tetap, nilai, atau qty x harga. Harga rata-rata dihitung ulang.
      if (l.nilaiIkut !== undefined) nilai = -hasil[l.nilaiIkut].nilai
      else if (l.nilaiDari) nilai = l.nilaiDari.langkah.reduce((n, j) => n - hasil[j].nilai, 0n) + l.nilaiDari.tambahan
      else if (l.nilaiTetap !== undefined) nilai = l.nilaiTetap
      else if (l.nilai !== undefined && l.nilai !== null) nilai = l.nilai
      else {
        harga = l.hargaSatuan !== undefined && l.hargaSatuan !== null ? des(l.hargaSatuan) : s.rata.gt(0) ? s.rata : des(p.lastCost)
        nilai = keRupiah(q.times(harga))
      }
      harga = keHarga(new Desimal(nilai.toString()).div(q))
      if (s.qty.gt(0)) {
        const nilaiBaru = s.nilai + nilai
        rataBaru = qtyBaru.gt(0) ? keHarga(new Desimal(nilaiBaru.toString()).div(qtyBaru)) : harga
      } else {
        // Saldo sebelumnya nol atau minus (KONTRAK 11 butir 127). Bagian yang menutup minus dinilai dengan harga masuk ini
        // (bagian sebanding dari nilai masuk), jadi sisa saldo plus hanya berisi barang masuk ini dan saldo nol bernilai 0.
        // Sisa minus yang belum tertutup tetap bernilai rata-rata minusnya. Bedanya dengan saldo + nilai masuk adalah koreksi.
        const tutup = Desimal.min(q, s.qty.neg())
        const sasaran = qtyBaru.isNeg()
          ? keRupiah(new Desimal(s.nilai.toString()).times(qtyBaru).div(s.qty))
          : nilai - keRupiah(new Desimal(nilai.toString()).times(tutup).div(q))
        koreksi = sasaran - (s.nilai + nilai)
        rataBaru = qtyBaru.gt(0) ? keHarga(new Desimal(sasaran.toString()).div(qtyBaru)) : harga
      }
      if (opsi.hargaBeli) hargaBeliBaru.set(l.productId, harga)
    } else {
      // Keluar: tolak stok minus kecuali diizinkan. Nilai = qty x harga rata-rata; bila qty jadi tepat 0, seluruh sisa
      // nilai ikut keluar supaya saldo nol selalu bernilai nol.
      if (qtyBaru.isNeg() && !(opsi.izinkanMinus || lokasiIni.allowNegativeStock)) {
        throw new GalatAturan(
          `Stok ${p.name} di ${lokasiIni.name} tidak cukup: tersedia ${s.qty.toString().replace('.', ',')} ${p.baseUnit.symbol}, perlu ${q.neg().toString().replace('.', ',')} ${p.baseUnit.symbol}.`,
        )
      }
      // Saldo plus memakai rata-ratanya walau 0 (barang bonus keluar bernilai 0, temuan audit B-3). Harga beli terakhir
      // hanya dipakai bila saldo nol atau minus, yaitu saat lokasi belum punya harga.
      const rataPakai = s.qty.gt(0) || s.rata.gt(0) ? s.rata : des(p.lastCost)
      const nilaiPasti = l.nilai !== undefined && l.nilai !== null
      // Gerak balik barang keluar membalik koreksi gerak masuk asalnya.
      koreksi = l.koreksiTetap ?? 0n
      if (qtyBaru.isZero()) nilai = -s.nilai - koreksi
      else if (l.nilaiTetap !== undefined) nilai = l.nilaiTetap
      else if (nilaiPasti) nilai = l.nilai!
      else nilai = keRupiah(q.times(rataPakai))
      harga = l.nilaiTetap !== undefined || nilaiPasti || qtyBaru.isZero() ? keHarga(new Desimal((-nilai).toString()).div(q.neg())) : rataPakai
      if (!s.rata.gt(0) && rataPakai.gt(0)) rataBaru = rataPakai
      if (nilaiPasti && !qtyBaru.isZero()) {
        // Keluar dengan nilai pasti mengubah harga rata-rata sisa. Nilai sisa tidak boleh minus bila qty masih ada.
        if (qtyBaru.gt(0) && s.nilai + nilai < 0n) throw new GalatAturan(`Nilai persediaan ${p.name} di ${lokasiIni.name} tidak cukup untuk dikeluarkan dengan harga ini.`)
        if (qtyBaru.gt(0)) rataBaru = keHarga(new Desimal((s.nilai + nilai).toString()).div(qtyBaru))
      }
    }
    const saldoNilai = s.nilai + nilai + koreksi
    // Gerak balik: harga rata-rata dihitung ulang dari saldo sesudahnya (RANCANGAN 2.3 butir 3), termasuk saldo minus
    // yang nilainya minus, supaya pembatalan pembelian penutup minus mengembalikan harga lama.
    if (balik && (qtyBaru.gt(0) || (qtyBaru.isNeg() && saldoNilai < 0n))) rataBaru = keHarga(new Desimal(saldoNilai.toString()).div(qtyBaru))
    const [baris] = await tx.$queryRaw<{ id: number }[]>`
      INSERT INTO stock_ledger (product_id, location_id, at, date, qty, unit_cost, value, revalue, balance_qty, avg_cost_after, balance_value, doc_type, doc_id, doc_no, line_id, is_reversal, created_by)
      VALUES (${l.productId}, ${l.locationId}, now(), ${dok.tanggal.toISOString().slice(0, 10)}::date, ${q.toFixed(3)}::numeric, ${harga.toFixed(4)}::numeric, ${nilai + koreksi}, ${koreksi}, ${qtyBaru.toFixed(3)}::numeric,
              ${rataBaru.toFixed(4)}::numeric, ${saldoNilai}, ${dok.docType}, ${dok.docId}, ${dok.docNo}, ${l.lineId ?? null}, ${balik}, ${dok.oleh})
      RETURNING id`
    s.qty = qtyBaru
    s.nilai = saldoNilai
    s.rata = rataBaru
    hasil.push({
      ledgerId: baris.id,
      productId: l.productId,
      locationId: l.locationId,
      lineId: l.lineId ?? null,
      qty: q,
      hargaSatuan: harga,
      nilai,
      koreksi,
      saldoQty: qtyBaru,
      saldoNilai,
      hargaRata: rataBaru,
    })
  }

  for (const [p, l] of pasang.sort((a, b) => a[0] - b[0] || a[1] - b[1])) {
    const s = saldo.get(kunciPasang(p, l))!
    await tx.$executeRaw`UPDATE stock_balance SET qty = ${s.qty.toFixed(3)}::numeric, value = ${s.nilai}, avg_cost = ${s.rata.toFixed(4)}::numeric, updated_at = now()
      WHERE product_id = ${p} AND location_id = ${l}`
  }
  // Harga rata-rata gabungan semua lokasi di product.avg_cost (dipakai HPP menu). Diurutkan per id produk.
  for (const id of idProduk.sort((a, b) => a - b)) {
    const beli = hargaBeliBaru.get(id)
    await tx.$executeRaw`UPDATE product SET
        avg_cost = COALESCE((SELECT round(sum(value)::numeric / sum(qty), 4) FROM stock_balance WHERE product_id = ${id} HAVING sum(qty) > 0), avg_cost),
        last_cost = COALESCE(${beli ? beli.toFixed(4) : null}::numeric, last_cost)
      WHERE id = ${id}`
  }
  return hasil
}

// Menulis gerak stok sebuah dokumen. Dipanggil di dalam transaksi pemanggil (db.$transaction(async (tx) => ...)), sekali
// per dokumen, dengan semua barisnya sekaligus. Urutan gerak dipakai apa adanya; penguncian selalu berurutan.
export function catatGerak(tx: Tx, dok: DokumenAsal, gerak: Gerak[], opsi: OpsiGerak = {}) {
  return terapkan(tx, dok, gerak, opsi, false)
}

export type HasilOlah = { productId: number; locationId: number; qty: Angka; biayaTambahan?: bigint; lineId?: number | null }

// tahap 4B: produksi satu langkah (Produksi Cepat). Bahan keluar dengan harga rata-rata lokasinya, lalu hasil masuk dengan
// nilai = jumlah nilai bahan + biaya tambahan, dalam satu panggilan supaya semua baris saldo dikunci sekali dengan urutan
// tetap (aturan 2). Hasil kembalian: gerak bahan dulu, gerak hasil paling akhir.
export function olahStok(tx: Tx, dok: DokumenAsal, bahan: Gerak[], hasil: HasilOlah, opsi: OpsiGerak = {}) {
  if (!bahan.length) throw new GalatAturan('Produksi butuh minimal satu bahan.')
  for (const b of bahan) if (!des(b.qty).isNeg()) throw new GalatAturan('Qty bahan produksi harus keluar (minus).')
  const q = des(hasil.qty)
  if (!q.gt(0)) throw new GalatAturan('Qty hasil produksi harus lebih dari 0.')
  const langkah: Langkah[] = bahan.map((b) => ({ ...b, hargaSatuan: null, nilai: null }))
  langkah.push({ productId: hasil.productId, locationId: hasil.locationId, qty: q, lineId: hasil.lineId, nilaiDari: { langkah: bahan.map((_, i) => i), tambahan: hasil.biayaTambahan ?? 0n } })
  return terapkan(tx, dok, langkah, opsi, false)
}

export type BarisPindah = { productId: number; dari: number; ke: number; qty: Angka; lineId?: number | null }

// Pindah stok antar lokasi: keluar dari lokasi asal dengan harga rata-rata asal, masuk ke tujuan dengan nilai yang sama
// persis, sehingga total nilai persediaan tidak berubah.
export function pindahStok(tx: Tx, dok: DokumenAsal, baris: BarisPindah[], opsi: OpsiGerak = {}) {
  const langkah: Langkah[] = []
  for (const b of baris) {
    if (b.dari === b.ke) throw new GalatAturan('Lokasi asal dan tujuan harus berbeda.')
    const q = des(b.qty)
    if (!q.gt(0)) throw new GalatAturan('Qty pindah harus lebih dari 0.')
    langkah.push({ productId: b.productId, locationId: b.dari, qty: q.neg(), lineId: b.lineId })
    langkah.push({ productId: b.productId, locationId: b.ke, qty: q, lineId: b.lineId, nilaiIkut: langkah.length - 1 })
  }
  return terapkan(tx, dok, langkah, opsi, false)
}

// Gerak balik untuk pembatalan dokumen Diposting (RANCANGAN 2.3). Semua gerak asal dokumen itu dibalik dengan urutan
// terbalik, qty dan nilai sama persis dengan tanda berlawanan, bertanggal dok.tanggal (hari pembatalan).
// Gagal bila stok tidak cukup untuk dibalik, kecuali lokasi atau opsi mengizinkan minus.
export async function balikDokumen(tx: Tx, dok: DokumenAsal, opsi: OpsiGerak = {}) {
  const asal = await tx.stockLedger.findMany({ where: { docType: dok.docType, docId: dok.docId, isReversal: false }, orderBy: { id: 'desc' } })
  if (!asal.length) return []
  if (await tx.stockLedger.count({ where: { docType: dok.docType, docId: dok.docId, isReversal: true } })) {
    throw new GalatAturan('Gerak stok dokumen ini sudah pernah dibalik.')
  }
  // Nilai dokumen dan koreksi asal dibalik terpisah, supaya jurnal balik memakai lawan dan HPP yang sama dengan jurnal maju.
  const langkah: Langkah[] = asal.map((g) => ({
    productId: g.productId,
    locationId: g.locationId,
    qty: des(g.qty).neg(),
    nilaiTetap: -(g.value - g.revalue),
    koreksiTetap: g.revalue ? -g.revalue : undefined,
    lineId: g.lineId,
  }))
  return terapkan(tx, dok, langkah, opsi, true)
}

export type SelisihSaldo = {
  productId: number
  locationId: number
  saldo: { qty: string; nilai: string; rata: string }
  ledger: { qty: string; nilai: string; rata: string }
}

type BarisBanding = {
  product_id: number
  location_id: number
  b_qty: Desimal | null
  b_value: bigint | null
  b_avg: Desimal | null
  l_qty: Desimal | null
  l_value: bigint | null
  l_avg: Desimal | null
}

const banding = (db: DbAtauTx, productId?: number, locationId?: number) => db.$queryRaw<BarisBanding[]>`
  WITH l AS (
    SELECT product_id, location_id, sum(qty) AS qty, sum(value) AS value, (array_agg(avg_cost_after ORDER BY id DESC))[1] AS avg
    FROM stock_ledger
    WHERE (${productId ?? null}::int IS NULL OR product_id = ${productId ?? null}::int) AND (${locationId ?? null}::int IS NULL OR location_id = ${locationId ?? null}::int)
    GROUP BY product_id, location_id
  ), b AS (
    SELECT product_id, location_id, qty, value, avg_cost AS avg FROM stock_balance
    WHERE (${productId ?? null}::int IS NULL OR product_id = ${productId ?? null}::int) AND (${locationId ?? null}::int IS NULL OR location_id = ${locationId ?? null}::int)
  )
  SELECT COALESCE(b.product_id, l.product_id) AS product_id, COALESCE(b.location_id, l.location_id) AS location_id,
         b.qty AS b_qty, b.value AS b_value, b.avg AS b_avg, l.qty AS l_qty, l.value AS l_value, l.avg AS l_avg
  FROM b FULL OUTER JOIN l ON b.product_id = l.product_id AND b.location_id = l.location_id
  WHERE COALESCE(b.qty, 0) <> COALESCE(l.qty, 0) OR COALESCE(b.value, 0) <> COALESCE(l.value, 0) OR COALESCE(b.avg, 0) <> COALESCE(l.avg, 0)
  ORDER BY 1, 2`

const teks = (x: Desimal | bigint | null) => (x === null ? '0' : x.toString())

// Membandingkan stock_balance dengan jumlah ledger per produk-lokasi (qty, nilai, dan harga rata-rata gerak terakhir).
// Hasil kosong berarti saldo cocok dengan ledger.
export async function periksaSaldo(db: DbAtauTx, saring: { productId?: number; locationId?: number } = {}): Promise<SelisihSaldo[]> {
  const baris = await banding(db, saring.productId, saring.locationId)
  return baris.map((b) => ({
    productId: b.product_id,
    locationId: b.location_id,
    saldo: { qty: teks(b.b_qty), nilai: teks(b.b_value), rata: teks(b.b_avg) },
    ledger: { qty: teks(b.l_qty), nilai: teks(b.l_value), rata: teks(b.l_avg) },
  }))
}

// Baris ledger yang saldo berjalannya tidak menyambung dengan baris sebelumnya di produk-lokasi yang sama.
// Dipakai tes dan pemeriksaan berkala. Hasil 0 berarti kartu stok utuh.
export async function periksaRantai(db: DbAtauTx) {
  const [r] = await db.$queryRaw<{ n: bigint }[]>`
    SELECT count(*) AS n FROM (
      SELECT balance_qty - qty AS awal_qty, balance_value - value AS awal_nilai,
             lag(balance_qty, 1, 0::numeric) OVER w AS sebelum_qty, lag(balance_value, 1, 0::bigint) OVER w AS sebelum_nilai
      FROM stock_ledger WINDOW w AS (PARTITION BY product_id, location_id ORDER BY id)
    ) x WHERE awal_qty <> sebelum_qty OR awal_nilai <> sebelum_nilai`
  return Number(r.n)
}

// Menghitung ulang stock_balance dari ledger untuk pasangan yang berbeda, lalu mengembalikan daftar yang diperbaiki.
// Dijalankan di dalam transaksi; baris saldo dikunci dulu supaya tidak bertabrakan dengan gerak yang sedang jalan.
export async function hitungUlangSaldo(tx: Tx, saring: { productId?: number; locationId?: number } = {}) {
  const beda = await periksaSaldo(tx, saring)
  if (!beda.length) return []
  await kunciSaldo(
    tx,
    beda.map((b) => [b.productId, b.locationId]),
  )
  const ulang = await periksaSaldo(tx, saring)
  for (const b of ulang) {
    await tx.$executeRaw`UPDATE stock_balance SET qty = ${b.ledger.qty}::numeric, value = ${BigInt(b.ledger.nilai)}, avg_cost = ${b.ledger.rata}::numeric, updated_at = now()
      WHERE product_id = ${b.productId} AND location_id = ${b.locationId}`
  }
  return ulang
}

// Saldo satu produk di satu lokasi tanpa mengunci (untuk tampilan dan qty sistem opname).
export async function saldoDi(db: DbAtauTx, productId: number, locationId: number): Promise<Saldo> {
  const b = await db.stockBalance.findUnique({ where: { productId_locationId: { productId, locationId } } })
  return b ? { qty: des(b.qty), nilai: b.value, rata: des(b.avgCost) } : { qty: NOL, nilai: 0n, rata: NOL }
}
