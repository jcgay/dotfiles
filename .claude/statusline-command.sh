#!/usr/bin/env bash
input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
model=$(echo "$input" | jq -r '.model.display_name // empty')

# Shorten home to ~ then truncate to last 4 segments (mirrors starship truncation_length=4)
home="$HOME"
short_cwd="${cwd/#$home/~}"
IFS='/' read -ra parts <<< "$short_cwd"
if [ "${#parts[@]}" -gt 4 ]; then
  short_cwd="…/${parts[-4]}/${parts[-3]}/${parts[-2]}/${parts[-1]}"
fi

# Git info
branch=""
ahead=""
behind=""
if git -C "$cwd" rev-parse --git-dir &>/dev/null 2>&1; then
  branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null \
           || GIT_OPTIONAL_LOCKS=0 git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
  upstream=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" rev-parse --abbrev-ref '@{upstream}' 2>/dev/null)
  if [ -n "$upstream" ]; then
    ahead_count=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" rev-list --count "@{upstream}..HEAD" 2>/dev/null)
    behind_count=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" rev-list --count "HEAD..@{upstream}" 2>/dev/null)
    [ "${ahead_count:-0}" -gt 0 ] && ahead="⇡${ahead_count}"
    [ "${behind_count:-0}" -gt 0 ] && behind="⇣${behind_count}"
  fi
fi

# Language/tool context detection
ctx=""
[ -f "$cwd/pom.xml" ] || compgen -G "$cwd/src/main/java" &>/dev/null && ctx="$ctx ☕"
[ -f "$cwd/build.gradle" ] || [ -f "$cwd/build.gradle.kts" ] || [ -f "$cwd/gradlew" ] && ctx="$ctx 🐘"
[ -f "$cwd/go.mod" ] && ctx="$ctx 🐹"
[ -f "$cwd/package.json" ] && ctx="$ctx ⬡"
( [ -f "$cwd/docker-compose.yml" ] || [ -f "$cwd/docker-compose.yaml" ] || [ -f "$cwd/Dockerfile" ] ) && ctx="$ctx 🐳"

# Context window usage % (null early in session / right after /compact)
ctx_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')

# Assemble
gray=$'\033[90m'
reset=$'\033[0m'
out="$short_cwd"
[ -n "$branch" ] && out="$out  $branch"
[ -n "$ahead$behind" ] && out="$out $ahead$behind"
[ -n "$ctx" ] && out="$out$ctx"
[ -n "$model" ] && out="$out  ${gray}${model}${reset}"
if [ -n "$ctx_pct" ]; then
  ctx_pct=${ctx_pct%.*}
  if   [ "$ctx_pct" -ge 60 ]; then col=$'\033[31m'   # red
  elif [ "$ctx_pct" -ge 40 ]; then col=$'\033[33m'   # yellow
  else                             col="$gray"
  fi
  out="$out ${col}${ctx_pct}%${reset}"
fi

printf "%s" "$out"
