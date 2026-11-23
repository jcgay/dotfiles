// What the watch did in one round, as journal lines. Pure: watcher.js and merger.js write them (journal-file.js).

import { readHint } from "./watch.js";

export const JOURNAL_FILE = "Library/Logs/herdr-watch.log"; // under home()

// The search for my PRs failed (network down, gh logged out: every PR is unread, the round stops before decide).
// fails: rounds in a row it failed, this one included. Written once, on the second, while the watch is on.
export function searchLine(fails, on, message) {
  return on && fails === 2 ? { key: null, text: `erreur : recherche des PR sur GitHub impossible : ${readHint(message)}` } : null;
}

// The label once: a why that starts with it ("en pause ; CI verte") stands alone.
const said = (e) => (!e.why ? e.label : e.why.startsWith(e.label) ? e.why : `${e.label} : ${e.why}`);

// before: the registry the round started from (journalOn: `on` as the previous round saw it), after: { on, prs }.
// toasts: PR key → toast title of this round. At most one line per PR; PR lines only while the watch is on.
// A PR flapping between two labels on the same commit (A, B, A, B…) writes A and B once: a label line equal to one of
// the last two is skipped when both were written on this head and neither is an agent launch, an urgent line or a
// pause (a pause lifted puts the PR back where it was, and the journal must say so). A new push, a
// launch or a line asking me to act always writes. The written lines go to the entry's `logged` (the last two,
// with the head they were written on), kept by the registry.
// GitHub errors: a PR's error line waits for its second round in a row (errorRounds, set by decide), so a blip writes
// nothing. When every watched PR fails (2 or more), it is GitHub, not the PRs: one line for all, on the second round.
// The return to the state written before the error is not written again. Other errors (squash refused, a crash of the
// watch on a PR) have no errorRounds and are written at once, as any label change.
const ERROR = "erreur";
export function roundLines(before, after, toasts) {
  const out = [];
  const all = Object.values(after.prs ?? {});
  const unread = (e) => e.label === ERROR && e.errorRounds > 0;
  const outage = after.on && all.length >= 2 && all.every(unread);
  // Once per outage: PRs that start failing on different rounds must not write it again.
  const prev = Object.values(before.prs ?? {});
  const told = prev.length >= 2 && prev.every(unread) && prev.some((e) => e.errorRounds >= 2);
  if (outage && !told && all.some((e) => e.errorRounds >= 2)) {
    out.push({ key: null, text: `${ERROR} : GitHub injoignable depuis 2 tours, ${all.length} PR non lues` });
  }
  if (before.journalOn !== undefined && before.journalOn !== after.on) {
    out.push({ key: null, text: after.on ? "surveillance activée" : "surveillance coupée" });
  }
  if (!after.on) return out;
  for (const [key, e] of Object.entries(after.prs)) {
    const was = before.prs?.[key];
    const l = e.launched, wl = was?.launched, logged = (was?.logged ?? []).filter((x) => typeof x === "object");
    let text = null, launch = false;
    // From its second round, once: also a PR still failing after an outage it was part of ends.
    if (unread(e)) text = !outage && e.errorRounds >= 2 && logged.at(-1)?.text !== said(e) ? said(e) : null;
    else if (l && (l.step !== wl?.step || l.head !== wl?.head)) { text = `agent ${l.step} lancé`; launch = true; }
    else if (was?.label === ERROR && logged.at(-1)?.text === said(e)) text = null;
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
