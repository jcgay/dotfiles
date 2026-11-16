#!/usr/bin/env bash
# Publish the merged findings of pr-review as one GitHub review.
#   publish-review.sh <owner>/<repo> <PR number> <head sha> <dir>
#                     [--off-diff <heading>] [--unconfirmed <heading>] [--dry-run]
# <dir> holds pr.diff (gh pr diff), findings.json (SKILL.md section 4) and
# body.md (the head of the review body). The script:
#   - marks each finding in findings.json: anchored (its line takes an inline
#     comment), posted (a signed comment with its title is already on that
#     line, or a signed review already lists it) and where (inline | body | skip);
#   - writes <dir>/review.json: one inline comment per confirmed, anchored, not
#     yet posted finding; the others not yet posted are listed in the body,
#     under the two headings, after a <!-- pr-review --> line (the Herdr PR
#     watch reads it to know the review is done). It signs the body and every
#     comment itself;
#   - posts it (not with --dry-run, nor when every finding is already posted
#     and a signed review carries the marker: an older one without it gets a
#     new review, or the watch never sees pr-review done) and stores each comment_id in findings.json.
# One unanchorable inline comment makes GitHub reject the whole review (422),
# hence the check against the diff. Needs gh, jq, awk.
set -euo pipefail
sig='🤖 Jean-Claude'
here=$(cd "$(dirname "$0")" && pwd)
die() { echo "publish-review: $*" >&2; exit 1; }
usage() {
  echo "usage: publish-review.sh <owner>/<repo> <PR number> <head sha> <dir> [--off-diff <heading>] [--unconfirmed <heading>] [--dry-run]" >&2
  exit 2
}

dry=0 off='Hors diff' unconfirmed='À vérifier' pos=()
while [ $# -gt 0 ]; do
  case $1 in
    --dry-run) dry=1 ;;
    --off-diff) [ $# -ge 2 ] || usage; off=$2; shift ;;
    --unconfirmed) [ $# -ge 2 ] || usage; unconfirmed=$2; shift ;;
    -*) usage ;;
    *) pos+=("$1") ;;
  esac
  shift
done
[ ${#pos[@]} -eq 4 ] || usage
repo=${pos[0]} pr=${pos[1]} sha=${pos[2]} dir=${pos[3]}
[[ $repo == ?*/?* ]] || die "not an <owner>/<repo>: '$repo'"
[[ $pr =~ ^[0-9]+$ ]] || die "not a PR number: '$pr'"
[[ $sha =~ ^[0-9a-f]{40}$ ]] || die "not a full commit sha: '$sha'"
for f in pr.diff findings.json body.md; do [ -f "$dir/$f" ] || die "missing $dir/$f"; done
jq -e 'type == "array"' "$dir/findings.json" >/dev/null || die "findings.json must be a JSON array"

awk -f "$here/anchorable-lines.awk" "$dir/pr.diff" > "$dir/anchorable.tsv"
# A comment's first line is "**[severity]** title"; the title tells two
# findings on one line apart.
title='def title: split("\n")[0] | sub("^\\*\\*\\[[^\\]]*\\]\\*\\* "; "");'
# An outdated comment keeps its line in original_line.
gh api "repos/$repo/pulls/$pr/comments" --paginate | jq -r --arg sig "$sig" "$title"'
  .[] | select(.in_reply_to_id == null and (.body | rtrimstr("\n") | endswith($sig)))
  | "\(.path)\t\(.side)\t\(.line // .original_line)\t\(.body | title)"' > "$dir/posted.tsv"
gh api "repos/$repo/pulls/$pr/reviews" --paginate | jq -r --arg sig "$sig" \
  '.[] | .body // "" | select(rtrimstr("\n") | endswith($sig))' > "$dir/reviews.txt"

jq --rawfile anchorable "$dir/anchorable.tsv" --rawfile posted "$dir/posted.tsv" --rawfile reviews "$dir/reviews.txt" '
  def keys: split("\n") | map(select(length > 0) | {key: ., value: true}) | from_entries;
  ($anchorable | keys) as $a | ($posted | keys) as $p
  | map((if .path == null or .line == null then null else "\(.path)\t\(.side // "RIGHT")\t\(.line)" end) as $k
      | "- **[\(.severity)]** \(.title)" as $item | "\($k)\t\(.title)" as $kt
      | .anchored = ($k != null and ($a | has($k)))
      | .posted = (($k != null and ($p | has($kt))) or ($reviews | contains($item)))
      | .where = (if .posted then "skip" elif .anchored and .confirmed != false then "inline" else "body" end))
' "$dir/findings.json" > "$dir/findings.json.tmp"
mv "$dir/findings.json.tmp" "$dir/findings.json"

jq --arg sig "$sig" --arg sha "$sha" --arg off "$off" --arg unconfirmed "$unconfirmed" --rawfile head "$dir/body.md" '
  def unsigned: sub("\\s+$"; "") | if endswith($sig) then .[:-($sig | length)] | sub("\\s+$"; "") else . end;
  def item: "- **[\(.severity)]** \(.title)"
    + (if .path then " — `\(.path)" + (if .line then ":\(.line)" else "" end) + "`" else "" end)
    + "\n  " + (.body | unsigned | gsub("\n"; "\n  "));
  def section($title; $list): if ($list | length) > 0 then "\n\n### \($title)\n\n" + ($list | map(item) | join("\n")) else "" end;
  {commit_id: $sha, event: "COMMENT",
   body: ("<!-- pr-review -->\n" + ($head | unsigned)
     + section($off; map(select(.where == "body" and .confirmed != false)))
     + section($unconfirmed; map(select(.where == "body" and .confirmed == false)))
     + "\n\n" + $sig),
   comments: map(select(.where == "inline")
     | {path, line, side: (.side // "RIGHT"), body: ("**[\(.severity)]** \(.title)\n\n" + (.body | unsigned) + "\n\n" + $sig)})}
' "$dir/findings.json" > "$dir/review.json"

if [ "$dry" = 1 ]; then
  echo "dry run: $dir/review.json not posted"
elif grep -qx '<!-- pr-review -->' "$dir/reviews.txt" && jq -e 'all(.where == "skip")' "$dir/findings.json" >/dev/null; then
  echo "nothing new since the last signed review: not posted"
else
  posted=$(gh api "repos/$repo/pulls/$pr/reviews" --method POST --input "$dir/review.json" --jq '"\(.id) \(.html_url)"')
  id=${posted%% *}
  echo "review ${posted#* }"
  # The review's own comments endpoint returns line: null, so read the PR comments.
  gh api "repos/$repo/pulls/$pr/comments" --paginate | jq -r --argjson id "$id" "$title"'
    .[] | select(.pull_request_review_id == $id) | "\(.id)\t\(.path)\t\(.side)\t\(.line)\t\(.body | title)"' > "$dir/comment-ids.tsv"
  jq --rawfile ids "$dir/comment-ids.tsv" '
    ($ids | split("\n") | map(select(length > 0) | split("\t") | {key: (.[1:] | join("\t")), value: (.[0] | tonumber)}) | from_entries) as $c
    | map(if .where == "inline" then .comment_id = $c["\(.path)\t\(.side // "RIGHT")\t\(.line)\t\(.title)"] else . end)
  ' "$dir/findings.json" > "$dir/findings.json.tmp"
  mv "$dir/findings.json.tmp" "$dir/findings.json"
fi

jq -r '
  "inline \(map(select(.where == "inline")) | length) · body \(map(select(.where == "body")) | length) · already posted \(map(select(.where == "skip")) | length)",
  (.[] | "\(.id)\t\(.where)\t\(.comment_id // "-")\t\(.title)")
' "$dir/findings.json"
