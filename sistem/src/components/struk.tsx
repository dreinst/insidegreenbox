// Isi struk penjualan (tahap 3B), dipakai rincian transaksi dan halaman cetak.
import { urlFoto } from '@/lib/foto'
import { namaPromo, rupiah } from '@/lib/hitung-kasir'
import type { ambilPenjualan } from '@/lib/penjualan'
import { MODE } from '@/lib/penjualan'
import { formatWaktu } from '@/lib/waktu'

type Jual = NonNullable<Awaited<ReturnType<typeof ambilPenjualan>>>

const persenTeks = (d: { toString(): string }) => `${Number(d.toString()).toLocaleString('id-ID')}%`

export function IsiStruk({ j }: { j: Jual }) {
  const cabang = j.shift.location.branch
  const kembali = j.salePayments.reduce((a, b) => a + Number(b.change), 0)
  // tahap 6A: logo, kepala, alamat, telepon, dan NPWP dari Profil Usaha, dibaca saat struk ditampilkan.
  const logo = urlFoto(cabang.receiptLogo)
  return (
    <div className={`struk${j.status === 'Void' ? ' struk-void' : ''}`}>
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="struk-logo" src={logo} alt={`Logo ${cabang.name}`} />
      ) : null}
      <p className="struk-judul">{cabang.receiptHeader || cabang.name}</p>
      {cabang.address ? <p className="struk-tengah">{cabang.address}</p> : null}
      {cabang.phone ? <p className="struk-tengah">Telp. {cabang.phone}</p> : null}
      {cabang.npwp ? <p className="struk-tengah">NPWP {cabang.npwp}</p> : null}
      <hr />
      <dl className="struk-dl">
        <div>
          <dt>No.</dt>
          <dd>{j.no}</dd>
        </div>
        <div>
          <dt>Waktu</dt>
          <dd>{formatWaktu(j.at)}</dd>
        </div>
        <div>
          <dt>Kasir</dt>
          <dd>{j.namaKasir}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>
            {MODE[j.mode as keyof typeof MODE] ?? j.mode}
            {j.tableNo ? `, meja ${j.tableNo}` : ''}
          </dd>
        </div>
        {j.member ? (
          <div>
            <dt>Member</dt>
            <dd>{j.member.name}</dd>
          </div>
        ) : null}
      </dl>
      <hr />
      <ul className="struk-baris">
        {j.saleLines.map((l) => (
          <li key={l.id}>
            <span>
              {l.qty} x {l.name}
              {l.note ? <small>{l.note}</small> : null}
            </span>
            <b>{l.promoGift ? 'Gratis' : rupiah(l.price * BigInt(l.qty))}</b>
          </li>
        ))}
      </ul>
      <hr />
      <dl className="struk-dl">
        <div>
          <dt>Subtotal</dt>
          <dd>{rupiah(j.sub)}</dd>
        </div>
        {j.promoDisc > 0n ? (
          <div>
            <dt>Potongan promo {namaPromo(j.promoName)}</dt>
            <dd className="uang">-{rupiah(j.promoDisc)}</dd>
          </div>
        ) : null}
        {j.disc - j.promoDisc > 0n ? (
          <div>
            <dt>Potongan member {persenTeks(j.memberPct)}</dt>
            <dd>-{rupiah(j.disc - j.promoDisc)}</dd>
          </div>
        ) : null}
        {j.promoName && j.promoDisc === 0n ? (
          <div>
            <dt>Promo {namaPromo(j.promoName)}</dt>
            <dd>hadiah</dd>
          </div>
        ) : null}
        {j.svc > 0n ? (
          <div>
            <dt>Service {persenTeks(j.svcPct)}</dt>
            <dd>{rupiah(j.svc)}</dd>
          </div>
        ) : null}
        {j.tax > 0n ? (
          <div>
            <dt>Pajak {persenTeks(j.taxPct)}</dt>
            <dd>{rupiah(j.tax)}</dd>
          </div>
        ) : null}
        <div className="struk-total">
          <dt>Total</dt>
          <dd>{rupiah(j.total)}</dd>
        </div>
        {/* Pembulatan bagian tunai ke Rp 500 (KONTRAK 11 butir 155). */}
        {j.rounding !== 0n ? (
          <>
            <div>
              <dt>Pembulatan</dt>
              <dd>
                {j.rounding > 0n ? '' : '-'}
                {rupiah(j.rounding > 0n ? j.rounding : -j.rounding)}
              </dd>
            </div>
            <div className="struk-total">
              <dt>Total bayar</dt>
              <dd>{rupiah(j.total + j.rounding)}</dd>
            </div>
          </>
        ) : null}
        {j.salePayments.map((b) => (
          <div key={b.id}>
            <dt>{b.paymentMethod.name}</dt>
            <dd>{rupiah(b.paid)}</dd>
          </div>
        ))}
        {kembali > 0 ? (
          <div>
            <dt>Kembali</dt>
            <dd>{rupiah(kembali)}</dd>
          </div>
        ) : null}
      </dl>
      {j.status === 'Void' ? <p className="struk-cap">VOID{j.voidReason ? `: ${j.voidReason}` : ''}</p> : null}
      <p className="struk-tengah">{cabang.receiptFooter || 'Terima kasih sudah mampir.'}</p>
    </div>
  )
}
