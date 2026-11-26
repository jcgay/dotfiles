#!/usr/bin/env bash
# The GitHub Copilot review of pr-review --copilot.
#   copilot-review.sh request <owner>/<repo> <PR number> <head sha>
#     asks Copilot to review the PR, unless it already reviewed <head sha> or
#     its request is still pending. Exits 4 when GitHub refuses the request
#     (Copilot code review not available on that repository).
#   copilot-review.sh wait <owner>/<repo> <PR number> <head sha> [<seconds>, default 300]
#     waits for Copilot's review of <head sha> and prints its inline comments
#     not answered yet (no reply signed by us) as a JSON array of
#     {id, path, line, side, body}; exits 3 when none came in time.
#     COPILOT_POLL sets the seconds between two reads (default 20).
# Needs gh and jq.
set -euo pipefail
bot='copilot-pull-request-reviewer[bot]'
die() { echo "copilot-review: $*" >&2; exit 1; }
usage() { echo "usage: copilot-review.sh request|wait <owner>/<repo> <PR number> <head sha> [<seconds>]" >&2; exit 2; }

[ $# -ge 4 ] && [ $# -le 5 ] || usage
cmd=$1 repo=$2 pr=$3 sha=$4 timeout=${5:-300}
[[ $cmd == request || $cmd == wait ]] || usage
[[ $repo == ?*/?* ]] || die "not an <owner>/<repo>: '$repo'"
[[ $pr =~ ^[0-9]+$ ]] || die "not a PR number: '$pr'"
[[ $sha =~ ^[0-9a-f]{40}$ ]] || die "not a full commit sha: '$sha'"
[[ $timeout =~ ^[0-9]+$ ]] || die "not a number of seconds: '$timeout'"

# Id of Copilot's last review of the head, empty when it has none.
review() {
  gh api "repos/$repo/pulls/$pr/reviews" --paginate | jq -rs --arg bot "$bot" --arg sha "$sha" \
    'add // [] | map(select(.user.login == $bot and .commit_id == $sha)) | last | .id // empty'
}

if [ "$cmd" = request ]; then
  if [ -n "$(review)" ]; then echo "Copilot already reviewed ${sha:0:8}"; exit 0; fi
  pending=$(gh api "repos/$repo/pulls/$pr/requested_reviewers" --jq '.users[].login')
  if grep -qiE '^copilot($|-pull-request-reviewer)' <<<"$pending"; then
    echo "Copilot review already requested"; exit 0
  fi
  err=$(gh pr edit "$pr" -R "$repo" --add-reviewer @copilot 2>&1 >/dev/null) \
    || { echo "copilot-review: Copilot review unavailable: $err" >&2; exit 4; }
  echo "Copilot review requested on ${sha:0:8}"
  exit 0
fi

end=$((SECONDS + timeout))
while :; do
  id=$(review) || id= # a failed read (502, rate limit) is no review yet
  [ -z "$id" ] || break
  [ "$SECONDS" -lt "$end" ] || { echo "copilot-review: no Copilot review of ${sha:0:8} after ${timeout}s" >&2; exit 3; }
  sleep "${COPILOT_POLL:-20}"
done
gh api "repos/$repo/pulls/$pr/comments" --paginate | jq -s --argjson id "$id" --arg sig '🤖 Jean-Claude' '
  add // [] | [.[] | select(.in_reply_to_id != null and (.body | rtrimstr("\n") | endswith($sig))) | .in_reply_to_id] as $answered
  | map(select(.pull_request_review_id == $id and .in_reply_to_id == null and (.id as $c | $answered | index($c) | not))
        | {id, path, line, side, body})'
