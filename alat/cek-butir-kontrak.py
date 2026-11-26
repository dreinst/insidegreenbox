"""Periksa penomoran KONTRAK bagian 11: butir berurutan dari 1 tanpa ganda dan tanpa lompat.
Pakai: python3 alat/cek-butir-kontrak.py sistem/KONTRAK.md"""
import re, sys
isi = open(sys.argv[1]).read()
awal = isi.index("## 11.")
akhir = isi.index("\n## 12.", awal)
nomor = [int(m) for m in re.findall(r"^(\d+)\. ", isi[awal:akhir], re.M)]
salah = [f"posisi {i + 1} berisi {n}" for i, n in enumerate(nomor) if n != i + 1]
if salah:
    print("butir tidak berurutan:", "; ".join(salah[:10])); sys.exit(1)
rujukan = sorted({int(n) for n in re.findall(r"butir (\d+)", isi) if int(n) > len(nomor)})
if rujukan:
    print("rujukan ke butir yang tidak ada:", rujukan); sys.exit(1)
print(f"butir 1 sampai {len(nomor)} berurutan, tanpa ganda")
