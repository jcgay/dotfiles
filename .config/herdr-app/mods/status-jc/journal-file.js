// Appends journal lines to ~/Library/Logs/herdr-watch.log. A failed write is logged, never thrown: the round goes on.
import { exec, home } from "herdr";
import { JOURNAL_FILE, formatLine } from "./journal.js";

export async function appendJournal(entries) {
  if (entries.length === 0) return;
  const now = new Date();
  const lines = entries.map((e) => formatLine(now, e.key, e.text));
  try {
    // Lines go as arguments, never inside the script: a why or an error message cannot run anything.
    const r = await exec("sh", ["-c", 'f=$1; shift; printf "%s\\n" "$@" >> "$f"', "sh", `${home()}/${JOURNAL_FILE}`, ...lines], { timeout: 10000 });
    if (r.code !== 0) console.log("journal:", r.stderr);
  } catch (e) {
    console.log("journal:", e?.message ?? e);
  }
}
