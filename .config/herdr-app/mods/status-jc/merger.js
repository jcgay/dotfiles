// One round of armed merges: gh and Herdr side effects around the pure decisions of merge.js.
import { exec, notify, shared, setShared } from "herdr";
import { ARMED, mergeStep, applyResults } from "./merge.js";

const LEASE = "pr-merge-lease";
const LEASE_MS = 240000; // a round older than this died without clearing its lease

const firstLine = (text) => (text ?? "").trim().split("\n")[0] || null;

async function gh(args) {
  const r = await exec("gh", args, { timeout: 60000 });
  if (r.code !== 0) throw new Error(firstLine(r.stderr) ?? `gh ${args[0]} ${args[1]} : code ${r.code}`);
  return r.stdout;
}

async function one(key, armed) {
  const [repo, n] = key.split("#");
  const url = `https://github.com/${repo}/pull/${n}`;
  let view;
  try {
    view = JSON.parse(await gh(["pr", "view", n, "-R", repo, "--json", "state,headRefOid,statusCheckRollup,commits"]));
  } catch (e) {
    return { drop: false, why: null, error: e.message }; // still armed, retried next minute, no toast
  }
  // A 404 means no Jenkinsfile; any other failure must not let the PR merge without its build.
  const file = await exec("gh", ["api", `repos/${repo}/contents/Jenkinsfile?ref=${view.headRefOid}`, "--silent"], { timeout: 60000 });
  if (file.code !== 0 && !/HTTP 404/.test(file.stderr)) return { drop: false, why: null, error: firstLine(file.stderr) ?? "gh api Jenkinsfile" };
  const step = mergeStep(key, view, armed, { jenkinsfile: file.code === 0 });
  // Disarmed or re-armed while this round read gh: the panel's latest click wins over a toast or a merge.
  if (shared(ARMED)?.[key]?.at !== armed.at) return { drop: false };
  if (step.toast) notify({ title: step.toast, body: url, level: "warning" });
  if (step.action !== "merge") return { drop: step.action === "drop", why: step.why, error: null };
  try {
    // A head pushed since gh pr view makes GitHub refuse: only the commit I armed on is merged.
    await gh(["pr", "merge", n, "-R", repo, "--rebase", "--match-head-commit", armed.head]);
  } catch (e) {
    // Merged meanwhile (another status-jc copy, by hand): a success.
    const state = await gh(["pr", "view", n, "-R", repo, "--json", "state", "--jq", ".state"]).catch(() => "");
    if (state.trim() !== "MERGED") {
      notify({ title: `PR #${n} : merge refusé`, body: e.message, level: "warning" });
      // Kept, not retried: the summary shows the error until ✕ clears it.
      return { drop: false, refused: true, why: null, error: e.message };
    }
  }
  notify({ title: `PR #${n} fusionnée`, body: url, level: "info" });
  return { drop: true };
}

// Merges the armed PRs whose checks are all green; nothing to do (no gh call) when none is armed.
// id: the calling status-jc copy's lease id, so two copies never merge at once.
export async function mergeRound(id) {
  const armed = Object.entries(shared(ARMED) ?? {}).filter(([, e]) => !e.refused);
  if (armed.length === 0) return;
  const lease = shared(LEASE), at = Date.now();
  if (lease && lease.id !== id && at - lease.at < LEASE_MS) return;
  try {
    const results = [];
    for (const [key, entry] of armed) {
      setShared(LEASE, { at: Date.now(), id }); // renewed per PR: a slow round keeps it
      results.push({ key, at: entry.at, ...(await one(key, entry)) });
    }
    setShared(ARMED, applyResults(shared(ARMED) ?? {}, results));
  } finally {
    if (shared(LEASE)?.id === id) setShared(LEASE, null);
  }
}
