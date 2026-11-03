#!/bin/bash
# Voice-over for a pr-demo video, offline: macOS `say`, else Piper through uv.
#
# Run:    narrate.sh clips <dir> <locale>   # <dir>/lines.txt, one sentence per step → <dir>/s<i>.wav
#         narrate.sh mix <video> <dir> <out> # lays each s<i>.wav at its offset from <dir>/offsets.txt
# Source: . narrate.sh <dir>                 # in a capture script: caption, mark, wait_clip
#
# PR_DEMO_TTS=say|piper forces an engine; PR_DEMO_VOICE names the voice (a `say -v` name or a
# Piper voice such as fr_FR-siwis-medium).

PIPER_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/pr-demo/piper"

_say_voice() { # best `say` voice for locale $1, Premium then Enhanced; none: Piper sounds better
  local lines
  lines=$(say -v '?' 2>/dev/null | grep -E "[[:space:]]$1[[:space:]]") || return 1
  for q in Premium Enhanced; do
    grep -F "($q)" <<<"$lines" | head -1 | sed -E "s/[[:space:]]+$1[[:space:]].*//" | grep . && return 0
  done
  return 1
}

_piper_voice() {
  case "$1" in
  fr_*) echo fr_FR-siwis-medium ;;
  en_GB) echo en_GB-alba-medium ;;
  en_*) echo en_US-lessac-medium ;;
  *) return 1 ;;
  esac
}

_duration() { ffprobe -v error -show_entries format=duration -of csv=p=0 "$1"; }

clips() { # $1 = dir, $2 = locale (fr_FR, en_US…)
  local dir=$1 locale=$2 engine=${PR_DEMO_TTS:-} voice=${PR_DEMO_VOICE:-} i=0 line
  [ -s "$dir/lines.txt" ] || { echo "no $dir/lines.txt" >&2; return 1; }
  if [ -z "$engine" ]; then
    if command -v say >/dev/null && { [ -n "$voice" ] || _say_voice "$locale" >/dev/null; }; then
      engine=say
    else
      engine=piper
    fi
  fi
  if [ "$engine" = say ]; then
    voice=${voice:-$(_say_voice "$locale")}
  else
    command -v uvx >/dev/null || { echo "Piper needs uv (uvx)" >&2; return 1; }
    voice=${voice:-$(_piper_voice "$locale")} || { echo "no Piper voice for $locale: set PR_DEMO_VOICE" >&2; return 1; }
    mkdir -p "$PIPER_DIR"
    [ -f "$PIPER_DIR/$voice.onnx" ] ||
      uvx --from piper-tts python -m piper.download_voices --data-dir "$PIPER_DIR" "$voice" >&2 || return 1
  fi
  echo "voice: $engine $voice" >&2
  while IFS= read -r line || [ -n "$line" ]; do
    [ -n "$line" ] || continue
    if [ "$engine" = say ]; then
      say -v "$voice" --file-format=WAVE --data-format=LEI16@24000 -o "$dir/s$i.wav" "$line" || return 1
    else
      uvx --from piper-tts piper -m "$voice" --data-dir "$PIPER_DIR" -f "$dir/s$i.wav" -- "$line" 2>/dev/null || return 1
    fi
    echo "$i $(_duration "$dir/s$i.wav")"
    i=$((i + 1))
  done <"$dir/lines.txt"
}

mix() { # $1 = video, $2 = dir, $3 = out
  local video=$1 dir=$2 out=$3 inputs=() filters="" labels="" n=0 i ms
  while read -r i ms; do
    inputs+=(-i "$dir/s$i.wav")
    n=$((n + 1))
    filters+="[$n:a]adelay=${ms}|${ms}[a$i];"
    labels+="[a$i]"
  done <"$dir/offsets.txt"
  [ "$n" -gt 0 ] || { echo "no offsets in $dir/offsets.txt" >&2; return 1; }
  # Video copied as is: only the audio track is new. No -shortest: a last sentence may end after the picture.
  ffmpeg -v error -y -i "$video" "${inputs[@]}" \
    -filter_complex "${filters}${labels}amix=inputs=$n:normalize=0[a]" \
    -map 0:v -map "[a]" -c:v copy -c:a libopus -b:a 96k "$out" || return 1
  ffprobe -v error -show_entries stream=codec_type -of csv=p=0 "$out" | grep -qx audio
}

# --- capture helpers, for a capture script that sources this file ---

_now() { perl -MTime::HiRes=time -e 'printf "%.3f", time'; }

start() { # call right after `video-start`: offsets count from here
  NARRATE_T0=$(_now)
  : >"$NARRATE_DIR/offsets.txt"
}

caption() { # $1 = text, shown at the bottom of the page until the next caption
  local text
  text=$(perl -CA -MJSON::PP -e 'print JSON::PP->new->allow_nonref->utf8->encode($ARGV[0])' "$1")
  playwright-cli -s=pr-demo eval "() => { let d = document.getElementById('pr-demo-caption'); if (!d) { d = document.createElement('div'); d.id = 'pr-demo-caption'; document.body.appendChild(d); } d.style.cssText = 'position:fixed;left:50%;bottom:20px;transform:translateX(-50%);width:max-content;max-width:1100px;background:rgba(15,23,42,.9);color:#fff;font:600 19px/1.4 system-ui,sans-serif;padding:10px 20px;border-radius:10px;z-index:2147483647;pointer-events:none;text-align:center'; d.textContent = $text; }" >/dev/null
}

mark() { # $1 = clip index: its sentence starts now
  NARRATE_START[$1]=$(_now)
  perl -e "printf \"%d %d\n\", $1, (${NARRATE_START[$1]} - $NARRATE_T0) * 1000" >>"$NARRATE_DIR/offsets.txt"
}

wait_clip() { # $1 = clip index: block until its sentence has been said, plus a breath
  local end
  end=$(perl -e "print ${NARRATE_START[$1]} + $(_duration "$NARRATE_DIR/s$1.wav") + 0.6")
  perl -MTime::HiRes=time,sleep -e "my \$r = $end - time; sleep(\$r) if \$r > 0"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  cmd=$1
  shift
  case "$cmd" in
  clips | mix) "$cmd" "$@" ;;
  *) sed -n '2,8p' "$0" >&2; exit 2 ;;
  esac
else
  NARRATE_DIR=${1:?usage: . narrate.sh <dir>}
  declare -a NARRATE_START
fi
