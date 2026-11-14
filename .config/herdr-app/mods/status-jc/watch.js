// Pure signals of a PR for the watch: fed with gh JSON. No herdr import, loads in plain Node.

// YYYY-MM-DD, seven days before `now` (lower bound of `gh search prs --updated`).
export function searchSince(now) {
  return new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
}

// jenkinsBuild and checks are copied from mods/pr/model.js: Herdr refuses imports from another mod's folder.
// A Jenkins build URL → { jobPath, number } for `jk run view`, or null.
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

const MARKERS = { "<!-- pr-risk -->": "pr-risk", "<!-- pr-demo -->": "pr-demo", "<!-- testing-api-pull-requests -->": "qa" };

// Sonar's check-run → counts read from its markdown summary (0 when a line is absent), or null without check-run.
export function sonarFindings(checkRun) {
  if (!checkRun) return null;
  const summary = checkRun.output?.summary ?? "";
  const count = (re) => Number(re.exec(summary)?.[1] ?? 0);
  return {
    failed: checkRun.conclusion === "failure",
    issues: count(/\[(\d+) New issues\]/),
    hotspots: count(/\[(\d+) Security Hotspots\]/),
  };
}

// Which agent steps already left their comment: only my comments count.
export function markers(comments, me) {
  const found = new Set();
  for (const c of comments ?? []) {
    if (c.author?.login !== me) continue;
    const kind = MARKERS[Object.keys(MARKERS).find((m) => (c.body ?? "").startsWith(m))];
    if (kind) found.add(kind);
  }
  return found;
}

export function signalsOf(view, checkRuns, me) {
  const all = checks(view.statusCheckRollup);
  const build = all.map((c) => ({ c, b: jenkinsBuild(c.url) })).find((x) => x.b);
  const run = (checkRuns ?? []).find((r) => r.name === "SonarCloud Code Analysis");
  const found = sonarFindings(run);
  const sonar = found && {
    state: run.status && run.status !== "completed" ? "running" : found.failed || found.issues + found.hotspots > 0 ? "ko" : "ok",
    ...found,
    url: run.details_url ?? run.html_url ?? null,
  };
  return {
    key: `${view.repo}#${view.number}`, repo: view.repo, number: view.number, url: view.url, title: view.title,
    branch: view.headRefName, head: view.headRefOid, draft: Boolean(view.isDraft),
    jenkins: build && { state: build.c.state, url: build.c.url, ...build.b },
    sonar,
    pending: all.some((c) => c.state === "running"),
    markers: markers(view.comments, me),
    error: null,
  };
}
