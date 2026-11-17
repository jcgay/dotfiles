// Armed "rebase and merge" of a PR: pure decisions, fed with `gh pr view` JSON. No herdr import, loads in plain Node.
import { checks } from "./watch.js";

// shared() key, written by the PR panel (arm, disarm) and by status-jc (result): { "o/r#N": { head, at, why, error } }.
export const ARMED = "pr-merge";

const out = (action, why = null, toast = null) => ({ action, why, toast });

// What to do with one armed PR: drop (disarm), wait or merge. armed.head is the head I looked at when arming.
// ctx.jenkinsfile: the head has a Jenkinsfile, so Jenkins will report even if it has not yet (build queued).
// shortcut: only Jenkins is awaited before it posts; a GitHub Actions job not yet queued is not, add it if a repo needs it
export function mergeStep(key, view, armed, ctx = {}) {
  const n = key.split("#")[1];
  if (view.state !== "OPEN") return out("drop");
  if (view.headRefOid !== armed.head) return out("drop", null, `PR #${n} : nouveau commit, merge annulé`);
  if ((view.commits ?? []).some((c) => /^(fixup|amend|squash)! /.test(c.messageHeadline ?? ""))) {
    return out("drop", null, `PR #${n} : commit fixup!/amend!/squash!, merge annulé`);
  }
  const all = checks(view.statusCheckRollup);
  if (all.length === 0) return out("wait", "aucun check sur ce commit");
  if (ctx.jenkinsfile && !all.some((c) => c.name.startsWith("continuous-integration/jenkins/"))) {
    return out("wait", "Jenkins n'a pas encore rapporté sur ce commit");
  }
  if (all.some((c) => c.state === "running")) return out("wait", "CI en cours");
  // A red check keeps the PR armed: a rerun of a flaky build may turn it green.
  if (all.some((c) => c.state === "ko")) return out("wait", "un check en échec");
  return out("merge");
}

// The registry after a round. Only an entry still holding the arming the round read (same `at`) changes:
// a disarm or a new arming made by the panel during the round wins.
export function applyResults(current, results) {
  const next = { ...current };
  for (const { key, at, drop, why = null, error = null, refused } of results) {
    if (next[key]?.at !== at) continue;
    if (drop) delete next[key];
    else next[key] = { ...next[key], why, error, ...(refused && { refused: true }) };
  }
  return next;
}
