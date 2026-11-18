// Appends journal lines to ~/Library/Logs/herdr-watch.log. A failed write is logged, never thrown: the round goes on.
import { exec, home, setShared } from "herdr";
import { JOURNAL_FILE, formatLine } from "./journal.js";

const JOURNAL_LINES = "journal-lines"; // read by tabs-jc (badge) and journal (read marker)

// The watch round and the armed merge write one after the other: otherwise an older wc -l could be published last.
let queue = Promise.resolve();

export function appendJournal(entries) {
  if (entries.length === 0) return queue;
  queue = queue.then(() => write(entries));
  return queue;
}

async function write(entries) {
  const now = new Date();
  const lines = entries.map((e) => formatLine(now, e.key, e.text));
  try {
    // Lines go as arguments, never inside the script: a why or an error message cannot run anything.
    // wc -l after the write: the Journal button's badge counts unread lines without the panel running.
    const r = await exec("sh", ["-c", 'f=$1; shift; printf "%s\\n" "$@" >> "$f" && wc -l < "$f"', "sh", `${home()}/${JOURNAL_FILE}`, ...lines], { timeout: 10000 });
    if (r.code !== 0) console.log("journal:", r.stderr);
    else setShared(JOURNAL_LINES, Number(r.stdout.trim()));
  } catch (e) {
    console.log("journal:", e?.message ?? e);
  }
}
