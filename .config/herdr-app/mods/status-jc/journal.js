// What the watch did in one round, as journal lines. Pure: watcher.js and merger.js write them (journal-file.js).

export const JOURNAL_FILE = "Library/Logs/herdr-watch.log"; // under home()

// The label once: a why that starts with it ("en pause ; CI verte") stands alone.
const said = (e) => (!e.why ? e.label : e.why.startsWith(e.label) ? e.why : `${e.label} : ${e.why}`);

// before: the registry the round started from (journalOn: `on` as the previous round saw it), after: { on, prs }.
// toasts: PR key → toast title of this round. At most one line per PR; PR lines only while the watch is on.
// A PR flapping between two labels on the same commit (A, B, A, B…) writes A and B once: a label line equal to one of
// the last two is skipped when both were written on this head and neither is an agent launch, an urgent line or a
// pause (a pause lifted puts the PR back where it was, and the journal must say so). A new push, a
// launch or a line asking me to act always writes. The written lines go to the entry's `logged` (the last two,
// with the head they were written on), kept by the registry.
export function roundLines(before, after, toasts) {
  const out = [];
  if (before.journalOn !== undefined && before.journalOn !== after.on) {
    out.push({ key: null, text: after.on ? "surveillance activée" : "surveillance coupée" });
  }
  if (!after.on) return out;
  for (const [key, e] of Object.entries(after.prs)) {
    const was = before.prs?.[key];
    const l = e.launched, wl = was?.launched, logged = (was?.logged ?? []).filter((x) => typeof x === "object");
    let text = null, launch = false;
    if (l && (l.step !== wl?.step || l.head !== wl?.head)) { text = `agent ${l.step} lancé`; launch = true; }
    else if (!was || was.label !== e.label) {
      const paused = (text) => text.startsWith("en pause");
      const flap = logged.length === 2 && !paused(said(e)) && logged.some((x) => x.text === said(e))
        && logged.every((x) => x.head === e.head && !x.launch && !urgent(x.text) && !paused(x.text));
      text = flap && !urgent(said(e)) ? null : said(e);
    }
    else if (toasts.has(key)) text = toasts.get(key);
    if (text !== null) { out.push({ key, text }); e.logged = [...logged, { text, head: e.head ?? null, launch }].slice(-2); }
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
