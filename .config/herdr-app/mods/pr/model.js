// Pure helpers for the PR panel: fed with gh / jk JSON.

// A Jenkins build URL → { jobPath, number } for `jk run view`, or null.
// https://jenkins/job/a/job/b/job/PR-1/12/display/redirect → { jobPath: "a/b/PR-1", number: 12 }
export function jenkinsBuild(url) {
  const m = /^https?:\/\/[^/]+((?:\/job\/[^/]+)+)\/(\d+)(?:\/|$)/.exec(url ?? "");
  if (!m) return null;
  return { jobPath: m[1].split("/job/").filter(Boolean).map(decodeURIComponent).join("/"), number: Number(m[2]) };
}

// gh's statusCheckRollup (StatusContext or CheckRun) → [{ name, state: "ok" | "ko" | "running", url }].
export function checks(rollup) {
  return (rollup ?? []).map((c) => {
    const s = (c.conclusion || c.state || c.status || "").toUpperCase();
    const state = ["SUCCESS", "NEUTRAL", "SKIPPED"].includes(s) ? "ok"
      : ["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "ACTION_REQUIRED", "STARTUP_FAILURE"].includes(s) ? "ko" : "running";
    return { name: c.context || c.name || "?", state, url: c.targetUrl || c.detailsUrl || null };
  });
}

export function minutes(ms) {
  const m = Math.round((ms ?? 0) / 60000);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}

// `<cli> inspect --format '{{.Name}}|{{json .Config.Env}}'` → [{ name, hosts, repo, branch }].
// Only the routing variables are kept: the rest of the env may hold secrets.
export function parseContainers(out) {
  return out.split("\n").filter(Boolean).flatMap((line) => {
    const i = line.indexOf("|");
    let env;
    try { env = JSON.parse(line.slice(i + 1)) ?? []; } catch { return []; }
    const get = (k) => env.find((e) => e.startsWith(k + "="))?.slice(k.length + 1) ?? null;
    const hosts = (get("VIRTUAL_HOST") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
    return hosts.length ? [{ name: line.slice(0, i).replace(/^\//, ""), hosts, repo: get("VIDAL_REPOSITORY"), branch: get("VIDAL_GIT_REMOTE_BRANCH") }] : [];
  });
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

// workflow-libs' DockerBo: "[DEPLOY_PR][MM-1505]" in a PR title deploys <app>-mm1505 on dockerbo.
export function deployKey(title) {
  const m = /\[DEPLOY_PR\]\[(.+?)\]/.exec(title ?? "");
  return m ? m[1].replace(/[._-]/g, "").trim().toLowerCase() : null;
}

// The URLs where this repo's branch (or its PR) runs. A container that names its repo and branch
// (dockersw, docker-sw2) is matched on them; one that names nothing (dockerbo) on its host:
// <repo>-<DEPLOY_PR key> (DockerBo), <repo>-pr-<n> or <repo>-<branch>.
// https only on docker-sw2, whose public names are on .fr.
export function deploymentsFor(containers, { repo, branch, pr, title }) {
  if (!repo || !branch) return [];
  const key = deployKey(title);
  const prefixes = [key ? `${slug(repo)}-${key}.` : null, pr ? `${slug(repo)}-pr-${pr}.` : null, `${slug(repo)}-${slug(branch)}.`].filter(Boolean);
  const urls = new Set();
  for (const c of containers) {
    const hit = c.repo ? c.repo === repo && c.branch === branch : c.hosts.some((h) => prefixes.some((p) => h.toLowerCase().startsWith(p)));
    if (hit) for (const h of c.hosts) urls.add(`${/\.vidal\.fr$/.test(h) ? "https" : "http"}://${h}`);
  }
  return [...urls].sort();
}

// A PR watch worktree (status-jc's watcher) is detached, so Herdr gives no branch: its path names it.
// …/agents-worktree/ordostruct/feat/x-watch → "feat/x"
export function watchBranch(cwd) {
  return /\/agents-worktree\/[^/]+\/(.+)-watch\/?$/.exec(cwd ?? "")?.[1] ?? null;
}
