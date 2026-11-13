#!/usr/bin/env bash
# Self-check of anchorable-lines.awk: run it, it prints PASS or the diff.
set -euo pipefail
here=$(cd "$(dirname "$0")" && pwd)
diff_input=$(cat <<'DIFF'
diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,3 +10,4 @@ function f() {
 keep
-old
+new1
+new2
@@ -40,1 +41,1 @@
-x
\ No newline at end of file
+y
diff --git a/gone.txt b/gone.txt
deleted file mode 100644
--- a/gone.txt
+++ /dev/null
@@ -1,2 +0,0 @@
-l1
-l2
diff --git a/b c.md b/b c.md
new file mode 100644
--- /dev/null
+++ b/b c.md	
@@ -0,0 +1 @@
+hello
DIFF
)
expected=$(printf '%s\n' \
  $'src/a.ts\tRIGHT\t10' $'src/a.ts\tLEFT\t11' $'src/a.ts\tRIGHT\t11' $'src/a.ts\tRIGHT\t12' \
  $'src/a.ts\tLEFT\t40' $'src/a.ts\tRIGHT\t41' \
  $'gone.txt\tLEFT\t1' $'gone.txt\tLEFT\t2' \
  $'b c.md\tRIGHT\t1')
actual=$(printf '%s\n' "$diff_input" | awk -f "$here/anchorable-lines.awk")
if [ "$actual" = "$expected" ]; then echo PASS; else diff <(echo "$expected") <(echo "$actual"); exit 1; fi
