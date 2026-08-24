#!/usr/bin/env bash
input=$(cat)

cwd=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
project_dir=$(echo "$input" | jq -r '.workspace.project_dir // empty')
model=$(echo "$input" | jq -r '.model.display_name // empty')
repo_name=$(echo "$input" | jq -r '.workspace.repo.name // empty')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
cost=$(echo "$input" | jq -r '.cost.total_cost_usd // empty')
added=$(echo "$input" | jq -r '.cost.total_lines_added // 0')
removed=$(echo "$input" | jq -r '.cost.total_lines_removed // 0')

[ -z "$repo_name" ] && repo_name=$(basename "${project_dir:-$cwd}")

# Git branch (skip optional locks, cheap on large repos)
branch=""
if git -C "$cwd" rev-parse --git-dir &>/dev/null; then
  branch=$(GIT_OPTIONAL_LOCKS=0 git -C "$cwd" symbolic-ref --short HEAD 2>/dev/null \
           || GIT_OPTIONAL_LOCKS=0 git -C "$cwd" rev-parse --short HEAD 2>/dev/null)
fi

# 24-bit color helpers
rgb() { printf '\033[38;2;%d;%d;%dm' "$1" "$2" "$3"; }
reset=$'\033[0m'
sep=$'\033[2;90m | \033[0m'
bold_yellow=$'\033[1;33m'
bold_cyan=$'\033[1;36m'
magenta=$'\033[35m'
yellow=$'\033[33m'
green=$'\033[32m'
red=$'\033[31m'
dark_gray="$(rgb 60 60 60)"

# green(0,200,80) -> yellow(220,200,0) -> red(220,40,20), pct in 0..100
gradient() {
  awk -v p="$1" 'BEGIN{
    if(p<=50){t=p/50; r=220*t; g=200; b=80-80*t}
    else{t=(p-50)/50; r=220; g=200-160*t; b=20*t}
    printf "%d %d %d", r, g, b
  }'
}

out="${bold_yellow}${repo_name}${reset}"
[ -n "$branch" ] && out="${out}${sep}${bold_cyan}🌿 (${branch})${reset}"

if [ -n "$used_pct" ]; then
  fill=$(awk -v p="$used_pct" 'BEGIN{printf "%d", p/100*20 + 0.5}')
  bar=""
  for i in $(seq 1 20); do
    if [ "$i" -le "$fill" ]; then
      pos=$(awk -v i="$i" 'BEGIN{printf "%f", (i-1)*100/19}')
      read -r r g b <<< "$(gradient "$pos")"
      bar="${bar}$(rgb "$r" "$g" "$b")█${reset}"
    else
      bar="${bar}${dark_gray}█${reset}"
    fi
  done

  intpct=${used_pct%.*}
  if   [ "$intpct" -ge 90 ]; then emoji="🚨"
  elif [ "$intpct" -ge 70 ]; then emoji="🔥"
  elif [ "$intpct" -ge 20 ]; then emoji="⚡"
  else                            emoji="🟢"
  fi
  read -r pr pg pb <<< "$(gradient "$used_pct")"
  pct_col="$(rgb "$pr" "$pg" "$pb")"
  out="${out}${sep}${bar} ${emoji} ${pct_col}${intpct}%${reset}"
fi

[ -n "$cost" ] && out="${out}${sep}${yellow}\$$(printf '%.2f' "$cost")${reset}"

if [ "$added" != "0" ] || [ "$removed" != "0" ]; then
  out="${out}${sep}${green}+${added}${reset} ${red}-${removed}${reset}"
fi

[ -n "$model" ] && out="${out}${sep}🤖 ${magenta}${model}${reset}"

printf "%s" "$out"
