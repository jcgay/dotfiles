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

export const LABELS = Object.freeze({
  ok: "ok", draft: "brouillon", waiting: "en attente", running: "agent en cours",
  yours: "à toi", noClone: "pas de clone local", error: "erreur",
});

const BUDGET = 2; // attempts per check (jenkins, sonar) and PR
const REVIEW = ["pr-risk", "pr-demo", "qa"];
const KARADOC = ["pr-demo", "qa"]; // start karadoc on fixed ports: one at a time

export const tabName = (number, step) => `⟳ #${number} ${step}`;

// Entry: what the watch remembers of a PR between rounds.
// - attempts: fix agents launched per check since it was last green or I last pushed.
// - told: the "à toi" toast of that check was shown; reset together with its attempts.
// - launched: the step running or last launched, with the head it started on and its tab name.
// - silent: per head, the review steps that ended without leaving their marker.
// - seen: that check reported on some head of this PR; null on a later head then means "not reported yet".
export function emptyEntry() {
  return {
    url: "", title: "", head: null, attempts: { jenkins: 0, sonar: 0 }, told: { jenkins: false, sonar: false },
    seen: { jenkins: false, sonar: false }, launched: null, silent: {}, label: LABELS.waiting, error: null,
  };
}

// What to do with one PR this round: a new entry, the step to launch (or null), a toast (or null). Pure.
export function decide(s, entry, tab, ctx) {
  const e = structuredClone(entry);
  e.told = { jenkins: false, sonar: false, ...e.told };
  e.url = s.url;
  e.title = s.title;
  const out = (label, launch = null, toast = null) => ({ entry: { ...e, label }, launch, toast });

  if (s.error) {
    e.error = s.error;
    return out(LABELS.error);
  }
  e.error = null;
  e.seen = { jenkins: false, sonar: false, ...e.seen };
  for (const c of ["jenkins", "sonar"]) if (s[c]) e.seen[c] = true;
  // A check this PR had but the head lacks has not reported yet: wait, as for a running one.
  const state = (c) => s[c]?.state ?? (e.seen[c] ? "running" : "ok");

  if (s.head !== e.head) {
    // A head that appears while the agent's tab exists (done included) is the agent's push: keep its budget.
    if (!(e.launched && tab.exists)) {
      e.attempts = { jenkins: 0, sonar: 0 };
      e.told = { jenkins: false, sonar: false };
    }
    e.head = s.head;
  }

  if (e.launched && !tab.running) {
    const { step, head } = e.launched;
    if (REVIEW.includes(step) && !s.markers.has(step)) e.silent[head] = [...(e.silent[head] ?? []), step];
    e.launched = null;
  }
  if (tab.running) return out(LABELS.running);

  for (const c of ["jenkins", "sonar"]) {
    if (s[c]?.state === "ok") {
      e.attempts[c] = 0;
      e.told[c] = false;
    }
  }

  let toast = null;
  let yours = false;
  const refuse = (c) => {
    yours = true;
    if (!e.told[c]) toast = `PR #${s.number} : ${c} à toi`;
    e.told[c] = true;
  };

  let step;
  if (state("jenkins") === "ko") {
    if (e.attempts.jenkins >= BUDGET) {
      refuse("jenkins");
      return out(LABELS.yours, null, toast);
    }
    step = "jenkins";
  } else if (state("jenkins") === "running" || s.pending || state("sonar") === "running") {
    return out(LABELS.waiting);
  } else if (state("sonar") === "ko" && e.attempts.sonar < BUDGET) {
    step = "sonar";
  } else {
    if (state("sonar") === "ko") {
      refuse("sonar");
      if (s.sonar.failed) return out(LABELS.yours, null, toast);
    }
    if (!s.draft) {
      const silent = e.silent[s.head] ?? [];
      step = REVIEW.find((r) => (r !== "qa" || ctx.hasQa) && !s.markers.has(r) && !silent.includes(r));
    }
    if (!step) return out(yours ? LABELS.yours : s.draft ? LABELS.draft : LABELS.ok, null, toast);
  }

  if (!ctx.on || ctx.slots <= 0 || (KARADOC.includes(step) && !ctx.karadocFree)) {
    return out(yours ? LABELS.yours : LABELS.waiting, null, toast);
  }
  if (!REVIEW.includes(step)) e.attempts[step]++;
  e.launched = { step, head: s.head, tab: tabName(s.number, step) };
  return out(LABELS.running, step, toast);
}
