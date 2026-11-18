// Reading the watch journal (~/Library/Logs/herdr-watch.log, written by status-jc). Pure: no Herdr import.

export const PAGE = 20;
export const JOURNAL_FILE = "Library/Logs/herdr-watch.log"; // under home(); same as status-jc/journal.js

const LINE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2})  (\S+)  (.*)$/;
const PR = /^([^/\s]+\/[^#\s]+)#(\d+)$/;

// The lines of `tail`, newest first; malformed lines are skipped.
export function parseTail(text) {
  const out = [];
  for (const line of text.split("\n")) {
    const m = LINE.exec(line);
    if (!m) continue;
    const [, date, time, key, said] = m;
    const pr = PR.exec(key);
    out.push({
      date, time, key: pr ? key : null, repo: pr ? pr[1] : null, number: pr ? Number(pr[2]) : null, text: said,
      url: pr ? `https://github.com/${pr[1]}/pull/${pr[2]}` : null,
    });
  }
  return out.reverse();
}

// shortcut: no year for an older line, fine while the journal is read within the year.
export const when = (e, today) => (e.date === today ? e.time : `${e.date.slice(8)}/${e.date.slice(5, 7)} ${e.time}`);

// Lines past the read marker (shared "journal-read"). A file shorter than the marker was recreated: all unread.
export function unread(lines, read) {
  const total = lines ?? 0;
  return read === undefined || read === null || read > total ? total : total - read;
}
