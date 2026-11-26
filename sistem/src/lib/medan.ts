// Id elemen sebuah medan formulir master. Biasanya k-<nama>; medan yang namanya sama dengan medan di formulir lain
// pada halaman yang sama memberi id sendiri supaya label dan aria-describedby tidak menunjuk ke medan yang salah.
export const idMedan = (m: { nama: string; id?: string }) => `k-${m.id ?? m.nama}`
