import { useState } from 'react'
import type { ShiftRec } from '../store'
import { byMethod, expectedCash } from './hitung'
import { bukaShift, shiftOpen, shiftSales, tutupShift } from './aksi'
import { Ask, ICON, Rp, Title, Txt, useA, when } from './kit'
import { METHODS, METODE, Stats, Tabel, rp } from './umum'

const selisih = (n: number) => n === 0 ? 'Pas' : `${n > 0 ? 'Lebih' : 'Kurang'} ${rp(Math.abs(n))}`

function Rekap({ shift }: { shift: ShiftRec }) {
  const { st } = useA()
  const sales = shiftSales(st, shift.id)
  const m = byMethod(sales)
  return (
    <Tabel title="Rekap per metode bayar" cols={[{ h: 'Metode' }, { h: 'Transaksi', num: true }, { h: 'Jumlah', money: true }]}
      rows={METHODS.map(k => [METODE[k], m[k].n, m[k].total])} foot={['Semua', METHODS.reduce((a, k) => a + m[k].n, 0), METHODS.reduce((a, k) => a + m[k].total, 0)]} />
  )
}

export default function ShiftPage() {
  const { st, me, commit, ok } = useA()
  const open = shiftOpen(st, me.id)
  const [modal, setModal] = useState(200000)
  const [count, setCount] = useState<number | null>(null)
  const [note, setNote] = useState('')
  const [lastId, setLastId] = useState('')
  const last = st.shifts.find(s => s.id === lastId)
  const all = ok('laporan')
  const hist = [...st.shifts].filter(s => all || s.uid === me.id).sort((a, b) => b.at - a.at)

  const sales = open ? shiftSales(st, open.id) : []
  const exp = open ? expectedCash(open.openCash, sales) : 0
  const diff = count === null ? 0 : count - exp
  const doOpen = () => { if (commit(s => bukaShift(s, me, modal))) { setLastId(''); setCount(null); setNote('') } }
  const doClose = () => { if (open && count !== null && commit(s => tutupShift(s, open.id, count, note.trim()))) { setLastId(open.id); setCount(null); setNote('') } }

  return (<>
    <Title t="Shift" sub="Buka shift dengan modal kas, tutup dengan hitung kas di laci." />
    {!open ? (
      <section className="card apanel stack" aria-labelledby="h-buka">
        <h2 id="h-buka" className="aph">Buka shift</h2>
        <p className="mut">Belum ada shift terbuka untuk akun {me.name}. Transaksi baru hanya bisa dibuat setelah shift dibuka.</p>
        <div className="fgrid"><div className="field"><span>Modal kas awal</span><Rp v={modal} set={setModal} label="Modal kas awal" cls="xl" zero /></div></div>
        <div className="a-act"><button type="button" className="btn btn-green" onClick={doOpen}>{ICON.check}Buka shift</button></div>
      </section>
    ) : (<>
      <Stats rows={[['Dibuka', when(open.at), `oleh ${open.by}`], ['Modal awal', rp(open.openCash)], ['Transaksi', sales.filter(s => s.status === 'ok').length, `${sales.filter(s => s.status === 'void').length} void`], ['Kas seharusnya', rp(exp), 'modal + penjualan tunai']]} />
      <div className="duo even">
        <Rekap shift={open} />
        <section className="card apanel stack" aria-labelledby="h-tutup">
          <h2 id="h-tutup" className="aph">Tutup shift</h2>
          <p className="mut">Hitung uang di laci, isi jumlahnya, lalu tutup. Selisih dengan kas seharusnya dicatat.</p>
          <div className="field"><span>Kas dihitung</span><Rp v={count ?? 0} set={setCount} label="Kas dihitung di laci" cls="xl" zero={count !== null} /></div>
          {count !== null && <p className={`info ${diff === 0 ? '' : 'bad'}`} role="status">Kas seharusnya {rp(exp)}. {selisih(diff)}.</p>}
          <Txt label="Catatan (boleh kosong)" v={note} set={setNote} maxLength={80} />
          <div className="a-act"><Ask label="Tutup shift" ask="Shift ditutup dan tidak bisa dibuka lagi. Lanjut?" yes={doClose} cls="btn btn-green" disabled={count === null} /></div>
        </section>
      </div>
    </>)}
    {last && last.closedAt && (
      <section className="card apanel stack" aria-labelledby="h-last">
        <h2 id="h-last" className="aph">Shift ditutup</h2>
        <Stats rows={[['Kas seharusnya', rp(last.expected ?? 0)], ['Kas dihitung', rp(last.counted ?? 0)], ['Selisih', selisih((last.counted ?? 0) - (last.expected ?? 0))], ['Modal awal', rp(last.openCash)]]} />
        <Rekap shift={last} />
      </section>
    )}
    <Tabel title="Riwayat shift" file="riwayat-shift.csv" empty="Belum ada shift."
      cols={[{ h: 'Kasir' }, { h: 'Buka' }, { h: 'Tutup' }, { h: 'Modal', money: true }, { h: 'Kas seharusnya', money: true }, { h: 'Dihitung', money: true }, { h: 'Selisih', money: true }, { h: 'Transaksi', num: true }]}
      rows={hist.map(s => {
        const n = shiftSales(st, s.id).filter(x => x.status === 'ok').length
        const e = s.closedAt ? s.expected ?? 0 : expectedCash(s.openCash, shiftSales(st, s.id))
        return [s.by, when(s.at), s.closedAt ? when(s.closedAt) : 'Berjalan', s.openCash, e, s.closedAt ? s.counted ?? 0 : '-', s.closedAt ? (s.counted ?? 0) - e : '-', n]
      })} />
  </>)
}
