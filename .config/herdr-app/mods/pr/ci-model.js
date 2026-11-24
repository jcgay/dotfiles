// Pure helpers for the CI panel (view "ci"): fed with gh / jk JSON. No herdr import: node --test loads it.
// Design: ~/.config/herdr-app/docs/2026-11-24-ci-watch-design.md

export const WINDOW_MS = 7 * 86400000;

// ~/.config/herdr-app/config.json, rendered by `yadm alt` from the machine class.
// Copied from status-jc/watch.js: a mod cannot import another's files.
export const CONFIG_ERROR = "~/.config/herdr-app/config.json absent ou invalide : lance yadm alt";
export function parseConfig(text) {
  let config;
  try { config = JSON.parse(text); } catch { return { error: CONFIG_ERROR }; }
  const owners = config?.owners;
  const ok = Array.isArray(owners) && owners.length > 0 && owners.every((o) => typeof o === "string" && o !== "");
  return ok ? { config } : { error: CONFIG_ERROR };
}

// A repo's heading: its name alone when every repo has the same owner.
export const repoLabel = (repo, owners) => owners.length > 1 ? repo : repo.split("/")[1];

const parse = (json) => { try { return JSON.parse(json); } catch { return null; } };

// "YYYY-MM-DD" of now - 7 days, for gh's ">date" qualifiers.
export const sinceDate = (now) => new Date(now - WINDOW_MS).toISOString().slice(0, 10);

// `gh search prs … --json repository` and `gh search commits … --json repository` → owner/name, unique, sorted.
export function reposOf(prsJson, commitsJson) {
  const full = [...(parse(prsJson) ?? []).map((p) => p?.repository?.nameWithOwner), ...(parse(commitsJson) ?? []).map((c) => c?.repository?.fullName)];
  return [...new Set(full.filter((n) => /^[^/]+\/[^/]+$/.test(n ?? "")))].sort();
}

export const isLong = (branch) => /^(main|master|develop|sprint-.+|release\/.+)$/.test(branch);

// `jk job ls <folder>/<name> --json` → the long branches' jobs of repo (owner/name). jobPath keeps the raw name: jk 404s on release/v4, not on release%2Fv4.
export function longJobs(repo, jobLsJson, folder) {
  const jobs = parse(jobLsJson);
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap(({ name }) => {
    let branch;
    try { branch = decodeURIComponent(name ?? ""); } catch { return []; }
    return isLong(branch) ? [{ repo, branch, jobPath: `${folder}/${repo.split("/")[1]}/${name}` }] : [];
  });
}

const RED = ["FAILURE", "UNSTABLE", "ABORTED"];
export const rowState = (run) => run.status !== "completed" ? "running" : RED.includes(run.result) ? "ko" : run.result === "SUCCESS" ? "ok" : "idle";

// `jk run ls <jobPath> --limit 1 --json` → the row of its last build, or null when none in the window.
export function rowOf(job, runLsJson, now) {
  const run = parse(runLsJson)?.items?.[0];
  if (!run) return null;
  const startTime = Date.parse(run.startTime);
  if (!(now - startTime <= WINDOW_MS)) return null;
  return { ...job, number: run.number, state: rowState(run), result: run.result ?? null, startTime, durationMs: run.durationMs ?? 0, url: run.url };
}

const slug = (branch) => branch.replaceAll("/", "-");
export const fixBranch = (branch, number) => `fix/ci-${slug(branch)}-${number}`;

// A fix under way: an open PR from any fix/ci-<branch>-<N>, or the worktree of this very build's fix branch.
export function fixOf(row, openPrs, worktreeBranches) {
  const re = new RegExp(`^fix/ci-${slug(row.branch).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}-\\d+$`);
  const pr = (openPrs ?? []).find((p) => re.test(p.headRefName ?? ""));
  if (pr) return { pr: { number: pr.number, url: pr.url }, branch: pr.headRefName };
  const own = fixBranch(row.branch, row.number);
  return (worktreeBranches ?? []).includes(own) ? { branch: own } : null;
}

// Rows by repo: repos with a red row first, then by name; rows by branch.
export function groups(rows) {
  const by = new Map();
  for (const r of rows) by.set(r.repo, [...(by.get(r.repo) ?? []), r]);
  const red = (g) => g.rows.some((r) => r.state === "ko") ? 0 : 1;
  return [...by].map(([repo, rs]) => ({ repo, rows: rs.sort((a, b) => a.branch.localeCompare(b.branch)) }))
    .sort((a, b) => red(a) - red(b) || a.repo.localeCompare(b.repo));
}

export function fixPrompt(row) {
  const { repo, branch, jobPath, number, result } = row, fix = fixBranch(branch, number);
  return `Le build Jenkins #${number} de ${branch} (${repo}) est en échec (${result}). Lis le log avec \`jk log ${jobPath} ${number}\` ; `
    + "sans VPN, Jenkins est injoignable : dis-le et arrête-toi. Si l'échec vient de l'infrastructure ou d'un test instable, "
    + `relance avec \`jk run rerun ${jobPath} ${number}\`, ne pousse rien et dis-le. Sinon corrige sur la branche ${fix} où tu es, `
    + `committe, pousse-la et ouvre une PR brouillon vers ${branch} (\`gh pr create --draft --base ${branch}\`).`;
}

export const jenkinsDown = (results) => results.length > 0 && results.every((r) => !r.ok);

// `git worktree list --porcelain` → [{folder, branch}], branch null when detached.
export function worktrees(porcelain) {
  return (porcelain ?? "").split("\n\n").map((block) => {
    const folder = /^worktree (.+)$/m.exec(block)?.[1], branch = /^branch refs\/heads\/(.+)$/m.exec(block)?.[1] ?? null;
    return folder ? { folder, branch } : null;
  }).filter(Boolean);
}

// `git remote get-url origin` → owner/name on GitHub, or null (same rule as status-jc's repoOfRemote).
export const remoteRepo = (url) => /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?\s*$/.exec(url ?? "")?.[1] ?? null;

// A jk call that got an answer from Jenkins: a 404 is a repo without a Jenkins folder, not Jenkins down.
export const jkReached = (r) => r.code === 0 || /404 Not Found/.test(r.stderr ?? "");

// Repos and jobs are cached only from a complete answer: a failed search or jk job ls would hide repos for 15 min.
export const listComplete = (searches, jobLs) => searches.every((r) => r.code === 0) && jobLs.every(jkReached);
