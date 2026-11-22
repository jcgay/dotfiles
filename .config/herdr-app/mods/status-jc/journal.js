// What the watch did in one round, as journal lines. Pure: watcher.js and merger.js write them (journal-file.js).

export const JOURNAL_FILE = "Library/Logs/herdr-watch.log"; // under home()

const said = (e) => (e.why ? `${e.label} : ${e.why}` : e.label);

// before: the registry the round started from (journalOn: `on` as the previous round saw it), after: { on, prs }.
// toasts: PR key → toast title of this round. At most one line per PR; PR lines only while the watch is on.
export function roundLines(before, after, toasts) {
  const out = [];
  if (before.journalOn !== undefined && before.journalOn !== after.on) {
    out.push({ key: null, text: after.on ? "surveillance activée" : "surveillance coupée" });
  }
  if (!after.on) return out;
  for (const [key, e] of Object.entries(after.prs)) {
    const was = before.prs?.[key];
    const l = e.launched, wl = was?.launched;
    if (l && (l.step !== wl?.step || l.head !== wl?.head)) out.push({ key, text: `agent ${l.step} lancé` });
    else if (!was || was.label !== e.label) out.push({ key, text: said(e) });
    else if (toasts.has(key)) out.push({ key, text: toasts.get(key) });
  }
  for (const key of Object.keys(before.prs ?? {})) {
    if (!(key in after.prs)) out.push({ key, text: "sortie de la surveillance" });
  }
  return out;
}

const two = (n) => String(n).padStart(2, "0");

export function formatLine(date, key, text) {
  const day = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
  return `${day} ${two(date.getHours())}:${two(date.getMinutes())}  ${key ?? "-"}  ${text.replace(/\s*[\r\n]+\s*/g, " ")}`;
}

// A line that asks me to act: the watch gave up (« à toi »), GitHub could not be read, or a merge was refused.
export const urgent = (text) => /^(à toi|erreur|merge refusé)(?![\p{L}\p{N}])/u.test(text ?? "");

// The urgent line numbers (1-based) after appending entries that brought the file to `total` lines,
// added to the previous ones, the newest `keep` only: the Journal button counts those past the read marker.
export function urgentLines(previous, entries, total, keep = 200) {
  const first = total - entries.length + 1;
  const added = entries.flatMap((e, i) => (urgent(e.text) ? [first + i] : []));
  return [...(previous ?? []).filter((n) => n < first), ...added].slice(-keep);
}
