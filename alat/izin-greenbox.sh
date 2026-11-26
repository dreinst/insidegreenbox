#!/bin/zsh
# Izin sekali jalan dari pemilik untuk perintah Antigravity yang menulis ke VPS atau memakai WAHA.
# Jalankan sendiri di terminalmu, bukan lewat Antigravity (penjaga menolak agen menyentuh berkas izin).
#
#   alat/izin-greenbox.sh <vps|wa> <gugai|dreinst|*> <menit> <jumlah perintah> "<alasan>"
#   alat/izin-greenbox.sh vps gugai 30 12 "rilis tugas 003"
#   alat/izin-greenbox.sh cabut            # hapus semua izin yang masih berlaku
#
# Tiap perintah yang memakai izin tetap ditanyakan lagi di Antigravity (force_ask), jadi baca perintahnya
# sebelum menyetujui. Pemakaian tercatat di ~/.config/greenbox-izin/terpakai.log.
set -eu
DIR="$HOME/.config/greenbox-izin"
mkdir -p -m 700 "$DIR"
if [ "${1:-}" = "cabut" ]; then
  rm -f "$DIR"/*.json
  echo "Semua izin dicabut."
  exit 0
fi
if [ $# -ne 5 ]; then
  sed -n '5,7p' "$0"
  exit 1
fi
LINGKUP=$1 HOST=$2 MENIT=$3 JUMLAH=$4 ALASAN=$5
case "$LINGKUP" in vps|wa) ;; *) echo "lingkup harus vps atau wa"; exit 1;; esac
case "$HOST" in gugai|dreinst|'*') ;; *) echo "host harus gugai, dreinst, atau *"; exit 1;; esac
ID="$(date +%Y%m%d-%H%M%S)-$LINGKUP"
umask 077
python3 - "$DIR/$ID.json" "$LINGKUP" "$HOST" "$MENIT" "$JUMLAH" "$ALASAN" <<'PY'
import json, sys, time
p, lingkup, host, menit, jumlah, alasan = sys.argv[1:]
json.dump({"lingkup": lingkup, "host": host, "berlaku_sampai": time.time() + int(menit) * 60,
           "sisa": int(jumlah), "alasan": alasan, "dibuat": time.time()}, open(p, "w"))
PY
echo "Izin $ID: $LINGKUP di $HOST, $JUMLAH perintah, berlaku $MENIT menit."
