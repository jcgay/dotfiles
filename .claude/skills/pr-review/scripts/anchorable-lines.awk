# Reads a unified diff (gh pr diff / git diff) on stdin. Prints, tab-separated,
# "path side line" for every line GitHub accepts an inline review comment on:
# RIGHT = new file line (added or context), LEFT = old file line (removed).
/^diff --git / { path = ""; inhunk = 0; next }
/^--- / && !inhunk { old = substr($0, 5); sub(/^a\//, "", old); next }
/^\+\+\+ / && !inhunk {
  path = substr($0, 5); sub(/^b\//, "", path)
  if (path == "/dev/null") path = old
  next
}
/^@@ / {
  split($2, o, ","); split($3, n, ",")
  oldline = substr(o[1], 2) + 0; newline = substr(n[1], 2) + 0
  inhunk = 1; next
}
!inhunk || path == "" { next }
/^\\/ { next }
/^ / { print path "\tRIGHT\t" newline; oldline++; newline++; next }
/^-/ { print path "\tLEFT\t" oldline; oldline++; next }
/^\+/ { print path "\tRIGHT\t" newline; newline++; next }
{ inhunk = 0 }
