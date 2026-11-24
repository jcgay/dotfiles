// Claude's usage limits, as ~/.claude/statusline-command.sh last wrote them
// (`rate_limits` of the status line input: https://code.claude.com/docs/en/statusline).
// Pure: no Herdr import.

// The windows still current: one past its reset is stale until a session's next
// response rewrites the file, so it is dropped rather than shown wrong.
export function usageWindows(limits, now) {
  const win = (w, name) => typeof w?.used_percentage === "number" && !(w.resets_at && w.resets_at * 1000 <= now)
    ? { name, pct: Math.round(w.used_percentage), reset: w.resets_at ?? null }
    : null;
  return [win(limits?.five_hour, "5h"), win(limits?.seven_day, "7j")].filter(Boolean);
}

// "HH:MM" today, "JJ/MM HH:MM" another day.
export function resetLabel(epochS, now) {
  const d = new Date(epochS * 1000), p = (n) => String(n).padStart(2, "0");
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return d.toDateString() === new Date(now).toDateString() ? hm : `${p(d.getDate())}/${p(d.getMonth() + 1)} ${hm}`;
}
