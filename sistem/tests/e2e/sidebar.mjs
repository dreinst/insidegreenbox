// Bantuan bersama untuk sidebar yang grupnya bisa dilipat (KONTRAK 11 butir 162). Bukan berkas uji, jadi tidak
// dipanggil jalankan.sh. Sidebar (atau laci HP) harus sudah tampil sebelum fungsi ini dipakai.

export const tautanSamping = (page, href) => page.locator(`.samping nav a[href="${href}"]`)

// Buka grup yang memuat tautan bila masih tertutup, dengan mengetuk judul grupnya seperti pengguna.
// tautan boleh berupa href atau Locator. Mengembalikan Locator tautan yang sudah tampil.
export async function bukaGrupSamping(page, tautan) {
  const t = typeof tautan === 'string' ? tautanSamping(page, tautan) : tautan
  const grup = t.locator('xpath=ancestor::details[1]')
  if ((await grup.count()) && !(await grup.evaluate((d) => d.open))) await grup.locator('xpath=./summary').click()
  await t.waitFor({ state: 'visible' })
  return t
}

// Buka grupnya lalu ketuk tautan.
export async function klikSamping(page, href) {
  await (await bukaGrupSamping(page, href)).click()
}

// Buka semua grup yang masih tertutup, misalnya untuk menguji gulir sidebar terpanjang.
export async function bukaSemuaGrupSamping(page) {
  const tutup = page.locator('.samping details.samping-lipat:not([open]) > summary')
  while (await tutup.count()) await tutup.first().click()
}
