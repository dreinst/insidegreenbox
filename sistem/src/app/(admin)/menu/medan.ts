import type { Medan } from '@/components/form-master'
import { urlFoto } from '@/lib/foto'

type Awal = { name?: string; category?: string; price?: string; description?: string; kcal?: string; featured?: boolean; image?: string | null }

export function medanMenu(kategori: { nilai: string; label: string }[], foto: string[], awal: Awal = {}): Medan[] {
  return [
    { jenis: 'teks', nama: 'name', label: 'Nama menu', awal: awal.name, wajib: true, maxLength: 80 },
    { jenis: 'pilih', nama: 'category', label: 'Kategori', awal: awal.category ?? '', pilihan: [{ nilai: '', label: 'Pilih kategori' }, ...kategori], wajib: true },
    { jenis: 'angka', nama: 'price', label: 'Harga (Rp)', awal: awal.price, wajib: true, placeholder: '38000', bantuan: 'Rupiah bulat, misalnya 38000 atau 38.000.' },
    { jenis: 'angka', nama: 'kcal', label: 'Kalori (kkal)', awal: awal.kcal, bantuan: 'Perkiraan kalori per porsi. Kosongkan bila tidak ada.' },
    { jenis: 'area', nama: 'description', label: 'Deskripsi atau catatan nutrisi', awal: awal.description, maxLength: 400, lebar: true },
    { jenis: 'foto', nama: 'foto', label: 'Foto', awal: awal.image ?? '', foto, urlAwal: urlFoto(awal.image), lebar: true },
    { jenis: 'centang', nama: 'featured', label: 'Tandai sebagai menu unggulan', awal: awal.featured ?? false },
  ]
}

export function medanPaket(menu: { nilai: string; label: string }[], foto: string[], awal: { name?: string; mainItemId?: string; drinkItemId?: string; normalPrice?: string; price?: string; image?: string | null } = {}): Medan[] {
  return [
    { jenis: 'teks', nama: 'name', label: 'Nama paket', awal: awal.name, wajib: true, maxLength: 80 },
    { jenis: 'pilih', nama: 'mainItemId', label: 'Menu utama', awal: awal.mainItemId ?? '', pilihan: [{ nilai: '', label: 'Pilih menu utama' }, ...menu], wajib: true },
    { jenis: 'pilih', nama: 'drinkItemId', label: 'Minuman', awal: awal.drinkItemId ?? '', pilihan: [{ nilai: '', label: 'Pilih minuman' }, ...menu], wajib: true },
    { jenis: 'angka', nama: 'normalPrice', label: 'Harga normal (Rp)', awal: awal.normalPrice, bantuan: 'Kosongkan untuk memakai jumlah harga menu utama dan minuman.' },
    { jenis: 'angka', nama: 'price', label: 'Harga paket (Rp)', awal: awal.price, wajib: true, placeholder: '40000', bantuan: 'Harus lebih murah dari harga normal.' },
    { jenis: 'foto', nama: 'foto', label: 'Foto paket', awal: awal.image ?? '', foto, urlAwal: urlFoto(awal.image), lebar: true },
  ]
}
