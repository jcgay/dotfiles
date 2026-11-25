// Where a watched PR stands: its step band, step durations and time left. Pure, no herdr import:
// watcher.js writes the results in the registry, the PR panel draws them.
import { BUDGET, REVIEW, LABELS, checkoutsOf, noHuman, sonarFirst } from "./watch.js";

// The panel's labels, in the order decide() walks them.
export const STEPS = ["git", "jenk", "sonar", "rev", "qa", "demo", "risk", "appr", "merge"];
const REVIEWS = [["rev", "pr-review"], ["qa", "qa"], ["demo", "pr-demo"], ["risk", "pr-risk"]];

// One state per case: ok, run (an agent or the CI works), wait (a human must approve), ko (failing, the watch fixes it),
// me (the watch gave up), todo, skip (this repo never runs it). A draft gets git, jenk and sonar only: no review runs on it.
// ctx: { hasCi, hasQa, hasDemo, hasSonar }. A PR GitHub could not read keeps its last band.
export function bandOf(s, e, ctx) {
  if (s.error) return e.band ?? null;
  const step = e.launched?.step;
  const spent = (c) => (e.attempts?.[c] ?? 0) >= BUDGET;
  const ci = (c) => s[c]?.state ?? (e.seen?.[c] && !s.skipCi ? "running" : null);
  const fix = (c, state) => step === c ? "run" : state === "ko" ? (spent(c) ? "me" : "ko") : state === "running" ? "run" : state === "ok" ? "ok" : "todo";

  const git = step === "rebase" ? "run" : s.conflict ? (spent("rebase") ? "me" : "ko") : s.conflict === null ? "todo" : "ok";
  let jenk;
  if (!ctx.hasCi && !s.reported) jenk = "skip";
  else if (s.conflict) jenk = "todo"; // GitHub runs no CI on a PR in conflict
  // Jenkins spent but the sonar fix goes first (decide()): not mine yet.
  else if (ci("jenkins")) jenk = ci("jenkins") === "ko" && step !== "jenkins" && sonarFirst(s, e) ? "ko" : fix("jenkins", ci("jenkins"));
  else jenk = s.failing ? "ko" : s.pending ? "run" : s.reported ? "ok" : "todo";
  // decide(): a failing check that neither the Jenkins nor the Sonar fix covers is mine once nothing runs, drafts aside.
  // shortcut: Sonar's check-run is in the rollup too, so a failing Sonar alone is told apart only through s.sonar
  if (!s.draft && !s.conflict && s.failing && !s.pending && !["ko", "running"].includes(ci("jenkins"))
    && !["ko", "running"].includes(ci("sonar"))) jenk = "me";
  const sonar = !ctx.hasSonar ? "skip" : s.conflict || !ci("sonar") ? (step === "sonar" ? "run" : "todo") : fix("sonar", ci("sonar"));
  // A PR mine for a reason no case tells (unpushed work, a dirty -watch): its next case is.
  const mine = (cases) => {
    const i = e.label === LABELS.yours && !cases.includes("me") ? cases.findIndex((x) => x !== "ok" && x !== "skip") : -1;
    return i < 0 ? cases : cases.map((x, j) => (j === i ? "me" : x));
  };
  if (s.draft) return mine([git, jenk, sonar]);

  const never = { qa: !ctx.hasQa, demo: !ctx.hasDemo };
  const silent = e.silent?.[s.head] ?? [];
  const reviews = REVIEWS.map(([label, name]) => step === name ? "run" : s.markers.has(name) ? "ok"
    : never[label] || silent.includes(name) ? "skip" : "todo");
  const reviewed = reviews.every((r) => r === "ok" || r === "skip");
  // Approved fixups still have their squash to come before the merge.
  // A 0-human pr-risk verdict on the head's code stands for the approval.
  const appr = step === "squash" ? "run" : s.approved || noHuman(s) ? (s.fixups ? (spent("squash") ? "me" : "todo") : "ok") : reviewed ? "wait" : "todo";
  // merge: the panel paints it from shared("pr-merge"), read live.
  return mine([git, jenk, sonar, ...reviews, appr, "todo"]);
}

// What finished between two rounds: [[key, ms]], keys agent:<step> and ci:<check>, plus the CI trackers to keep.
// An agent counts from its launch to the round that sees it stop; a review only with its marker (silent: no sample).
// A check counts from the first round seeing it run to the first seeing it finish on the same head; Sonar's own
// timestamps (took) win. A new head drops the tracker: a pass cut by a push measures nothing.
export function measure(before, e, s, now) {
  const samples = [];
  const was = before?.launched;
  if (was?.at != null && (e.launched?.tab !== was.tab || e.launched?.head !== was.head)
    && (!REVIEW.includes(was.step) || s.markers?.has(was.step))) samples.push([`agent:${was.step}`, now - was.at]);
  const ci = {};
  for (const c of ["jenkins", "sonar"]) {
    // Without Jenkins, the CI case times the checks GitHub reports (Actions…) under the same key.
    const own = c === "jenkins" && !s.jenkins;
    const state = own ? (s.pending ? "running" : s.reported ? "ok" : undefined) : s[c]?.state;
    const took = own ? s.ciTook : s[c]?.took;
    const kept = before?.ci?.[c], here = kept && kept.head === s.head;
    if (state === "running") ci[c] = here && !kept.sampled ? kept : { head: s.head, since: now };
    else if (state !== "ok" && state !== "ko") ci[c] = null;
    else if (here && kept.sampled) ci[c] = kept; // this head's pass is already in the history
    // A pass seen running, or one that ran between two rounds with its own timestamps: sampled once per head.
    else if (here || took != null) {
      samples.push([`ci:${c}`, took ?? now - kept.since]);
      ci[c] = { head: s.head, sampled: true };
    } else ci[c] = null;
  }
  return { ci, samples };
}

export function addSamples(durations, samples, keep = 10) {
  const out = { ...durations };
  for (const [key, ms] of samples) out[key] = [...(out[key] ?? []), Math.round(ms)].slice(-keep);
  return out;
}

export function median(list) {
  if (!list || list.length < 3) return null;
  const sorted = [...list].sort((a, b) => a - b), mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

// The step running and when the PR should be ready to approve: { step, since, readyAt } (null when unknown),
// { yours: true } when the PR is mine (a case left to me while reviews go on is not), null without a band. readyAt sums the medians of what is left up to risk,
// the running step's minus its elapsed time, and a CI pass more after a pending pr-review (its fixups rerun the CI).
export function clockOf(e, durations, now) {
  const band = e.band;
  if (!band) return null;
  if (e.label === LABELS.yours) return { yours: true };
  const kept = e.ci ?? {}, live = (x) => x && !x.sampled;
  const cur = e.launched?.at != null ? { step: e.launched.step, since: e.launched.at, key: `agent:${e.launched.step}` }
    : live(kept.jenkins) ? { step: "CI", since: kept.jenkins.since, key: "ci:jenkins" }
    : live(kept.sonar) ? { step: "sonar", since: kept.sonar.since, key: "ci:sonar" } : null;
  const out = { step: cur?.step ?? null, since: cur?.since ?? null, readyAt: null };
  if (band.length < STEPS.length) return out;

  const [git, jenk, sonar, rev, qa, demo, risk] = band;
  const left = (x) => x !== "ok" && x !== "skip" && x !== "me"; // a case left to me is not the watch's to time
  const keys = [];
  const check = (state, c) => {
    if (!left(state)) return;
    if (state === "ko" || cur?.key === `agent:${c}`) keys.push(`agent:${c}`);
    keys.push(`ci:${c}`);
  };
  if (left(git)) keys.push("agent:rebase");
  check(jenk, "jenkins");
  check(sonar, "sonar");
  if (left(rev)) keys.push("agent:pr-review", ...(jenk !== "skip" ? ["ci:jenkins"] : []), ...(sonar !== "skip" ? ["ci:sonar"] : []));
  for (const [state, name] of [[qa, "qa"], [demo, "pr-demo"], [risk, "pr-risk"]]) if (left(state)) keys.push(`agent:${name}`);
  if (keys.length === 0) return out;

  let total = 0, counted = false;
  for (const key of keys) {
    const m = median(durations?.[key]);
    if (m === null) return out;
    const isCur = !counted && key === cur?.key;
    if (isCur) counted = true;
    total += isCur ? Math.max(0, m - (now - cur.since)) : m;
  }
  return { ...out, readyAt: now + total };
}

// The folder ⌨ would open and whether it exists: a draft's branch checkout, a ready PR's -watch worktree (watch: its path).
// porcelain: `git worktree list --porcelain` of the clone.
export function workOf(porcelain, { draft, branch, watch }) {
  if (draft) {
    const folder = checkoutsOf(porcelain, branch)[0] ?? null;
    return { folder, exists: folder !== null };
  }
  const exists = porcelain.split(/\n\s*\n/).map((b) => b.split("\n"))
    .some((lines) => lines.includes(`worktree ${watch}`) && !lines.some((l) => l.startsWith("prunable")));
  return { folder: watch, exists };
}
