#!/usr/bin/env python3
"""Penjaga PreToolUse admin Greenbox untuk Antigravity (agy).

Membaca muatan hook dari stdin, mengeluarkan satu objek JSON {"decision", "reason"} ke stdout.
Gagal tertutup: galat apa pun di skrip ini berarti "deny".

Susunan zona (lihat AGENTS.md bagian 3 dan 12):
- REPO adalah worktree kendali (folder dua tingkat di atas berkas ini), cabang CABANG_KENDALI. Di sini agen
  hanya boleh menulis laporan/<nnn>-*.md dan mengubah kolom status di tugas/STATUS.md.
- Kode dikerjakan di worktree tugas INDUK/ag-<nnn> pada cabang ag/<nnn>-<judul>.
- Folder sementara sistem boleh ditulis.
- Perintah ssh yang menulis ke VPS dan akses WAHA butuh berkas izin dari pemilik ditambah konfirmasi (force_ask).
Ubah daftar di bawah hanya lewat Claude. Uji: python3 .agents/penjaga/uji_penjaga.py
"""
import json
import os
import re
import shlex
import subprocess
import sys
import time

REPO = os.path.realpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
HOME = os.path.realpath(os.path.expanduser("~"))
INDUK = os.path.realpath(os.environ.get("GREENBOX_PENJAGA_UJI_INDUK") or os.path.join(HOME, "orca/workspaces/insidegreenbox"))
IZIN_DIR = os.path.realpath(os.environ.get("GREENBOX_PENJAGA_UJI_IZIN") or os.path.join(HOME, ".config/greenbox-izin"))
LOG = os.path.join(REPO, ".agents", "penjaga", "log.jsonl")
CABANG_KENDALI = "dreinst/greenbox-tahap2"
CABANG_LINDUNG = {"main", "master", "admin-member-kasir", "dreinst/greenbox-tahap2", "dreinst/template-tahap1"}
POLA_CABANG_AG = re.compile(r"^ag/\d{3}-[a-z0-9][a-z0-9.-]*$")
POLA_FOLDER_AG = re.compile(r"^ag-\d{3}$")
POLA_DB_BUANG = re.compile(r"^greenbox_(agy|uji)_\w+$")
IDENTITAS = ("dreinst", "asteinec@gmail.com")

TMP = [os.path.realpath(p) for p in ("/tmp", "/private/tmp", "/var/folders", "/private/var/folders")]
DATA_PRIBADI = [os.path.join(HOME, "ndru/greenbox-aset/esb/ss"), os.path.join(HOME, "ndru/greenbox-aset/template-gb/asli")]

# Folder yang boleh dibaca. Di luar ini ditolak.
BACA = [
    REPO, INDUK, os.path.join(HOME, "ndru/insidegreenbox"), os.path.join(HOME, "ndru/greenbox-aset"),
    "/usr", "/bin", "/sbin", "/opt/homebrew", "/Applications", "/System", "/Library/Fonts", "/etc", "/private/etc",
    "/dev/null", "/dev/stdout", "/dev/stderr", "/dev/zero", "/dev/urandom", "/Library/Developer/CommandLineTools",
    HOME + "/.cache", HOME + "/.npm", HOME + "/Library/Caches", HOME + "/Library/Fonts", HOME + "/.local/bin",
    HOME + "/.nvm", HOME + "/.bun", HOME + "/.cargo/bin",
    HOME + "/.gemini/antigravity/builtin/skills/agy-customizations",
] + TMP
SKEMA_MCP = HOME + "/.gemini/antigravity-cli/mcp/"
MCP_BOLEH = {"context7"}
MCP_AWALAN = "greenbox-mcp_"

# Nama yang tidak boleh ditulis di mana pun (aturan, hook, kendali tugas, rahasia).
NAMA_TERKUNCI = re.compile(
    r"^(agents\.md|gemini\.md|claude\.md|\.agents?|_agents?|\.gemini|\.claude|\.git|hooks\.json|skills\.json|"
    r"plugins\.json|mcp_config\.json|settings\.json|tugas|audit|laporan)$", re.I)
RAHASIA = re.compile(
    r"(^|/)(\.env(?!\.example$)(\.[\w.-]+)?|db\.env|akun\.env|\.netrc|\.npmrc|\.pypirc|\.git-credentials|id_rsa\w*|"
    r"id_ed25519\w*|id_ecdsa\w*|[\w.-]+\.pem|[\w.-]+\.p12|[\w.-]+\.key|credentials(\.json)?|secrets?(\.json|\.ya?ml|\.txt)?|"
    r"service[-_]account[\w.-]*\.json|\.claude(\.json)?|\.gemini|\.ssh|\.aws|\.gnupg|Keychains|greenbox-izin)(/|$)", re.I)
NAMA_ENV = re.compile(r"^\.env(\.(?!example$)[\w.-]+)?$")

# Repo publik: alamat VPS, port WAHA, dan nomor pribadi ada di lokal.json (di-gitignore). Tanpa berkas itu semua ssh
# ditolak dan pola tambahan kosong.
try:
    LOKAL = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "lokal.json")))
except Exception:
    LOKAL = {}
VPS = LOKAL.get("vps") or {}
POLA_WA = "waha|/api/send|sendText" + ("|" + LOKAL["pola_wa"] if LOKAL.get("pola_wa") else "")
POLA_NOMOR = LOKAL.get("pola_nomor_terlarang") or r"(?!x)x"
POLA_LINDUNG = r"greenbox-site|Caddyfile|caddy\s" + ("|" + LOKAL["pola_vps_lindung"] if LOKAL.get("pola_vps_lindung") else "")
POLA_ALAMAT_PRIBADI = "|".join(re.escape(ip) for ip in VPS) or r"(?!x)x"

# Teks yang ditolak di perintah shell, isi skrip, dan argumen MCP.
TEKS_TERLARANG = [
    (r"\.claude\b", "menyentuh konfigurasi Claude atau worktree Claude"),
    (r"\.gemini\b", "menyentuh konfigurasi Antigravity"),
    (r"(~|\$HOME|\$\{HOME\}|/Users/[^/\s]+)/\.agents?\b", "menyentuh skill global"),
    (r"\.ssh\b|\.aws\b|\.gnupg|Keychains|\.netrc|\.git-credentials", "berkas rahasia"),
    (r"greenbox-izin|izin-greenbox", "berkas izin hanya dibuat pemilik di terminalnya sendiri"),
    (POLA_NOMOR, "nomor WhatsApp keluarga pemilik tidak dipakai di proyek ini"),
    (r"WAHA_API_KEY|X-Api-Key", "kunci WAHA"),
    (r"\bdocker\s+(-\S+\s+)*inspect\b|/proc/\S*/environ", "mencetak env container"),
    (r"\bbase64\s+(-d|-D|--decode)\b", "menyembunyikan perintah"),
    (r"\beval\b", "eval"),
    (r"mcp_config|antigravity-cli|BypassSandbox", "konfigurasi agy"),
    (r"esb\.co\.id|esbcore|esb-core|core\.esb", "ESB tidak boleh dibuka"),
    (r"(echo|printf|print|console\.log|cat|tee)\b[^|;&\n]*\$\{?\w*(SECRET|PASSWORD|PASS|TOKEN|API_KEY|DATABASE_URL)\w*",
     "mencetak rahasia"),
    (r"process\.env\.\w*(SECRET|PASSWORD|TOKEN|API_KEY|DATABASE_URL)", "membaca rahasia dari env"),
    (r"(readFileSync|readFile|open|Path)\(\s*[\"'][^\"']*\.env[\"']", "membaca .env"),
]

PROGRAM_TERLARANG = {
    "sudo", "su", "doas", "nc", "ncat", "netcat", "telnet", "ftp", "socat", "sftp", "osascript", "pkill", "pgrep",
    "killall", "launchctl", "crontab", "defaults", "security", "networksetup", "scutil", "systemsetup", "shutdown",
    "reboot", "halt", "diskutil", "chflags", "csrutil", "tccutil", "screencapture", "pbpaste", "pbcopy", "agy",
    "gemini", "claude", "orca", "vercel", "netlify", "firebase", "gcloud", "aws", "printenv", "history", "chown",
    "xdg-open", "tailscale", "brew", "rclone", "ngrok", "cloudflared",
}
PROGRAM_TULIS = {"rm", "rmdir", "mv", "touch", "mkdir", "ln", "chmod", "tee", "truncate", "unlink", "install"}
PEMBUNGKUS = {"nohup", "caffeinate", "time", "nice", "env", "exec", "timeout", "gtimeout", "command"}
NPX_BOLEH = {"next", "prisma", "tsx", "tsc", "eslint", "playwright"}
BACA_JAUH = {"cat", "ls", "head", "tail", "wc", "grep", "stat", "df", "free", "uptime", "du", "date", "hostname",
             "whoami", "id", "uname", "ps", "test", "echo", "sha256sum", "md5sum", "file", "readlink", "realpath",
             "pwd", "true", "awk", "sort", "uniq", "cut", "tr", "column", "less", "nproc", "which"}

ALAT_BACA = {"read_file", "view_file", "view_file_outline", "view_code_item", "list_dir", "list_directory",
             "grep_search", "find", "find_by_name", "codebase_search", "code_search", "read_terminal"}
ALAT_TULIS = {"write_file", "write_to_file", "edit_file", "replace_file_content", "multi_replace_file_content",
              "sed_file", "file_change", "code_action", "propose_code", "move", "delete_directory", "delete_file"}
ALAT_BEBAS = {"command_status", "wait", "wait_5_seconds", "finish", "task_boundary", "notify_user", "ask_question",
              "ask_permission", "ask_custom_permission", "list_permissions", "checkpoint", "planner_response",
              "manage_task", "search_web", "suggested_responses", "brain_update", "update_steps"}
ALAT_DILARANG_POLA = re.compile(
    r"subagent|send_message|schedule|manage_inbox|run_workflow|search_marketplace|knowledge|plugin_accounts|notebook|"
    r"git_commit|deploy|cloud_sql|firebase|clipboard|run_extension_code|applet|post_pr_review|memory|generate_image", re.I)
KUNCI_PATH = re.compile(r"(path|file|dir|directory|uri|cwd|folder|root)", re.I)
KUNCI_BUKAN_PATH = {"Target", "Replacement", "Content", "toolSummary", "CodeContent", "Instruction", "Query", "query",
                    "Description", "ReplacementContent", "TargetContent", "ReplacementChunks"}
EKSTENSI_TEKS = re.compile(r"\.(md|txt|ts|tsx|js|jsx|mjs|cjs|json|css|html|sh|py|prisma|sql|ya?ml|csv)$", re.I)
EKSTENSI_SKRIP = re.compile(r"\.(sh|zsh|bash|py|mjs|cjs|js|ts|tsx|jsx|rb|pl|command)$", re.I)
ATRIBUSI = re.compile(r"co-authored[-]by|generated (with|by) (claude|gemini|ai|antigravity)|"
                      r"dibuat (dengan|oleh) (ai|claude|gemini|antigravity)|\U0001F916", re.I)
STATUS_AGEN = {"dikerjakan", "menunggu audit"}


class Tolak(Exception):
    pass


class TidakTerurai(Tolak):
    pass


class Tanya(Exception):
    """Perintah sah tetapi wajib dikonfirmasi pemilik (force_ask)."""


def keluar(keputusan, alasan, muatan=None):
    sys.stdout.write(json.dumps({"decision": keputusan, "reason": alasan}))
    sys.stdout.flush()
    try:
        tc = (muatan or {}).get("toolCall") or {}
        with open(LOG, "a") as f:
            f.write(json.dumps({"t": time.strftime("%Y-%m-%dT%H:%M:%S"), "percakapan": (muatan or {}).get("conversationId"),
                                "alat": tc.get("name"), "keputusan": keputusan, "alasan": alasan,
                                "args": json.dumps(tc.get("args", {}), ensure_ascii=False)[:400]}, ensure_ascii=False) + "\n")
    except Exception:
        pass


def di_bawah(p, akar):
    return p == akar or p.startswith(akar.rstrip("/") + "/")


def resolusi(p, cwd):
    p = p.strip()
    if p.startswith("file://"):
        p = p[7:]
    for v, isi in (("${HOME}", HOME), ("$HOME", HOME), ("${TMPDIR}", "/tmp/"), ("$TMPDIR", "/tmp/"), ("${PWD}", cwd), ("$PWD", cwd)):
        p = p.replace(v, isi)
    if p == "~" or p.startswith("~/"):
        p = HOME + p[1:]
    if not os.path.isabs(p):
        p = os.path.join(cwd, p)
    return os.path.realpath(os.path.normpath(p))


def ada_variabel(p):
    sisa = re.sub(r"\$\{?(HOME|TMPDIR|PWD)\}?", "", p)
    return "$" in sisa or "`" in sisa


def akar_ag(p):
    """Akar worktree tugas bila p ada di INDUK/ag-<nnn>, selain itu None."""
    if not di_bawah(p, INDUK) or p == INDUK:
        return None
    pertama = os.path.relpath(p, INDUK).split("/")[0]
    return os.path.join(INDUK, pertama) if POLA_FOLDER_AG.match(pertama) else None


def git_teks(direktori, *argumen):
    try:
        r = subprocess.run(["git", "-C", direktori, *argumen], capture_output=True, text=True, timeout=5)
        return r.stdout.strip() if r.returncode == 0 else None
    except Exception:
        return None


def cabang_di(direktori):
    return git_teks(direktori, "rev-parse", "--abbrev-ref", "HEAD")


def sudah_dipush(direktori, cabang):
    return git_teks(direktori, "rev-parse", "--verify", "--quiet", f"refs/remotes/origin/{cabang}") is not None


def data_pribadi(p):
    return any(di_bawah(p, d) for d in DATA_PRIBADI)


def boleh_baca(p):
    if p.startswith(SKEMA_MCP) and p.endswith(".json") and os.path.basename(os.path.dirname(p)).startswith(MCP_AWALAN):
        return True, ""
    for akar_global in (HOME + "/.gemini/skills/", HOME + "/.gemini/antigravity/skills/", HOME + "/.agents/skills/", HOME + "/.claude/skills/"):
        if p.startswith(akar_global):
            nama = p[len(akar_global):].split("/", 1)
            salinan = os.path.join(REPO, ".agents", "skills", nama[0], nama[1] if len(nama) > 1 else "SKILL.md")
            if os.path.exists(salinan):
                return False, f"skill global; baca salinan repo {salinan}"
            return False, "skill global yang tidak dipakai di proyek ini"
    if RAHASIA.search(p):
        return False, "berkas rahasia"
    if any(di_bawah(p, b) for b in BACA):
        return True, ""
    return False, "membaca di luar folder proyek Greenbox (minta Claude menyalin bahan)"


def boleh_tulis(p):
    """Mengembalikan (ok, alasan, jenis). Jenis: tmp, ag, laporan, status."""
    if data_pribadi(p):
        return False, "folder data pribadi hanya dibaca", ""
    if RAHASIA.search(p):
        return False, "berkas rahasia", ""
    ag = akar_ag(p)
    if not ag and any(di_bawah(p, t) for t in TMP):
        return True, "", "tmp"
    if ag:
        if p == ag:
            return False, "menimpa akar worktree tugas", ""
        for bagian in os.path.relpath(p, ag).split("/"):
            if NAMA_TERKUNCI.match(bagian):
                return False, f"nama terkunci: {bagian} (aturan, hook, tugas, audit, dan laporan diurus di worktree kendali)", ""
        return True, "", "ag"
    if di_bawah(p, REPO):
        rel = os.path.relpath(p, REPO)
        if rel == "tugas/STATUS.md":
            return True, "", "status"
        if re.match(r"^laporan/\d{3}-[a-z0-9][a-z0-9.-]*\.md$", rel):
            return True, "", "laporan"
        return False, "worktree kendali hanya menerima laporan/<nnn>-*.md dan kolom status di tugas/STATUS.md; kode dikerjakan di worktree ag-<nnn>", ""
    return False, "menulis di luar zona kerja (worktree ag-<nnn> dan folder sementara)", ""


def periksa_tulisan(isi, nama):
    if ATRIBUSI.search(isi):
        raise Tolak(f"{nama}: atribusi AI dilarang")
    if EKSTENSI_TEKS.search(nama) and ("\u2014" in isi or "\u2013" in isi):
        raise Tolak(f"{nama}: em dash atau en dash dilarang (pakai koma, titik, atau tanda kurung)")
    if nama.lower().endswith(".md"):
        dalam_kode = False
        for baris in isi.splitlines():
            if baris.strip().startswith("```"):
                dalam_kode = not dalam_kode
                continue
            if not dalam_kode and re.search(r"(^|\s)--(\s|$)", re.sub(r"`[^`]*`", "", baris)) and not re.match(r"^\s*\|?\s*:?-{3,}", baris):
                raise Tolak(f"{nama}: '--' sebagai tanda pisah di prosa dilarang")


def periksa_isi_skrip(isi, nama):
    for pola, alasan in TEKS_TERLARANG:
        if pola == r"\beval\b" and not nama.lower().endswith((".sh", ".zsh", ".bash", ".command")):
            continue
        if re.search(pola, isi, re.I):
            raise Tolak(f"isi skrip {nama}: {alasan}")
    prog = r"(ssh|scp|sftp|rsync|osascript|sudo|pkill|pgrep|killall|screencapture|launchctl|security|pbpaste|agy|orca|gh|dropdb)"
    if re.search(r"[\"'\[(,\s]" + prog + r"[\"'\]),\s]", isi):
        raise Tolak(f"isi skrip {nama}: memanggil program terlarang")
    if re.search(r"git\s+(push|commit|reset|clean|rebase|merge|stash|config|worktree|tag|update-ref|filter-branch)\b", isi):
        raise Tolak(f"isi skrip {nama}: perintah git yang mengubah repo hanya boleh dijalankan langsung")
    if re.search(r"prisma\s+(migrate\s+(reset|dev)|db\s+push)|DROP\s+DATABASE", isi, re.I):
        raise Tolak(f"isi skrip {nama}: perintah basis data yang merusak hanya boleh dijalankan langsung")
    if any(d in isi for d in DATA_PRIBADI) or "greenbox-aset/esb/ss" in isi or "template-gb/asli" in isi:
        raise Tolak(f"isi skrip {nama}: folder data pribadi tidak boleh dipakai di kode")
    if re.search(POLA_WA.replace("waha|", ""), isi) or re.search(r"waha", isi, re.I):
        raise Tolak(f"isi skrip {nama}: akses WAHA")
    unggah = re.search(r"method\s*[:=]\s*[\"'](POST|PUT|PATCH|DELETE)[\"']|requests\.(post|put|patch|delete)\(|"
                       r"curl[^\n]*\s(-T|-F|--form|-d|--data[\w-]*|-X\s*POST)\s", isi, re.I)
    luar = [u for u in re.findall(r"https?://[^\s\"'`)]+", isi) if not re.match(r"https?://(localhost|127\.0\.0\.1)([:/]|$)", u)]
    if unggah and luar:
        raise Tolak(f"isi skrip {nama}: mengirim data ke alamat di luar localhost")


def pecah(perintah):
    lex = shlex.shlex(perintah, posix=True, punctuation_chars=";&|<>()")
    lex.whitespace_split = True
    lex.commenters = ""
    try:
        return list(lex)
    except ValueError:
        raise TidakTerurai("perintah tidak bisa diurai (tanda kutip tidak seimbang)")


def kelompokkan(perintah):
    bersih = re.sub(r"\$\(\s*cat\s+[\w./-]+\.pid\s*\)", "PIDBERKAS", perintah)
    token = pecah(bersih.replace("\n", " ; ").replace("`", " ; "))
    kelompok, kini = [], []
    for t in token:
        if t and set(t) <= set(";&|()"):
            if kini:
                kelompok.append(kini)
            kini = []
        else:
            kini.append(t)
    if kini:
        kelompok.append(kini)
    return kelompok


def nama_db(url):
    m = re.search(r"/([\w-]+)(\?[^\s\"']*)?[\"']?$", url.strip())
    return m.group(1) if m else None


def db_tujuan(penugasan, cwd):
    """Nama basis data yang akan disentuh prisma atau skrip npm: dari DATABASE_URL di depan perintah, atau .env di cwd."""
    url = penugasan.get("DATABASE_URL")
    if url is None:
        for kandidat in (os.path.join(cwd, ".env"), os.path.join(cwd, "sistem", ".env")):
            try:
                for baris in open(kandidat):
                    m = re.match(r"^\s*DATABASE_URL\s*=\s*[\"']?(.+?)[\"']?\s*$", baris)
                    if m:
                        url = m.group(1)
                        break
            except OSError:
                continue
            if url:
                break
    if not url:
        return None, None
    host = re.search(r"@([^/:]+)", url)
    return nama_db(url), (host.group(1) if host else "lokal")


def wajib_db_buang(penugasan, cwd, apa):
    nama, host = db_tujuan(penugasan, cwd)
    if not nama or not POLA_DB_BUANG.match(nama) or host not in ("lokal", "127.0.0.1", "localhost"):
        raise Tolak(f"{apa} hanya boleh ke basis data sementara lokal greenbox_agy_<nnn> atau greenbox_uji_*, "
                    f"bukan {nama or 'yang tidak diketahui'} (basis data greenbox milik pemilik dan produksi dilindungi)")


def ambil_izin(lingkup, host):
    """Pakai satu jatah izin pemilik. Mengembalikan teks keterangan atau None."""
    try:
        nama_berkas = sorted(os.listdir(IZIN_DIR))
    except OSError:
        return None
    kini = time.time()
    for n in nama_berkas:
        if not n.endswith(".json"):
            continue
        p = os.path.join(IZIN_DIR, n)
        try:
            st = os.stat(p)
            if st.st_uid != os.getuid() or st.st_mode & 0o022:
                continue
            d = json.load(open(p))
            if d.get("lingkup") != lingkup or d.get("host") not in (host, "*"):
                continue
            if float(d.get("berlaku_sampai", 0)) < kini or int(d.get("sisa", 0)) <= 0:
                continue
            d["sisa"] = int(d["sisa"]) - 1
            with open(p, "w") as f:
                json.dump(d, f)
            with open(os.path.join(IZIN_DIR, "terpakai.log"), "a") as f:
                f.write(f"{time.strftime('%Y-%m-%dT%H:%M:%S')} {n} sisa {d['sisa']}\n")
            return f"izin {n[:-5]} ({d.get('alasan', '')}), sisa {d['sisa']}"
        except Exception:
            continue
    return None


def periksa_jauh(perintah, host):
    """Perintah yang dijalankan di VPS. Mengembalikan None (hanya baca) atau lingkup izin ('vps' atau 'wa')."""
    if re.search(r"\.env\b|db\.env|akun\.env|printenv|(^|[\s;&|])env\s*($|[;&|])|/proc/\S*/environ|docker\s+inspect|"
                 r"PASSWORD|SECRET|API_KEY|WAHA_API_KEY|X-Api-Key|\bset\s*$", perintah, re.I):
        raise Tolak("perintah di VPS menyentuh rahasia (env, .env, db.env, kunci); tidak bisa diizinkan")
    if re.search(POLA_NOMOR, perintah):
        raise Tolak("nomor WhatsApp keluarga pemilik tidak dipakai di proyek ini")
    for pola, alasan in TEKS_TERLARANG:
        if pola.startswith(r"(echo|printf") or pola.startswith(r"process"):
            continue
        if re.search(pola, perintah, re.I):
            raise Tolak(f"perintah di VPS: {alasan}")
    tulis = False
    for k in kelompokkan(perintah):
        while k and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", k[0]):
            k = k[1:]
        if not k:
            continue
        prog = os.path.basename(k[0])
        arg = k[1:]
        if any(t in (">", ">>", ">|", "&>") or (t.endswith(">") and set(t) <= set("0123456789&>|")) for t in k):
            tulis = True
        elif prog == "cd" or prog in BACA_JAUH:
            continue
        elif prog == "find" and not any(a in ("-delete", "-exec", "-execdir", "-ok") for a in arg):
            continue
        elif prog == "docker" and arg[:1] and arg[0] in ("ps", "logs", "images", "version", "top", "port"):
            continue
        elif prog == "docker" and arg[:2] == ["stats", "--no-stream"]:
            continue
        elif prog == "docker" and arg[:1] == ["exec"] and "psql" in arg:
            sql = " ".join(arg[arg.index("psql") + 1:])
            if re.search(r"-\w*c\s", sql + " ") and re.match(r"^\s*(select|show|explain)\b", arg[-1], re.I) and not re.search(r";\s*\S", arg[-1]):
                continue
            tulis = True
        elif prog == "systemctl" and arg[:1] and arg[0] in ("show", "status", "is-active", "list-units"):
            continue
        elif prog == "journalctl" and not any("vacuum" in a or "rotate" in a for a in arg):
            continue
        elif prog == "git" and arg[:1] and arg[0] in ("log", "status", "show", "rev-parse"):
            continue
        elif prog == "curl" and not re.search(r"\s(-X|--request|-d|--data[\w-]*|-F|--form|-T|--json)\b", " " + " ".join(arg)):
            continue
        else:
            tulis = True
    if re.search(POLA_WA, perintah, re.I):
        return "wa"
    if tulis and re.search(POLA_LINDUNG, perintah, re.I):
        raise Tolak("Caddy, greenbox-site, dan container klien lain di VPS di luar wewenang agen; minta pemilik atau Claude")
    return "vps" if tulis else None


def periksa_ssh(argumen, nama_prog):
    opsi_berarg = set("bcDEeFIiJlmOopQSWw")
    i, host, sisa = 0, None, []
    while i < len(argumen):
        a = argumen[i]
        if host is None and a.startswith("-"):
            if a[1:2] in ("L", "R", "D") or a.startswith("-o") and "Forward" in (a + (argumen[i + 1] if i + 1 < len(argumen) else "")):
                raise Tolak("terowongan ssh dilarang")
            if len(a) == 2 and a[1] in opsi_berarg:
                i += 2
                continue
            i += 1
            continue
        if host is None:
            host = a
        else:
            sisa.append(a)
        i += 1
    if nama_prog != "ssh":
        target = [a for a in argumen if ":" in a and not a.startswith("-")]
        hosts = {t.split(":")[0].split("@")[-1] for t in target}
        if not hosts or not hosts <= set(VPS):
            raise Tolak(f"{nama_prog} hanya ke VPS gugai atau dreinst")
        if any(data_pribadi(resolusi(a, REPO)) for a in argumen if not ":" in a):
            raise Tolak("folder data pribadi tidak boleh diunggah")
        return "vps", VPS[hosts.pop()]
    if not host:
        raise Tolak("ssh tanpa host")
    nama_host = host.split("@")[-1]
    if nama_host not in VPS:
        raise Tolak(f"ssh hanya ke VPS gugai atau dreinst (alamat di .agents/penjaga/lokal.json), bukan {nama_host}")
    if not sisa:
        raise Tolak("ssh tanpa perintah (sesi interaktif) dilarang; tulis perintahnya")
    return periksa_jauh(" ".join(sisa), VPS[nama_host]), VPS[nama_host]


def periksa_git(argumen, cwd):
    """argumen sesudah kata 'git'."""
    ident, cwd_git, i = {}, cwd, 0
    while i < len(argumen) and argumen[i].startswith("-"):
        a = argumen[i]
        if a == "-C" and i + 1 < len(argumen):
            if ada_variabel(argumen[i + 1]):
                raise Tolak("git -C dengan variabel")
            cwd_git = resolusi(argumen[i + 1], cwd)
            i += 2
            continue
        if a == "-c" and i + 1 < len(argumen):
            kunci, _, nilai = argumen[i + 1].partition("=")
            if kunci not in ("user.name", "user.email"):
                raise Tolak(f"git -c {kunci} dilarang (hanya user.name dan user.email)")
            ident[kunci] = nilai
            i += 2
            continue
        i += 1
    sub = argumen[i] if i < len(argumen) else ""
    arg = argumen[i + 1:]
    ok, alasan = boleh_baca(cwd_git)
    if not ok:
        raise Tolak(f"git di {cwd_git}: {alasan}")
    baca = {"status", "log", "diff", "show", "archive", "rev-parse", "ls-files", "blame", "merge-base", "cat-file", "describe",
            "shortlog", "grep", "fetch", "ls-tree", "name-rev", "for-each-ref", "rev-list", "range-diff", "check-ignore"}
    if sub in baca:
        return
    if sub == "branch" and all(a in ("-a", "-r", "-v", "-vv", "--list", "--show-current") for a in arg):
        return
    if sub == "worktree" and arg[:1] == ["list"]:
        return
    if sub == "remote" and arg in ([], ["-v"]):
        return
    if sub == "stash" and arg[:1] in (["list"], ["show"]):
        return
    ok, _ = boleh_baca(cwd_git)
    if not ok:
        raise Tolak("git di folder yang tidak boleh dibaca")
    ag = akar_ag(cwd_git)
    if di_bawah(cwd_git, REPO) and not ag:
        if sub == "worktree" and arg[:1] == ["add"]:
            sisa = [a for a in arg[1:] if not a.startswith("-")]
            b = arg[arg.index("-b") + 1] if "-b" in arg and arg.index("-b") + 1 < len(arg) else None
            if b and b in sisa:
                sisa.remove(b)
            tujuan = resolusi(sisa[0], cwd_git) if sisa else ""
            if not tujuan or akar_ag(tujuan) != tujuan:
                raise Tolak("worktree tugas wajib di ~/orca/workspaces/insidegreenbox/ag-<nnn>")
            if not b or not POLA_CABANG_AG.match(b):
                raise Tolak("worktree tugas wajib membuat cabang baru -b ag/<nnn>-<judul>")
            if os.path.basename(tujuan)[3:] != b[3:6]:
                raise Tolak("nomor folder ag-<nnn> dan cabang ag/<nnn>-... harus sama")
            if "-f" in arg or "--force" in arg:
                raise Tolak("git worktree add --force dilarang")
            return
        if sub == "worktree" and arg[:1] == ["remove"]:
            sisa = [a for a in arg[1:] if not a.startswith("-")]
            if "--force" in arg or "-f" in arg or len(sisa) != 1 or akar_ag(resolusi(sisa[0], cwd_git)) != resolusi(sisa[0], cwd_git):
                raise Tolak("git worktree remove hanya untuk ag-<nnn> tanpa --force")
            return
        if sub == "worktree" and arg[:1] == ["prune"]:
            return
        raise Tolak(f"git {sub} dilarang di worktree kendali; kerjakan di worktree ag-<nnn> pada cabang ag/<nnn>-<judul>")
    if not ag:
        raise Tolak(f"git {sub} hanya boleh di worktree tugas ag-<nnn>")
    cabang = cabang_di(cwd_git)
    if not cabang or not POLA_CABANG_AG.match(cabang):
        raise Tolak(f"cabang di {os.path.basename(ag)} bukan ag/<nnn>-<judul> (sekarang {cabang})")
    dipush = sudah_dipush(cwd_git, cabang)
    if sub in ("add", "rm", "mv", "restore", "merge", "cherry-pick", "revert", "apply", "am", "gc"):
        return
    if sub == "commit":
        if "--amend" in arg and dipush:
            raise Tolak("commit --amend atas commit yang sudah di-push dilarang (butuh force push)")
        nama = ident.get("user.name") or git_teks(cwd_git, "config", "user.name")
        surel = ident.get("user.email") or git_teks(cwd_git, "config", "user.email")
        if (nama, surel) != IDENTITAS:
            raise Tolak("commit wajib dengan git -c user.name=dreinst -c user.email=asteinec@gmail.com")
        for a in arg:
            if a.startswith("--author") and "asteinec@gmail.com" not in a:
                raise Tolak("--author lain dilarang")
        pesan = []
        for j, a in enumerate(arg):
            if a in ("-m", "--message") and j + 1 < len(arg):
                pesan.append(arg[j + 1])
            elif a.startswith("--message="):
                pesan.append(a.split("=", 1)[1])
            elif a.startswith("-m") and len(a) > 2 and not a.startswith("--"):
                pesan.append(a[2:])
            elif a in ("-F", "--file") and j + 1 < len(arg):
                try:
                    pesan.append(open(resolusi(arg[j + 1], cwd_git)).read())
                except OSError:
                    raise Tolak("berkas pesan commit tidak terbaca")
        if not pesan and "--no-edit" not in arg:
            raise Tolak("commit wajib memakai -m atau -F (editor tidak bisa dipakai agen)")
        teks = "\n".join(pesan)
        if ATRIBUSI.search(teks):
            raise Tolak("pesan commit memuat atribusi AI (trailer Co-Authored dan sejenisnya dilarang)")
        if "\u2014" in teks or "\u2013" in teks:
            raise Tolak("pesan commit memuat em dash atau en dash")
        return
    if sub == "push":
        if any(a in ("-f", "--force", "--mirror", "--all", "--tags", "--delete", "-d", "--prune") or a.startswith("--force")
               for a in arg):
            raise Tolak("git push --force, --all, --tags, --mirror, dan hapus cabang dilarang")
        bukan_opsi = [a for a in arg if not a.startswith("-")]
        if bukan_opsi and bukan_opsi[0] != "origin":
            raise Tolak("push hanya ke remote origin")
        refspec = bukan_opsi[1:]
        if not refspec:
            refspec = [cabang]
        for r in refspec:
            if r.startswith("+"):
                raise Tolak("refspec bertanda + (force) dilarang")
            sumber, _, tujuan = r.partition(":")
            for nama in (sumber, tujuan or sumber):
                nama = nama.replace("refs/heads/", "")
                if nama == "HEAD":
                    nama = cabang
                if not POLA_CABANG_AG.match(nama):
                    raise Tolak(f"push hanya untuk cabang ag/<nnn>-<judul>, bukan {nama or '(hapus)'}")
        return
    if sub == "reset":
        if "--hard" in arg and dipush:
            raise Tolak("git reset --hard di cabang yang sudah di-push (cabang bersama) dilarang")
        return
    if sub == "rebase":
        if dipush:
            raise Tolak("rebase cabang yang sudah di-push dilarang (butuh force push)")
        return
    if sub == "stash":
        aksi = arg[0] if arg else ""
        if aksi in ("push", "save", ""):
            if aksi == "save" and len(arg) > 1:
                return
            if any(a in ("-m", "--message") or a.startswith("--message=") for a in arg):
                return
            raise Tolak("git stash wajib bertag: git stash push -u -m '<tag-unik>'")
        if aksi == "apply" and len(arg) == 2:
            return
        if aksi == "drop" and len(arg) == 2:
            return
        raise Tolak("git stash pop, clear, dan drop atau apply tanpa rujukan dilarang; pakai apply <sha> lalu drop stash@{n}")
    if sub in ("switch", "checkout"):
        if "--" in arg:
            return
        sasaran = [a for a in arg if not a.startswith("-")]
        if sub == "checkout" and len(sasaran) == 1 and "-b" not in arg and os.path.exists(os.path.join(cwd_git, sasaran[0])):
            return
        if sasaran and POLA_CABANG_AG.match(sasaran[0]):
            return
        raise Tolak(f"git {sub} hanya ke cabang ag/<nnn>-<judul> atau memulihkan berkas dengan --")
    if sub == "branch":
        sasaran = [a for a in arg if not a.startswith("-")]
        if any(not POLA_CABANG_AG.match(s) for s in sasaran) or not sasaran:
            raise Tolak("git branch hanya untuk membuat atau menghapus cabang ag/<nnn>-<judul>")
        return
    if sub == "clean":
        if any(a in ("-n", "--dry-run") for a in arg):
            return
        if any("x" in a.lstrip("-") or "X" in a for a in arg if a.startswith("-")):
            raise Tolak("git clean -x menghapus .env dan berkas terabaikan lain")
        return
    raise Tolak(f"git {sub} dilarang")


def periksa_perintah(perintah, cwd, dari_skrip=False, izin=None):
    """izin: daftar tempat mencatat kebutuhan izin pemilik [(lingkup, host)]."""
    if izin is None:
        izin = []
    if not perintah.strip():
        return izin
    for pola, alasan in TEKS_TERLARANG:
        if re.search(pola, perintah, re.I):
            raise Tolak(f"perintah ditolak: {alasan}")
    if re.search(r"(curl|wget)\b[^|]*\|\s*(sudo\s+)?(sh|bash|zsh|python3?|node|perl|ruby)\b", perintah):
        raise Tolak("menjalankan skrip unduhan langsung")
    if ("\u2014" in perintah or "\u2013" in perintah) and re.search(r">|\btee\b|sed\s+-i|perl\s+-i|git\s.*commit|<<|\bprintf\b|\becho\b", perintah):
        raise Tolak("menulis em dash atau en dash dilarang")
    if any(d in resolusi_teks(perintah) for d in DATA_PRIBADI):
        cek_data_pribadi(perintah)
    for dalam in re.findall(r"\$\(([^()]*)\)", perintah) + re.findall(r"`([^`]*)`", perintah):
        if re.match(r"^\s*cat\s+[\w./-]+\.pid\s*$", dalam):
            continue
        periksa_perintah(dalam, cwd, dari_skrip, izin)
    cwd_kini = cwd
    for k in kelompokkan(perintah):
        penugasan = {}
        while k and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", k[0]):
            kunci, _, nilai = k[0].partition("=")
            penugasan[kunci] = nilai
            k = k[1:]
        if not k:
            continue
        for t in k:
            for kata in re.split(r"[^\w.\-/]", t):
                b = os.path.basename(kata)
                if b in PROGRAM_TERLARANG and t == k[0] or b in ("pkill", "pgrep", "killall", "sudo", "osascript") and kata == t:
                    raise Tolak(f"program terlarang: {b}")
        prog = os.path.basename(k[0])
        argumen = k[1:]
        terkunci = False
        while prog in PEMBUNGKUS or prog == "lockf" or prog == "flock" or prog == "xargs":
            if prog == "xargs":
                sisa = [a for a in argumen if not a.startswith("-")]
                if sisa and os.path.basename(sisa[0]) in PROGRAM_TULIS | {"kill", "git", "ssh", "sh", "bash"}:
                    raise Tolak("xargs dengan rm, mv, kill, git, atau shell (target tidak terlihat)")
                break
            if prog in ("lockf", "flock"):
                sisa = [a for a in argumen if not a.startswith("-") and not re.match(r"^\d+$", a)]
                if sisa and resolusi(sisa[0], cwd_kini or cwd) in ("/tmp/greenbox-berat.lock", "/private/tmp/greenbox-berat.lock"):
                    terkunci = True
                sisa = sisa[1:]
            else:
                sisa = []
                for a in argumen:
                    if not sisa and (a.startswith("-") or re.match(r"^\d+[smh]?$", a)):
                        continue
                    if not sisa and prog == "env" and re.match(r"^[A-Za-z_]\w*=", a):
                        kunci, _, nilai = a.partition("=")
                        penugasan[kunci] = nilai
                        continue
                    sisa.append(a)
                if prog == "env" and not sisa:
                    raise Tolak("mencetak variabel lingkungan")
            if not sisa:
                break
            while sisa and re.match(r"^[A-Za-z_][A-Za-z0-9_]*=", sisa[0]):
                kunci, _, nilai = sisa[0].partition("=")
                penugasan[kunci] = nilai
                sisa = sisa[1:]
            if not sisa:
                break
            prog, argumen = os.path.basename(sisa[0]), sisa[1:]
        k = [prog] + argumen
        if prog in PROGRAM_TERLARANG:
            raise Tolak(f"program terlarang: {prog}")
        if prog == "open":
            raise Tolak("membuka aplikasi atau browser untuk pemilik dilarang")
        if prog in ("set", "export", "declare") and (not argumen or argumen in (["-p"], ["-x"])):
            raise Tolak("mencetak variabel lingkungan")
        if prog == "grep" and any(re.match(r"^-\w*[rR]", a) for a in argumen) and not any("--exclude" in a and ".env" in a for a in argumen):
            raise Tolak("grep rekursif wajib --exclude='.env*' (atau pakai rg atau grep_search yang mengikuti .gitignore)")
        if prog == "rg" and any(a in ("-u", "-uu", "-uuu", "--no-ignore", "--hidden") for a in argumen):
            raise Tolak("rg tanpa .gitignore bisa mencetak .env")
        if prog in ("source", ".") and argumen and NAMA_ENV.match(os.path.basename(argumen[0])):
            raise Tolak("memuat .env ke shell dilarang")
        if prog in ("bash", "sh", "zsh", "dash") and "-c" in argumen:
            j = argumen.index("-c")
            if j + 1 < len(argumen):
                periksa_perintah(argumen[j + 1], cwd_kini or cwd, dari_skrip, izin)
            continue
        if prog in ("python", "python3", "node", "ruby", "perl", "tsx") and any(a in ("-c", "-e", "--eval", "-p", "--print") for a in argumen):
            j = next(i for i, a in enumerate(argumen) if a in ("-c", "-e", "--eval", "-p", "--print"))
            if j + 1 < len(argumen):
                periksa_isi_skrip(argumen[j + 1], "sebaris.py" if prog.startswith("python") else "sebaris.mjs")
        if prog in ("ssh", "scp", "rsync"):
            lingkup, host = periksa_ssh(argumen, prog)
            if lingkup:
                izin.append((lingkup, host))
            continue
        if prog == "git":
            periksa_git(argumen, cwd_kini or cwd)
            continue
        if prog == "gh":
            if not (argumen[:1] in (["pr"], ["run"], ["repo"]) and argumen[1:2] and argumen[1] in ("view", "list", "diff", "checks", "status")):
                raise Tolak("gh hanya untuk membaca (pr view, list, diff, checks); merge, komentar, dan ubah PR dilarang")
            continue
        if prog == "kill":
            for a in argumen:
                if not (re.match(r"^-?(\d+|[A-Z]+|-?TERM|-?INT|-?KILL|%\d+)$", a) or a == "PIDBERKAS"):
                    raise Tolak("kill hanya dengan PID angka atau $(cat <berkas>.pid)")
            continue
        if prog == "pmset" and argumen[:1] != ["-g"]:
            raise Tolak("pmset hanya boleh -g (membaca)")
        if prog == "docker":
            sub = next((a for a in argumen if not a.startswith("-")), "")
            if sub not in ("ps", "logs", "exec", "start", "stats", "images", "version", "build"):
                raise Tolak(f"docker {sub} dilarang di Mac (container greenbox-pg-dev dan volumenya milik bersama)")
            if sub == "exec" and "greenbox-pg-dev" not in argumen:
                raise Tolak("docker exec hanya ke greenbox-pg-dev")
            if sub == "start" and argumen[-1] != "greenbox-pg-dev":
                raise Tolak("docker start hanya untuk greenbox-pg-dev")
            if sub == "build" and not terkunci:
                raise Tolak("docker build berat: bungkus dengan lockf -k /tmp/greenbox-berat.lock")
        teks = " ".join(k)
        m = re.search(r"DROP\s+DATABASE\s+(IF\s+EXISTS\s+)?\"?([\w-]+)", teks, re.I)
        if m and not POLA_DB_BUANG.match(m.group(2)):
            raise Tolak(f"DROP DATABASE {m.group(2)} dilarang (hanya greenbox_agy_* dan greenbox_uji_*)")
        if re.search(r"\b(DROP\s+(SCHEMA|TABLE)|TRUNCATE|DELETE\s+FROM|UPDATE\s+\"?\w+\"?\s+SET|ALTER\s+TABLE|INSERT\s+INTO)\b", teks, re.I):
            if not re.search(r"greenbox_(agy|uji)_\w+", teks) or re.search(r"(-d\s*|/|dbname=)greenbox\b(?!_)", teks):
                raise Tolak("SQL yang mengubah data hanya boleh ke basis data greenbox_agy_* atau greenbox_uji_* yang disebut jelas")
        if prog in ("dropdb", "createdb"):
            nama = next((a for a in reversed(argumen) if not a.startswith("-")), "")
            if not POLA_DB_BUANG.match(nama):
                raise Tolak(f"{prog} {nama} dilarang (hanya greenbox_agy_* dan greenbox_uji_*)")
        if prog in ("curl", "wget"):
            gabung = " " + " ".join(argumen) + " "
            kirim = re.search(r"\s(-T|--upload-file|-F|--form|-d|--data[\w-]*|--json|--post-data|--post-file|--method|--body-data|--body-file)(\s|=)", gabung) \
                or re.search(r"\s-X\s*(POST|PUT|PATCH|DELETE)|\s--request\s*(POST|PUT|PATCH|DELETE)", gabung, re.I)
            if re.search(POLA_WA, gabung, re.I) or (VPS and re.search(POLA_ALAMAT_PRIBADI, gabung)):
                izin.append(("wa", "dreinst"))
                continue
            url = [a for a in argumen if re.match(r"^https?://", a)]
            if kirim and any(not re.match(r"^https?://(localhost|127\.0\.0\.1)([:/]|$)", u) for u in url):
                raise Tolak("mengirim data lewat curl atau wget hanya ke localhost (produksi dan layanan luar tidak)")
        if prog == "npx":
            alat = next((a for a in argumen if not a.startswith("-")), "")
            if "--yes" in argumen or "-y" in argumen or alat.split("@")[0] not in NPX_BOLEH:
                raise Tolak(f"npx {alat} dilarang: hanya {', '.join(sorted(NPX_BOLEH))} dari node_modules proyek")
            argumen = argumen[argumen.index(alat) + 1:]
            prog = alat.split("@")[0]
        if prog in ("npm", "pnpm", "yarn", "bun"):
            if any(a in ("-g", "--global", "publish", "login", "adduser", "token", "unpublish", "link") for a in argumen):
                raise Tolak("pemasangan global atau publikasi paket")
            if argumen[:1] in (["install"], ["i"], ["add"]) and [a for a in argumen[1:] if not a.startswith("-")]:
                raise Tolak("memasang paket baru dilarang kecuali tugas menyebutnya; tulis di laporan dan berhenti")
            skrip = argumen[1] if argumen[:1] in (["run"], ["run-script"]) and len(argumen) > 1 else (argumen[0] if argumen else "")
            if skrip in ("dev", "start"):
                raise Tolak("npm run dev dan npm start memakai port 3241 milik pemilik; pakai npx next dev -p 33<nn> di worktree ag-<nnn>")
            if skrip in ("db:setup", "seed:contoh", "akun:awal", "impor:menu", "impor:stok", "impor:resep", "impor:beli", "jurnal:bentuk-ulang"):
                wajib_db_buang(penugasan, cwd_kini or cwd, f"npm run {skrip}")
            if skrip in ("test", "build", "e2e") and not terkunci:
                raise Tolak(f"npm {skrip} berat: wajib lockf -k /tmp/greenbox-berat.lock npm ... (satu proses berat per waktu)")
            if skrip == "e2e":
                cek_e2e(penugasan)
        if prog in ("bash", "sh", "zsh") and argumen and re.search(r"tests/e2e/jalankan\.sh$", argumen[-1] if "-c" not in argumen else ""):
            if not terkunci:
                raise Tolak("uji klik berat: wajib lockf -k /tmp/greenbox-berat.lock")
            cek_e2e(penugasan)
        if prog == "next":
            sub = argumen[0] if argumen else ""
            if sub == "build" and not terkunci:
                raise Tolak("next build berat: wajib lockf -k /tmp/greenbox-berat.lock")
            if sub in ("dev", "start"):
                port = None
                for j, a in enumerate(argumen):
                    if a in ("-p", "--port") and j + 1 < len(argumen):
                        port = argumen[j + 1]
                    elif a.startswith("--port="):
                        port = a.split("=", 1)[1]
                if not port or not re.match(r"^33\d\d$", port):
                    raise Tolak("next dev atau start wajib -p 33<nn> (port 3241 milik pemilik)")
                if not akar_ag(cwd_kini or cwd):
                    raise Tolak("server dijalankan dari worktree ag-<nnn>, bukan dari worktree kendali")
        if prog == "prisma":
            kata = [a for a in argumen if not a.startswith("-")]
            if kata[:2] in (["migrate", "reset"], ["migrate", "dev"], ["db", "push"], ["db", "execute"], ["migrate", "resolve"],
                            ["migrate", "deploy"], ["db", "seed"]):
                wajib_db_buang(penugasan, cwd_kini or cwd, "prisma " + " ".join(kata[:2]))
        if prog == "popd":
            cwd_kini = cwd
            continue
        if prog in ("cd", "pushd"):
            tujuan = argumen[0] if argumen else "~"
            if ada_variabel(tujuan):
                if not dari_skrip:
                    raise Tolak(f"cd ke path bervariabel: {tujuan} (pakai path tertulis)")
                cwd_kini = None
                continue
            p = resolusi(tujuan, cwd_kini or cwd)
            ok, alasan = boleh_baca(p)
            if not ok:
                raise Tolak(f"cd ke {tujuan}: {alasan}")
            cwd_kini = p
            continue
        tulis = prog in PROGRAM_TULIS or (prog in ("sed", "perl") and any(a.startswith("-i") for a in argumen)) \
            or (prog == "find" and any(a in ("-delete", "-exec", "-execdir", "-ok") for a in argumen))
        target_tulis = []
        if prog in ("cp", "ditto"):
            bukan_opsi = [a for a in argumen if not a.startswith("-")]
            if bukan_opsi:
                target_tulis.append(bukan_opsi[-1])
        if prog == "dd":
            target_tulis += [a[3:] for a in argumen if a.startswith("of=")]
        for i, t in enumerate(k):
            if t in (">", ">>", ">|", "&>", "&>>") or (t.endswith(">") and set(t) <= set("0123456789&>|")):
                if i + 1 < len(k):
                    target_tulis.append(k[i + 1])
        if tulis:
            target_tulis += [a for a in argumen if not a.startswith("-")
                             and not (prog == "chmod" and re.match(r"^[0-7]{3,4}$|^[ugoa]*[+-=][rwxX]+$", a))
                             and not (prog == "find" and (a.startswith("{") or a in (";", "+")))
                             and not (prog in ("sed", "perl") and (a == "" or a == next((x for x in argumen if not x.startswith("-") and x), None)))]
        cek_env(prog, argumen, target_tulis, cwd_kini or cwd)
        for tt in target_tulis:
            if tt in ("/dev/null", "/dev/stdout", "/dev/stderr", "&1", "&2"):
                continue
            if ada_variabel(tt) or cwd_kini is None:
                if dari_skrip:
                    continue
                raise Tolak(f"target tulis memakai variabel atau cd tak dikenal: {tt} (pakai path tertulis)")
            p = resolusi(tt, cwd_kini)
            if NAMA_ENV.match(os.path.basename(p)) and akar_ag(p) and prog in ("cp", "sed", "perl", "rm"):
                continue
            ok, alasan, jenis = boleh_tulis(p)
            if not ok:
                raise Tolak(f"{prog} {tt}: {alasan}")
            if jenis in ("status", "laporan"):
                raise Tolak(f"{prog} {tt}: laporan dan STATUS.md diubah lewat alat tulis berkas, bukan shell")
        for t in k[1:]:
            for bagian in t.split("="):
                if not bagian or ada_variabel(bagian):
                    continue
                if "/" in bagian or bagian.startswith("~") or bagian == "..":
                    if re.match(r"^[a-z]+://", bagian) and not bagian.startswith("file://"):
                        continue
                    if bagian.startswith("-") or re.match(r"^[\w.-]+:\d", bagian):
                        continue
                    p = resolusi(bagian, cwd_kini or cwd)
                    if NAMA_ENV.match(os.path.basename(p)) and prog in ("cp", "sed", "perl", "test", "ls", "rm") and (akar_ag(p) or di_bawah(p, REPO)):
                        continue
                    ok, alasan = boleh_baca(p)
                    if not ok:
                        raise Tolak(f"path {bagian}: {alasan}")
    return izin


def resolusi_teks(perintah):
    return perintah.replace("~/", HOME + "/").replace("$HOME/", HOME + "/")


def cek_data_pribadi(perintah):
    teks = resolusi_teks(perintah)
    if re.search(r">|\btee\b|\b(cp|mv|ln|ditto|rsync|scp|ssh|curl|wget|tar|zip|gh|git)\b", teks):
        raise Tolak("folder data pribadi hanya dibaca: tidak boleh disalin, dipindah, diarsip, atau diunggah")


def cek_e2e(penugasan):
    db, port = penugasan.get("E2E_DB", ""), penugasan.get("E2E_PORT", "")
    if not re.match(r"^greenbox_agy_\d{3}\w*$", db) or not re.match(r"^33\d\d$", port):
        raise Tolak("uji klik wajib E2E_DB=greenbox_agy_<nnn>_e2e dan E2E_PORT=33<nn> (greenbox_e2e dan 3241 milik pemilik)")


def cek_env(prog, argumen, target_tulis, cwd):
    """Berkas .env hanya boleh disalin ke worktree tugas atau disunting di tempat dengan sed -i, tidak dibaca ke layar."""
    for a in argumen:
        if ada_variabel(a) or a.startswith("-"):
            continue
        if NAMA_ENV.match(os.path.basename(a)):
            p = resolusi(a, cwd)
            if prog == "cp" and a != (target_tulis[-1] if target_tulis else None):
                tujuan = resolusi(target_tulis[-1], cwd) if target_tulis else ""
                if not (NAMA_ENV.match(os.path.basename(tujuan)) and akar_ag(tujuan)):
                    raise Tolak("salinan .env hanya boleh ke sistem/.env di worktree ag-<nnn>")
                continue
            if prog == "cp":
                continue
            if prog in ("sed", "perl") and any(x.startswith("-i") for x in argumen) and akar_ag(p):
                continue
            if prog in ("test", "ls") or (prog == "rm" and akar_ag(p)):
                continue
            raise Tolak(f"berkas .env tidak boleh dibaca atau dicetak ({prog})")


def isi_baru_edit(lama, args):
    if "ReplacementChunks" in args:
        raise Tolak("STATUS.md diubah dengan edit_file satu potong, bukan multi_replace")
    target = args.get("Target", args.get("TargetContent"))
    ganti = args.get("Replacement", args.get("ReplacementContent"))
    if target is None or ganti is None or target not in lama:
        raise Tolak("edit STATUS.md tidak bisa diperiksa (teks sasaran tidak ditemukan)")
    return lama.replace(target, ganti, 1)


def baris_tabel(isi):
    return [b for b in isi.splitlines() if b.strip().startswith("|")]


def periksa_status(nama, args, p):
    try:
        lama = open(p).read()
    except OSError:
        raise Tolak("tugas/STATUS.md tidak ada; dibuat Claude")
    if nama in ("write_file", "write_to_file"):
        baru = args.get("Content", args.get("CodeContent", ""))
    else:
        baru = isi_baru_edit(lama, args)
    bl, bb = lama.splitlines(), baru.splitlines()
    if len(bl) != len(bb):
        raise Tolak("STATUS.md: agen hanya mengubah kolom status, tidak menambah atau menghapus baris")
    for x, y in zip(bl, bb):
        if x == y:
            continue
        kx = [s.strip() for s in x.strip().strip("|").split("|")]
        ky = [s.strip() for s in y.strip().strip("|").split("|")]
        if not x.strip().startswith("|") or len(kx) != len(ky) or len(kx) < 3:
            raise Tolak("STATUS.md: hanya baris tabel yang boleh berubah")
        beda = [i for i in range(len(kx)) if kx[i] != ky[i]]
        if beda != [2]:
            raise Tolak("STATUS.md: hanya kolom ketiga (status) yang boleh diubah agen")
        dari, ke = kx[2].lower(), ky[2].lower()
        sah = (dari == "menunggu" and ke == "dikerjakan") or (dari.startswith("ulang putaran") and ke == "dikerjakan") \
            or (dari == "dikerjakan" and ke == "menunggu audit")
        if not sah:
            raise Tolak(f"STATUS.md: perubahan '{kx[2]}' ke '{ky[2]}' bukan wewenang agen (hanya menunggu atau ULANG ke dikerjakan, "
                        "dan dikerjakan ke menunggu audit)")


def url_lokal(u):
    return re.match(r"^https?://(localhost|127\.0\.0\.1):33\d\d([/?#]|$)", u)


def periksa(muatan):
    tc = muatan.get("toolCall") or {}
    nama = (tc.get("name") or "").strip()
    args = tc.get("args") or {}
    if not nama:
        raise Tolak("muatan tanpa nama alat")
    ws = [os.path.realpath(w) for w in (muatan.get("workspacePaths") or [])]
    if REPO not in ws:
        raise Tolak("Antigravity wajib dibuka di worktree kendali greenbox-tahap2")
    if cabang_di(REPO) != CABANG_KENDALI:
        raise Tolak(f"worktree kendali harus di cabang {CABANG_KENDALI}")
    cwd = os.path.realpath(muatan.get("cwd") or REPO)

    if nama in ("run_command", "shell_exec", "send_command_input"):
        for kunci, nilai in args.items():
            if "sandbox" in kunci.lower() and nilai not in (False, None, "", "false", 0):
                raise Tolak("menjalankan perintah di luar sandbox dilarang")
        if args.get("Cwd"):
            c = resolusi(args["Cwd"], cwd)
            ok, alasan = boleh_baca(c)
            if not ok:
                raise Tolak(f"Cwd: {alasan}")
            cwd = c
        perintah = args.get("CommandLine") or args.get("command") or args.get("Input") or ""
        if not isinstance(perintah, str) or not perintah.strip():
            raise Tolak("perintah kosong")
        izin = periksa_perintah(perintah, cwd)
        if izin:
            catatan = []
            for lingkup, host in dict.fromkeys(izin):
                ket = ambil_izin(lingkup, host)
                if not ket:
                    jenis = "kirim atau baca WhatsApp lewat WAHA" if lingkup == "wa" else f"menulis atau menghentikan sesuatu di VPS {host}"
                    raise Tolak(f"perintah ini {jenis} dan butuh izin pemilik (lingkup {lingkup}, host {host}) yang belum ada. "
                                "Berhenti dan minta pemilik membuat izin; jangan mencari jalan lain")
                catatan.append(ket)
            raise Tanya("PERLU PERSETUJUAN PEMILIK: " + "; ".join(catatan) + ". Baca perintahnya sebelum menyetujui.")
        return "perintah lolos penjaga"

    if nama in ALAT_TULIS:
        paths = [p for k, v in args.items() if k not in KUNCI_BUKAN_PATH and KUNCI_PATH.search(k)
                 for p in (v if isinstance(v, list) else [v]) if isinstance(p, str) and p.strip()]
        if not paths:
            raise Tolak(f"{nama} tanpa path yang bisa diperiksa")
        if nama in ("delete_file", "delete_directory", "move"):
            for p in paths:
                ok, alasan, jenis = boleh_tulis(resolusi(p, cwd))
                if not ok or jenis in ("status", "laporan"):
                    raise Tolak(f"{nama} {p}: {alasan or 'laporan dan STATUS.md tidak boleh dihapus atau dipindah'}")
            return "hapus atau pindah di zona kerja"
        isi = "\n".join(str(args.get(k, "")) for k in ("Content", "Replacement", "CodeContent", "ReplacementContent"))
        for potong in args.get("ReplacementChunks") or []:
            if isinstance(potong, dict):
                isi += "\n" + str(potong.get("ReplacementContent", potong.get("Replacement", "")))
        for p in paths:
            r = resolusi(p, cwd)
            if NAMA_ENV.match(os.path.basename(r)):
                raise Tolak(f"{nama} {p}: .env tidak ditulis lewat alat berkas (isinya masuk transkrip)")
            ok, alasan, jenis = boleh_tulis(r)
            if not ok:
                raise Tolak(f"{nama} {p}: {alasan}")
            periksa_tulisan(isi, os.path.basename(r))
            if jenis == "status":
                periksa_status(nama, args, r)
            if jenis == "laporan" and os.path.exists(r) and nama in ("write_file", "write_to_file"):
                lama = open(r).read()
                baru = args.get("Content", args.get("CodeContent", ""))
                if not baru.startswith(lama.rstrip()[:200]):
                    raise Tolak("laporan lama tidak boleh ditimpa; tambah bagian putaran baru di akhir berkas")
            if jenis == "laporan" and os.path.exists(r) and nama not in ("write_file", "write_to_file"):
                lama = open(r).read()
                target = args.get("Target", args.get("TargetContent"))
                awal_putaran = lama.rfind("## Putaran")
                if not isinstance(target, str) or (awal_putaran > 0 and lama.find(target) < awal_putaran):
                    raise Tolak("hanya putaran terakhir laporan yang boleh disunting; putaran lama tidak diubah")
            if EKSTENSI_SKRIP.search(r) and isi.strip():
                periksa_isi_skrip(isi, os.path.basename(r))
        return "tulis di zona kerja"

    if nama in ALAT_BACA:
        for p in [p for k, v in args.items() if k not in KUNCI_BUKAN_PATH and KUNCI_PATH.search(k)
                  for p in (v if isinstance(v, list) else [v]) if isinstance(p, str) and p.strip()]:
            ok, alasan = boleh_baca(os.path.normpath(os.path.expanduser(p)) if p.startswith(("~", "/")) else resolusi(p, cwd))
            if ok:
                ok, alasan = boleh_baca(resolusi(p, cwd))
            if not ok:
                raise Tolak(f"{nama} {p}: {alasan}")
        return "baca di zona yang diizinkan"

    if nama == "read_url_content":
        url = str(args.get("Url") or args.get("url") or "")
        if not re.match(r"^https?://", url):
            raise Tolak("read_url_content hanya untuk http atau https")
        if re.search(r"localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|10\.\d|100\.\d|192\.168\.|esb|insidegreenbox\.com|whatsapp|wa\.me", url, re.I) \
                or re.search(POLA_ALAMAT_PRIBADI, url):
            raise Tolak("alamat lokal, pribadi, produksi, ESB, atau WhatsApp")
        return "baca halaman web"

    if "browser" in nama.lower():
        teks = json.dumps(args, ensure_ascii=False)
        url = re.findall(r"https?://[^\s\"'\\)]+", teks)
        if re.search(r"esb|insidegreenbox|whatsapp|wa\.me|file://", teks, re.I) or re.search(POLA_ALAMAT_PRIBADI, teks):
            raise Tolak("browser tidak boleh membuka ESB, produksi, WhatsApp, VPS, atau berkas lokal")
        if any(not url_lokal(u) for u in url):
            raise Tolak("browser hanya untuk server uji di http://127.0.0.1:33<nn> dari worktree ag-<nnn>")
        if nama in ("browser_subagent", "open_browser_url") and not url:
            raise Tolak("tulis alamat http://127.0.0.1:33<nn> yang dibuka secara jelas")
        return "browser ke server uji lokal"

    if "mcp" in nama.lower() or nama in ("list_resources", "read_resource"):
        teks = json.dumps(args, ensure_ascii=False)
        server = str(args.get("ServerName") or args.get("serverName") or args.get("server") or args.get("Server") or "")
        if not server:
            m = re.match(r"^(?:mcp_)?([a-z0-9-]+)[_/]", nama.replace("mcp_tool", ""))
            server = m.group(1) if m else ""
        if server.startswith(MCP_AWALAN):
            server = server[len(MCP_AWALAN):]
        if server not in MCP_BOLEH:
            raise Tolak(f"server MCP tidak diizinkan: {server or '(tidak terbaca)'}; yang boleh hanya context7")
        if any(d in teks for d in DATA_PRIBADI):
            raise Tolak("data pribadi tidak boleh dikirim ke MCP")
        return f"MCP {server}"

    if nama in ALAT_BEBAS:
        return "alat tanpa efek berkas"
    if ALAT_DILARANG_POLA.search(nama):
        raise Tolak(f"alat dilarang di proyek ini: {nama}")
    raise Tolak(f"alat belum dikenal penjaga: {nama} (catat di laporan, jangan mencari jalan lain)")


def main():
    mentah = sys.stdin.read()
    try:
        muatan = json.loads(mentah)
    except Exception:
        keluar("deny", "penjaga: muatan bukan JSON")
        return
    try:
        if not isinstance(muatan, dict) or muatan.get("hookEventName") not in (None, "PreToolUse"):
            keluar("deny", "penjaga hanya untuk PreToolUse", muatan if isinstance(muatan, dict) else None)
            return
        alasan = periksa(muatan)
        keluar("allow", alasan, muatan)
    except Tanya as e:
        keluar("force_ask", f"PENJAGA GREENBOX: {e}", muatan)
    except Tolak as e:
        if "baca salinan repo" in str(e):
            keluar("deny", f"PENJAGA GREENBOX: {e}. Buka salinan itu (AGENTS.md 0.4).", muatan)
        else:
            keluar("deny", f"PENJAGA GREENBOX: {e}. Lihat AGENTS.md bagian 12. Jangan mencari jalan lain; tulis di laporan.", muatan)
    except Exception as e:
        keluar("deny", f"penjaga galat ({type(e).__name__}); ditolak demi aman", muatan)


if __name__ == "__main__":
    main()
