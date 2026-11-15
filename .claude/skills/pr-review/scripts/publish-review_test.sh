#!/usr/bin/env bash
# Self-check of publish-review.sh with a fake gh: run it, it prints PASS or
# what differs. Needs jq.
set -uo pipefail
here=$(cd "$(dirname "$0")" && pwd)
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export GH_LOG=$T/log GH_COMMENTS=$T/comments.json GH_REVIEWS=$T/reviews.json GH_AFTER=$T/after.json
cat > "$T/gh" <<'GH'
#!/usr/bin/env bash
# Logs its arguments; answers by running the call's --jq on canned JSON.
printf '%s\n' "$*" >> "$GH_LOG"
filter=; args=("$@")
for i in "${!args[@]}"; do [ "${args[$i]}" = --jq ] && filter=${args[$((i + 1))]}; done
case "$*" in
  'api repos/o/r/pulls/7/reviews --method POST '*) cp "$GH_AFTER" "$GH_COMMENTS"; jq -r "$filter" <<<'{"id": 900, "html_url": "https://x/review"}' ;;
  'api repos/o/r/pulls/7/reviews '*) jq -r "${filter:-.}" "$GH_REVIEWS" ;;
  'api repos/o/r/pulls/7/comments '*) jq -r "${filter:-.}" "$GH_COMMENTS" ;;
  *) echo "unexpected gh call: $*" >&2; exit 1 ;;
esac
GH
chmod +x "$T/gh"
PATH=$T:$PATH
fail=0
check() { [ "$2" = "$3" ] || { echo "FAIL $1"; diff <(echo "$3") <(echo "$2"); fail=1; }; }

cat > "$T/pr.diff" <<'DIFF'
diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,3 +10,4 @@ function f() {
 keep
-old
+new1
+new2
DIFF
# 1 inline; 2 on a line outside the diff; 3 unconfirmed; 4 already posted;
# 5 no path (conformity); 6 on a removed line, its body already signed;
# 7 on the line of 4 with another title; 8 on the line of 1.
findings() { cat > "$T/findings.json" <<'JSON'
[{"id": 1, "severity": "bloquant", "confirmed": true, "path": "src/a.ts", "line": 11, "side": "RIGHT", "title": "T1", "body": "B1\nsecond line"},
 {"id": 2, "severity": "important", "confirmed": true, "path": "src/a.ts", "line": 99, "side": "RIGHT", "title": "T2", "body": "B2"},
 {"id": 3, "severity": "mineur", "confirmed": false, "path": "src/a.ts", "line": 12, "side": "RIGHT", "title": "T3", "body": "B3"},
 {"id": 4, "severity": "mineur", "confirmed": true, "path": "src/a.ts", "line": 10, "side": "RIGHT", "title": "T4", "body": "B4"},
 {"id": 5, "severity": "important", "confirmed": true, "path": null, "line": null, "title": "T5", "body": "B5\nmore"},
 {"id": 6, "severity": "mineur", "confirmed": true, "path": "src/a.ts", "line": 11, "side": "LEFT", "title": "T6", "body": "B6\n\n🤖 Jean-Claude\n"},
 {"id": 7, "severity": "mineur", "confirmed": true, "path": "src/a.ts", "line": 10, "side": "RIGHT", "title": "T7", "body": "B7"},
 {"id": 8, "severity": "important", "confirmed": true, "path": "src/a.ts", "line": 11, "side": "RIGHT", "title": "T8", "body": "B8"}]
JSON
}
# Signed outdated comment on line 10 with the title T4: finding 4 is already
# posted, not 7. A reply and an unsigned comment do not count. The POST adds
# the comments of the new review (900), two of them on one line.
cat > "$T/before.json" <<'JSON'
[{"id": 50, "in_reply_to_id": null, "pull_request_review_id": 1, "path": "src/a.ts", "side": "RIGHT", "line": null, "original_line": 10, "body": "**[mineur]** T4\n\nold\n\n🤖 Jean-Claude\n"},
 {"id": 51, "in_reply_to_id": 50, "pull_request_review_id": 1, "path": "src/a.ts", "side": "RIGHT", "line": 11, "body": "reply\n\n🤖 Jean-Claude"},
 {"id": 52, "in_reply_to_id": null, "pull_request_review_id": 2, "path": "src/a.ts", "side": "RIGHT", "line": 12, "body": "a human"}]
JSON
jq '. + [
  {"id": 61, "in_reply_to_id": null, "pull_request_review_id": 900, "path": "src/a.ts", "side": "RIGHT", "line": 11, "body": "**[bloquant]** T1\n\nB1\n\n🤖 Jean-Claude"},
  {"id": 62, "in_reply_to_id": null, "pull_request_review_id": 900, "path": "src/a.ts", "side": "LEFT", "line": 11, "body": "**[mineur]** T6\n\nB6\n\n🤖 Jean-Claude"},
  {"id": 63, "in_reply_to_id": null, "pull_request_review_id": 900, "path": "src/a.ts", "side": "RIGHT", "line": 10, "body": "**[mineur]** T7\n\nB7\n\n🤖 Jean-Claude"},
  {"id": 64, "in_reply_to_id": null, "pull_request_review_id": 900, "path": "src/a.ts", "side": "RIGHT", "line": 11, "body": "**[important]** T8\n\nB8\n\n🤖 Jean-Claude"}]' "$T/before.json" > "$GH_AFTER"
cp "$T/before.json" "$GH_COMMENTS"; echo '[]' > "$GH_REVIEWS"
sha=0123456789abcdef0123456789abcdef01234567
printf 'Summary.\n\n🤖 Jean-Claude\n' > "$T/body.md"

findings; : > "$GH_LOG"
out=$("$here/publish-review.sh" o/r 7 "$sha" "$T" --dry-run 2>&1) || { echo "FAIL dry run: $out"; fail=1; }
check 'dry run posts nothing' "$(grep -c 'method POST' "$GH_LOG")" 0
check 'where' "$(jq -c 'map(.where)' "$T/findings.json")" '["inline","body","body","skip","body","inline","inline","inline"]'
check 'inline comments' "$(jq -c '.comments | map([.path, .line, .side])' "$T/review.json")" \
  '[["src/a.ts",11,"RIGHT"],["src/a.ts",11,"LEFT"],["src/a.ts",10,"RIGHT"],["src/a.ts",11,"RIGHT"]]'
check 'comment body, signed once' "$(jq -r '.comments[1].body' "$T/review.json")" $'**[mineur]** T6\n\nB6\n\n🤖 Jean-Claude'
check 'event and commit' "$(jq -c '[.event, .commit_id]' "$T/review.json")" "[\"COMMENT\",\"$sha\"]"
check 'review body' "$(jq -r .body "$T/review.json")" 'Summary.

### Hors diff

- **[important]** T2 — `src/a.ts:99`
  B2
- **[important]** T5
  B5
  more

### À vérifier

- **[mineur]** T3 — `src/a.ts:12`
  B3

🤖 Jean-Claude'

findings; : > "$GH_LOG"
out=$("$here/publish-review.sh" o/r 7 "$sha" "$T" --off-diff 'Outside the diff' --unconfirmed 'To check' 2>&1) || { echo "FAIL post: $out"; fail=1; }
check 'posted once' "$(grep -c "method POST --input $T/review.json" "$GH_LOG")" 1
check 'headings' "$(jq -r .body "$T/review.json" | grep '^###')" $'### Outside the diff\n### To check'
check 'comment ids' "$(jq -c 'map(.comment_id)' "$T/findings.json")" '[61,null,null,null,null,62,63,64]'
check 'report' "$(sed -n 1,2p <<<"$out")" $'review https://x/review\ninline 4 · body 3 · already posted 1'

# Rerun after that review: everything is already posted, nothing is.
jq '[{body: .body}]' "$T/review.json" > "$GH_REVIEWS"
findings; : > "$GH_LOG"
out=$("$here/publish-review.sh" o/r 7 "$sha" "$T" 2>&1) || { echo "FAIL rerun: $out"; fail=1; }
check 'rerun: all skipped' "$(jq -c 'map(.where) | unique' "$T/findings.json")" '["skip"]'
check 'rerun: not posted' "$(grep -c 'method POST' "$GH_LOG")" 0
echo '[]' > "$GH_REVIEWS"; cp "$T/before.json" "$GH_COMMENTS"

echo '[]' > "$T/findings.json"
out=$("$here/publish-review.sh" o/r 7 "$sha" "$T" --dry-run 2>&1) || { echo "FAIL no finding: $out"; fail=1; }
check 'no finding: body only' "$(jq -c '[.body, .comments]' "$T/review.json")" '["Summary.\n\n🤖 Jean-Claude",[]]'

rm "$T/body.md"; : > "$GH_LOG"
out=$("$here/publish-review.sh" o/r 7 "$sha" "$T" 2>&1) && { echo "FAIL: ran without body.md"; fail=1; }
check 'missing body.md: no gh call' "$(wc -c < "$GH_LOG" | tr -d ' ')" 0
printf 'Summary.\n\n🤖 Jean-Claude\n' > "$T/body.md"
out=$("$here/publish-review.sh" o/r 7 abc1234 "$T" --dry-run 2>&1) && { echo "FAIL: short sha accepted"; fail=1; }
check 'short sha: no gh call' "$(wc -c < "$GH_LOG" | tr -d ' ')" 0
[ "$fail" = 0 ] && echo PASS
exit "$fail"
