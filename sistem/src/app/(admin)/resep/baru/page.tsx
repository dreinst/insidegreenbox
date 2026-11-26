import type { Metadata } from 'next'
import Link from 'next/link'
import { FormMaster } from '@/components/form-master'
import { KepalaHalaman } from '@/components/umum'
import { db } from '@/lib/db'
import { wajibIzin } from '@/lib/izin'
import { menuBelumBerresep } from '@/lib/produksi/resep'
import { tambahResepAksi } from '../aksi'

export const metadata: Metadata = { title: 'Buat resep atau BOM' }

export default async function ResepBaru({ searchParams }: { searchParams: Promise<{ jenis?: string; menu?: string }> }) {
  await wajibIzin('stok.resep', 'T')
  const s = await searchParams
  const jenis = s.jenis === 'assembly' ? 'assembly' : 'menu'
  if (jenis === 'menu') {
    const menu = await menuBelumBerresep(db)
    const awal = menu.find((m) => String(m.id) === s.menu)
    return (
      <>
        <KepalaHalaman judul="Buat resep menu" keterangan="Pilih menu, lalu tambahkan bahan dengan qty per porsi dalam satuan dasar di layar berikutnya." jejak={{ href: '/resep', label: 'Resep dan BOM' }}>
          <Link href="/resep/baru?jenis=assembly" className="btn sekunder">
            Buat BOM assembly
          </Link>
        </KepalaHalaman>
        <section className="kartu">
          {menu.length ? (
            <FormMaster
              aksi={tambahResepAksi.bind(null, 'menu')}
              medan={[
                { jenis: 'pilih', nama: 'menuItemId', label: 'Menu', awal: awal ? String(awal.id) : '', pilihan: [{ nilai: '', label: 'Pilih menu' }, ...menu.map((m) => ({ nilai: String(m.id), label: m.active ? m.name : `${m.name} (nonaktif)` }))], wajib: true },
                { jenis: 'teks', nama: 'name', label: 'Nama resep', awal: awal ? `Resep ${awal.name}` : '', wajib: true, maxLength: 80, placeholder: 'Resep Latte' },
              ]}
              tombol="Buat resep"
            />
          ) : (
            <p className="kosong">Semua menu sudah punya resep aktif.</p>
          )}
        </section>
      </>
    )
  }
  const produk = await db.product.findMany({ where: { active: true }, include: { baseUnit: true }, orderBy: [{ kind: 'desc' }, { name: 'asc' }] })
  return (
    <>
      <KepalaHalaman judul="Buat BOM assembly" keterangan="Produk hasil dibuat dari bahan dengan qty per batch. Dipakai Perintah Produksi dan Produksi Cepat." jejak={{ href: '/resep', label: 'Resep dan BOM' }}>
        <Link href="/resep/baru?jenis=menu" className="btn sekunder">
          Buat resep menu
        </Link>
      </KepalaHalaman>
      <section className="kartu">
        <FormMaster
          aksi={tambahResepAksi.bind(null, 'assembly')}
          medan={[
            { jenis: 'pilih', nama: 'productId', label: 'Produk hasil', pilihan: [{ nilai: '', label: 'Pilih produk' }, ...produk.map((x) => ({ nilai: String(x.id), label: `${x.name} (${x.baseUnit.symbol})` }))], wajib: true, bantuan: 'Biasanya produk setengah jadi, misalnya cold brew atau sirup.' },
            { jenis: 'teks', nama: 'name', label: 'Nama BOM', wajib: true, maxLength: 80, placeholder: 'Cold brew 1 liter' },
            { jenis: 'angka', nama: 'outputQty', label: 'Qty hasil per batch (satuan dasar)', inputMode: 'decimal', wajib: true, placeholder: '1000' },
            { jenis: 'angka', nama: 'extraCost', label: 'Biaya tambahan per batch (Rp)', placeholder: '0', bantuan: 'Misalnya gas atau tenaga. Kosongkan bila tidak ada.' },
          ]}
          tombol="Buat BOM"
        />
      </section>
    </>
  )
}
