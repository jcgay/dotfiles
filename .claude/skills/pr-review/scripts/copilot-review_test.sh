#!/usr/bin/env bash
# Self-check of copilot-review.sh with a fake gh: run it, it prints PASS or
# what differs. Needs jq.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export GH_LOG=$T/log GH_REVIEWS=$T/reviews.json GH_LATE=$T/late.json GH_COMMENTS=$T/comments.json GH_REQUESTED=$T/requested.json COPILOT_POLL=0
cat > "$T/gh" <<'GH'
#!/usr/bin/env bash
# Logs its arguments; answers with canned JSON (--jq applied). The reviews
# come from $GH_LATE from the third read on: Copilot answering late.
printf '%s\n' "$*" >> "$GH_LOG"
filter=; args=("$@")
for i in "${!args[@]}"; do [ "${args[$i]}" = --jq ] && filter=${args[$((i + 1))]}; done
case "$*" in
  'api repos/o/r/pulls/7/reviews '*) [ -n "${GH_FLAKY:-}" ] && [ "$(grep -c reviews "$GH_LOG")" = 1 ] && { echo "HTTP 502" >&2; exit 1; }; f=$GH_REVIEWS; [ -f "$GH_LATE" ] && [ "$(grep -c reviews "$GH_LOG")" -ge 3 ] && f=$GH_LATE; cat "$f" ;;
  'api repos/o/r/pulls/7/comments '*) cat "$GH_COMMENTS" ;;
  'api repos/o/r/pulls/7/requested_reviewers '*) jq -r "$filter" "$GH_REQUESTED" ;;
  'pr edit '*) [ -z "${GH_EDIT_FAIL:-}" ] || { echo "GraphQL: Copilot is not available" >&2; exit 1; } ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
GH
chmod +x "$T/gh"
PATH=$T:$PATH
fail=0
check() { [ "$2" = "$3" ] || { echo "FAIL $1"; diff <(echo "$3") <(echo "$2"); fail=1; }; }
head=0123456789abcdef0123456789abcdef01234567
old=fedcba9876543210fedcba9876543210fedcba98
bot='copilot-pull-request-reviewer[bot]'
reviews() { jq -n --arg bot "$bot" --arg a "$1" --arg b "$2" '[{id: 1, user: {login: "ana"}, commit_id: $a}, {id: 2, user: {login: $bot}, commit_id: $b}]'; }
run() { : > "$GH_LOG"; out=$("$here/copilot-review.sh" "$@" 2>&1); rc=$?; }

reviews "$head" "$old" > "$GH_REVIEWS"; echo '{"users": [], "teams": []}' > "$GH_REQUESTED"
run request o/r 7 "$head"
check 'request: asked' "$out" 'Copilot review requested on 01234567'
check 'request: gh pr edit' "$(grep -c '^pr edit 7 -R o/r --add-reviewer @copilot$' "$GH_LOG")" 1
GH_EDIT_FAIL=1 run request o/r 7 "$head"
check 'request refused: exit 4' "$rc" 4
check 'request refused: says why' "$out" 'copilot-review: Copilot review unavailable: GraphQL: Copilot is not available'

echo '{"users": [{"login": "Copilot"}], "teams": []}' > "$GH_REQUESTED"
run request o/r 7 "$head"
check 'request: already pending' "$out" 'Copilot review already requested'
check 'request: pending, no edit' "$(grep -c '^pr edit' "$GH_LOG")" 0

reviews "$old" "$head" > "$GH_REVIEWS"
run request o/r 7 "$head"
check 'request: head already reviewed' "$out" 'Copilot already reviewed 01234567'
check 'request: reviewed, no edit' "$(grep -c '^pr edit' "$GH_LOG")" 0

# Copilot's review (2) of the head; a reply, a comment of another review and
# a comment we already answered (14, signed reply 15) are left out.
cat > "$GH_COMMENTS" <<'JSON'
[{"id": 10, "pull_request_review_id": 2, "in_reply_to_id": null, "path": "a.ts", "line": 4, "side": "RIGHT", "body": "bug", "user": {}},
 {"id": 11, "pull_request_review_id": 2, "in_reply_to_id": 10, "path": "a.ts", "line": 4, "side": "RIGHT", "body": "reply"},
 {"id": 12, "pull_request_review_id": 1, "in_reply_to_id": null, "path": "b.ts", "line": 1, "side": "RIGHT", "body": "human"},
 {"id": 14, "pull_request_review_id": 2, "in_reply_to_id": null, "path": "c.ts", "line": 2, "side": "RIGHT", "body": "nit"},
 {"id": 15, "pull_request_review_id": 3, "in_reply_to_id": 14, "path": "c.ts", "line": 2, "side": "RIGHT", "body": "Non corrigé : x.\n\n🤖 Jean-Claude\n"}]
JSON
run wait o/r 7 "$head" 5
check 'wait: exit' "$rc" 0
check 'wait: comments' "$(jq -c . <<<"$out")" '[{"id":10,"path":"a.ts","line":4,"side":"RIGHT","body":"bug"}]'

# Not there at first, then it comes.
reviews "$head" "$old" > "$GH_REVIEWS"; reviews "$old" "$head" > "$GH_LATE"
run wait o/r 7 "$head" 60
check 'wait late: exit' "$rc" 0
check 'wait late: read until it came' "$(grep -c reviews "$GH_LOG")" 3
rm "$GH_LATE"

reviews "$old" "$head" > "$GH_REVIEWS"
GH_FLAKY=1 run wait o/r 7 "$head" 60
check 'flaky read: still waits' "$rc" 0
check 'flaky read: read again' "$(grep -c reviews "$GH_LOG")" 2
reviews "$head" "$old" > "$GH_REVIEWS"

run wait o/r 7 "$head" 0
check 'timeout: exit 3' "$rc" 3
check 'timeout: says so' "$out" 'copilot-review: no Copilot review of 01234567 after 0s'

run wait o/r 7 abc 5
check 'short sha refused' "$rc" 1
check 'short sha: no gh call' "$(wc -c < "$GH_LOG" | tr -d ' ')" 0
run nope o/r 7 "$head"
check 'unknown command' "$rc" 2
[ "$fail" = 0 ] && echo PASS
exit "$fail"
