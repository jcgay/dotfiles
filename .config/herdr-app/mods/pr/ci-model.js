// Pure helpers for the CI panel (view "ci"): fed with gh / jk JSON. No herdr import: node --test loads it.
// Design: ~/.config/herdr-app/docs/2026-11-24-ci-watch-design.md

// shortcut: one organisation, hard-coded; made configurable in a later PR.
export const ORG = "softwarevidal";
export const WINDOW_MS = 7 * 86400000;
export const JOBS_FOLDER = "team.software/github";

const parse = (json) => { try { return JSON.parse(json); } catch { return null; } };

// "YYYY-MM-DD" of now - 7 days, for gh's ">date" qualifiers.
export const sinceDate = (now) => new Date(now - WINDOW_MS).toISOString().slice(0, 10);

// `gh search prs … --json repository` and `gh search commits … --json repository` → repo names, unique, sorted.
export function reposOf(prsJson, commitsJson) {
  const full = [...(parse(prsJson) ?? []).map((p) => p?.repository?.nameWithOwner), ...(parse(commitsJson) ?? []).map((c) => c?.repository?.fullName)];
  return [...new Set(full.filter(Boolean).map((n) => n.split("/")[1]).filter(Boolean))].sort();
}

export const isLong = (branch) => /^(main|master|develop|sprint-.+|release\/.+)$/.test(branch);

// `jk job ls <folder>/<repo> --json` → the long branches' jobs. jobPath keeps the raw name: jk 404s on release/v4, not on release%2Fv4.
export function longJobs(repo, jobLsJson) {
  const jobs = parse(jobLsJson);
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap(({ name }) => {
    let branch;
    try { branch = decodeURIComponent(name ?? ""); } catch { return []; }
    return isLong(branch) ? [{ repo, branch, jobPath: `${JOBS_FOLDER}/${repo}/${name}` }] : [];
  });
}

const RED = ["FAILURE", "UNSTABLE", "ABORTED"];
export const rowState = (run) => run.status !== "completed" ? "running" : RED.includes(run.result) ? "ko" : "ok";

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
  if (pr) return { pr: { number: pr.number, url: pr.url } };
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
