#!/bin/bash
# Self-check of narrate.sh: clips with each engine, offsets from the capture helpers, mix.
# Needs ffmpeg, and say or uv. Run: bash narrate_test.sh
set -u
HERE=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d)
trap 'rm -rf "$T"' EXIT
fail() { echo "FAIL: $*"; exit 1; }

printf 'Première étape.\nDeuxième étape, un peu plus longue.\n' >"$T/lines.txt"

engines=(piper)
command -v say >/dev/null && engines=(say piper)
for e in "${engines[@]}"; do
  out=$(PR_DEMO_TTS=$e "$HERE/narrate.sh" clips "$T" fr_FR 2>/dev/null) || fail "clips with $e"
  [ "$(wc -l <<<"$out")" -eq 2 ] || fail "$e: expected 2 clips, got: $out"
  awk '$2 <= 0.3 { exit 1 }' <<<"$out" || fail "$e: empty clip: $out"
done

(
  . "$HERE/narrate.sh" "$T"
  start
  mark 0
  wait_clip 0
  mark 1
) || fail "capture helpers"
read -r _ first <<<"$(sed -n 1p "$T/offsets.txt")"
read -r _ second <<<"$(sed -n 2p "$T/offsets.txt")"
clip0=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$T/s0.wav")
[ "$first" -lt 200 ] || fail "clip 0 should start at once, got $first ms"
perl -e "exit !($second >= ($clip0 + 0.6) * 1000 - 50)" || fail "clip 1 at $second ms overlaps clip 0 ($clip0 s)"

ffmpeg -v error -f lavfi -i testsrc=size=320x240:rate=10:duration=4 -c:v libvpx-vp9 "$T/v.webm" || fail "test video"
"$HERE/narrate.sh" mix "$T/v.webm" "$T" "$T/out.webm" || fail "mix"
[ "$(ffprobe -v error -show_entries stream=codec_name -of csv=p=0 "$T/out.webm" | sort | tr '\n' ' ')" = "opus vp9 " ] ||
  fail "out.webm should hold vp9 + opus"
echo "OK (${engines[*]})"
