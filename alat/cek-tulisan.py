"""Periksa tulisan Greenbox: em dash, en dash, '--' sebagai tanda pisah di Markdown, dan atribusi AI.
Pakai: python3 alat/cek-tulisan.py <berkas atau folder> [...]
Keluar 1 kalau ada temuan. Blok kode Markdown, baris pemisah tabel, dan blok aturan Next.js di sistem/AGENTS.md dilewati."""
import os, re, sys
EKS = (".md", ".txt", ".json", ".ts", ".tsx", ".mjs", ".js", ".css", ".html", ".prisma", ".sql", ".sh", ".py")
temuan = 0
def periksa(p):
    global temuan
    if not p.endswith(EKS) or not os.path.isfile(p):
        return
    md = p.endswith(".md")
    dalam_kode = dalam_next = False
    for i, baris in enumerate(open(p, errors="ignore"), 1):
        if "BEGIN:nextjs-agent-rules" in baris: dalam_next = True
        if "END:nextjs-agent-rules" in baris: dalam_next = False; continue
        if dalam_next: continue
        if md and baris.strip().startswith("```"):
            dalam_kode = not dalam_kode; continue
        masalah = []
        if "\u2014" in baris or "\u2013" in baris: masalah.append("em dash atau en dash")
        teks = re.sub(r"`[^`]*`", "", baris)
        if md and not dalam_kode and not re.match(r"^\s*\|?\s*:?-{3,}", baris) and re.search(r"(^|\s)--(\s|$)", teks):
            masalah.append("dua tanda hubung sebagai tanda pisah")
        if re.search(r"co-authored[-]by|generated (with|by) (claude|gemini|ai)|dibuat (dengan|oleh) (ai|claude|gemini|antigravity)", teks, re.I):
            masalah.append("atribusi AI")
        if masalah:
            temuan += 1; print(f"{p}:{i}: {', '.join(masalah)}: {baris.strip()[:100]}")
for a in sys.argv[1:]:
    if os.path.isdir(a):
        for akar, dirs, fs in os.walk(a):
            dirs[:] = [d for d in dirs if d not in ("node_modules", ".git", ".next", "generated", "hasil", "potret")]
            for f in fs: periksa(os.path.join(akar, f))
    else:
        periksa(a)
print(f"temuan: {temuan}", "| TULISAN LOLOS" if temuan == 0 else "| TULISAN TOLAK")
sys.exit(1 if temuan else 0)
