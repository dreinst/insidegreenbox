import { useState } from 'react'
import { CATS, fmt } from '../store'
import { byMethod, dayKey, dayStart, parseDay } from './hitung'
import { Title, useA, when } from './kit'
import { METHODS, METODE, Stats, Tabel, rp } from './umum'

const CAT: Record<string, string> = { ...Object.fromEntries(CATS), set: 'Early set' }
const DAY = 86400000
const sum = <T,>(a: T[], f: (x: T) => number) => a.reduce((n, x) => n + f(x), 0)

export default function LaporanPage() {
  const { st } = useA()
  const now = Date.now()
  const [from, setFrom] = useState(dayKey(dayStart(now) - 6 * DAY))
  const [to, setTo] = useState(dayKey(now))
  const a = parseDay(from), b = parseDay(to) + DAY
  const inRange = (t: number) => t >= a && t < b
  const all = st.sales.filter(s => inRange(s.at))
  const good = all.filter(s => s.status === 'ok')
  const voids = all.filter(s => s.status === 'void')

  const kotor = sum(good, s => s.sub), pot = sum(good, s => s.disc), bersih = kotor - pot
  const hpp = sum(good, s => s.hpp), laba = bersih - hpp
  const svc = sum(good, s => s.svc), pajak = sum(good, s => s.tax)

  const quick = (d: number) => { setFrom(dayKey(dayStart(now) - (d - 1) * DAY)); setTo(dayKey(now)) }
  const preset = (d: number) => from === dayKey(dayStart(now) - (d - 1) * DAY) && to === dayKey(now)

  // Per hari
  const days: Record<string, typeof good> = {}
  for (const s of good) (days[dayKey(s.at)] ??= []).push(s)
  const perHari = Object.keys(days).sort().map(k => {
    const x = days[k], kt = sum(x, s => s.sub), pt = sum(x, s => s.disc), h = sum(x, s => s.hpp)
    return [k, x.length, kt, pt, kt - pt, h, kt - pt - h]
  })

  // Per kategori dan per menu: dari harga baris sebelum potongan member
  const kat: Record<string, [number, number]> = {}
  const menu: Record<string, [number, number]> = {}
  for (const s of good) for (const l of s.lines) {
    const k = (kat[l.cat] ??= [0, 0]); k[0] += l.qty; k[1] += l.qty * l.price
    const m = (menu[l.name] ??= [0, 0]); m[0] += l.qty; m[1] += l.qty * l.price
  }
  const perKat = Object.entries(kat).sort((x, y) => y[1][1] - x[1][1]).map(([id, v]) => [CAT[id] ?? id, v[0], v[1]])
  const perMenu = Object.entries(menu).sort((x, y) => y[1][0] - x[1][0] || y[1][1] - x[1][1]).map(([n, v], i) => [i + 1, n, v[0], v[1]])

  const mt = byMethod(good)
  const perMetode = METHODS.map(k => [METODE[k], mt[k].n, mt[k].total])
  const kasir: Record<string, [number, number]> = {}
  for (const s of good) { const k = (kasir[s.by] ??= [0, 0]); k[0]++; k[1] += s.total }
  const perKasir = Object.entries(kasir).sort((x, y) => y[1][1] - x[1][1]).map(([n, v]) => [n, v[0], v[1]])

  const mem: Record<string, [number, number, number]> = {}
  for (const s of good) if (s.member && s.disc > 0) { const k = (mem[s.member.name] ??= [s.member.pct, 0, 0]); k[1]++; k[2] += s.disc }
  const perMember = Object.entries(mem).sort((x, y) => y[1][2] - x[1][2]).map(([n, v]) => [n, `${v[0]}%`, v[1], v[2]])
  const logs = st.logs.filter(l => inRange(l.at)).sort((x, y) => y.at - x.at).slice(0, 100)

  return (<>
    <Title t="Laporan" sub="Penjualan, laba kotor, void, dan log aktivitas untuk rentang tanggal yang dipilih." />
    <div className="a-bar filt">
      <label className="field"><span>Dari</span><span className="inp"><input type="date" value={from} max={to} onChange={e => e.target.value && setFrom(e.target.value)} /></span></label>
      <label className="field"><span>Sampai</span><span className="inp"><input type="date" value={to} min={from} onChange={e => e.target.value && setTo(e.target.value)} /></span></label>
      <div className="pills" role="group" aria-label="Rentang cepat">
        {[[1, 'Hari ini'], [7, '7 hari'], [30, '30 hari']].map(([d, t]) => <button key={d} type="button" className={preset(+d) ? 'on' : ''} aria-pressed={preset(+d)} onClick={() => quick(+d)}>{t}</button>)}
      </div>
    </div>
    <Stats rows={[
      ['Penjualan kotor', rp(kotor), `${good.length} transaksi`], ['Potongan member', rp(pot), ''], ['Penjualan bersih', rp(bersih), 'kotor dikurangi potongan'],
      ['HPP', rp(hpp), 'dari resep'], ['Laba kotor', rp(laba), bersih ? `${fmt(Math.round(laba / bersih * 1000) / 10)}% dari bersih` : ''],
    ]} />
    <p className="mut small rep-note">Service {rp(svc)} dan pajak {rp(pajak)} dipisah dari penjualan bersih. Total yang diterima di kasir {rp(bersih + svc + pajak)}. Void tidak dihitung.</p>

    <Tabel title="Penjualan per hari" file={`penjualan-per-hari_${from}_${to}.csv`} empty="Tidak ada penjualan pada rentang ini."
      cols={[{ h: 'Tanggal' }, { h: 'Transaksi', num: true }, { h: 'Kotor', money: true }, { h: 'Potongan', money: true }, { h: 'Bersih', money: true }, { h: 'HPP', money: true }, { h: 'Laba kotor', money: true }]}
      rows={perHari} foot={perHari.length ? ['Total', good.length, kotor, pot, bersih, hpp, laba] : undefined} />
    <Tabel title="Menu terlaris" note="Diurutkan menurut jumlah terjual. Harga sebelum potongan member." file={`menu-terlaris_${from}_${to}.csv`}
      cols={[{ h: '#', num: true }, { h: 'Menu' }, { h: 'Terjual', num: true }, { h: 'Penjualan', money: true }]} rows={perMenu.slice(0, 20)} empty="Belum ada penjualan." />
    <div className="duo even">
      <Tabel title="Per kategori" file={`per-kategori_${from}_${to}.csv`} cols={[{ h: 'Kategori' }, { h: 'Terjual', num: true }, { h: 'Penjualan', money: true }]} rows={perKat} empty="Belum ada penjualan." />
      <Tabel title="Per metode bayar" file={`per-metode_${from}_${to}.csv`} cols={[{ h: 'Metode' }, { h: 'Transaksi', num: true }, { h: 'Jumlah', money: true }]} rows={perMetode} />
      <Tabel title="Per kasir" file={`per-kasir_${from}_${to}.csv`} cols={[{ h: 'Kasir' }, { h: 'Transaksi', num: true }, { h: 'Jumlah', money: true }]} rows={perKasir} empty="Belum ada penjualan." />
      <Tabel title="Rekap potongan member" file={`potongan-member_${from}_${to}.csv`} cols={[{ h: 'Member' }, { h: 'Potongan' }, { h: 'Transaksi', num: true }, { h: 'Nilai potongan', money: true }]} rows={perMember} empty="Tidak ada potongan member." />
    </div>
    <Tabel title="Daftar void" file={`void_${from}_${to}.csv`} empty="Tidak ada void pada rentang ini."
      cols={[{ h: 'Nomor' }, { h: 'Waktu transaksi' }, { h: 'Total', money: true }, { h: 'Di-void oleh' }, { h: 'Waktu void' }, { h: 'Alasan' }]}
      rows={voids.map(s => [s.no, when(s.at), s.total, s.voidBy ?? '', s.voidAt ? when(s.voidAt) : '', s.voidReason ?? ''])} />
    <Tabel title="Log aktivitas" note="Siapa melakukan apa dan kapan. Maksimal 100 terbaru pada rentang ini." file={`log-aktivitas_${from}_${to}.csv`} empty="Belum ada aktivitas tercatat."
      cols={[{ h: 'Waktu' }, { h: 'Oleh' }, { h: 'Aktivitas' }]} rows={logs.map(l => [when(l.at), l.by, l.what])} />
  </>)
}
