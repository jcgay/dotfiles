// Pure signals of a PR for the watch: fed with gh JSON. No herdr import, loads in plain Node.

// ~/.config/herdr-app/config.json, rendered by `yadm alt` from the machine class. Copied in pr/ci-model.js.
export const CONFIG_ERROR = "~/.config/herdr-app/config.json absent ou invalide : lance yadm alt";
export function parseConfig(text) {
  let config;
  try { config = JSON.parse(text); } catch { return { error: CONFIG_ERROR }; }
  const owners = config?.owners;
  const ok = Array.isArray(owners) && owners.length > 0 && owners.every((o) => typeof o === "string" && o !== "");
  return ok ? { config } : { error: CONFIG_ERROR };
}
export const ownerArgs = (owners) => owners.map((o) => `--owner=${o}`);

// YYYY-MM-DD, seven days before `now` (lower bound of `gh search prs --updated`).
export function searchSince(now) {
  return new Date(now.getTime() - 7 * 86400000).toISOString().slice(0, 10);
}

// jenkinsBuild and checks are copied from mods/pr/model.js: Herdr refuses imports from another mod's folder.
// A Jenkins build URL → { jobPath, number } for `jk run view`, or null.
// The console of a Jenkins build from its check URL (…/job/a/job/b/57/display/redirect → …/job/a/job/b/57/console), or null.
export function jenkinsConsole(url) {
  const m = /^(https?:\/\/[^/]+(?:\/job\/[^/]+)+\/\d+)(?:\/|$)/.exec(url ?? "");
  return m ? `${m[1]}/console` : null;
}

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

// A commit `git rebase --autosquash` folds into an earlier one.
export const FIXUP = /^(fixup|amend|squash)! /;
export const fixups = (commits) => (commits ?? []).filter((c) => FIXUP.test(c.messageHeadline ?? "")).length;

const MARKERS = { "<!-- pr-risk -->": "pr-risk", "<!-- pr-demo -->": "pr-demo", "<!-- pr-review -->": "pr-review", "<!-- testing-api-pull-requests -->": "qa" };

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

// Which agent steps already left their comment or review: only my comments count.
export function markers(comments, me) {
  const found = new Set();
  for (const c of comments ?? []) {
    if (c.author?.login !== me) continue;
    const kind = MARKERS[Object.keys(MARKERS).find((m) => (c.body ?? "").startsWith(m))];
    if (kind) found.add(kind);
  }
  return found;
}

// My pr-risk verdict: how many humans it asks for and the head it judged (its 2nd line, null on older comments).
export function riskOf(comments, me) {
  const body = (comments ?? []).find((c) => c.author?.login === me && (c.body ?? "").startsWith("<!-- pr-risk -->"))?.body;
  if (body == null) return null;
  const humans = /^## PR risk: .* · (\d+) human review/m.exec(body)?.[1];
  return { humans: humans == null ? null : Number(humans), sha: /^<!-- pr-risk-head: ([0-9a-f]{40}) -->$/m.exec(body)?.[1] ?? null };
}

// No human review asked, by a verdict on the head's code: it stands for the approval (squash, appr), never for the merge.
// A human who requested changes still blocks: the fixups are theirs to read.
export const noHuman = (s) => s.risk?.humans === 0 && s.risk.onHead === true && !s.changesRequested;

// A 0-human verdict on other code is not done: pr-risk runs again, unless a human approved (it then decides nothing).
// A 1- or 2-human verdict waits for a human anyway: it is not run again.
export const staleRisk = (s) => s.risk?.humans === 0 && s.risk.onHead === false && !s.approved;

// same: the verdict's commit has the head's tree (true, false, null when gh could not tell). A stale verdict trades its
// marker for "pr-risk-stale": decide() runs pr-risk again, closing() waits for that agent to stop before closing its tab.
export function withRiskTree(s, same) {
  const next = { ...s, risk: { ...s.risk, onHead: same } };
  if (!staleRisk(next) || !s.markers.has("pr-risk")) return next;
  const markers = new Set(s.markers);
  markers.delete("pr-risk");
  markers.add("pr-risk-stale");
  return { ...next, markers };
}

const SONAR = /^Sonar(Cloud|Qube) Code Analysis$/;

// How long the CI checks with timestamps (GitHub Actions…) took on this head, Sonar aside: first start to last end,
// null while one runs or when none has timestamps (Jenkins' status has none).
export function ciTook(rollup) {
  const runs = (rollup ?? []).filter((c) => c.startedAt && !SONAR.test(c.name ?? ""));
  if (!runs.length || runs.some((c) => !c.completedAt)) return null;
  return Math.max(...runs.map((c) => Date.parse(c.completedAt))) - Math.min(...runs.map((c) => Date.parse(c.startedAt)));
}

export function signalsOf(view, checkRuns, me) {
  const risk = riskOf(view.comments, me);
  // [SKIP_CI] in the title: the repo's Jenkinsfile cancels the build, which Jenkins reports to GitHub as ERROR, and Sonar never runs.
  const skipCi = /\[SKIP_CI\]/.test(view.title ?? "");
  const all = checks(view.statusCheckRollup).map((c, i) =>
    skipCi && view.statusCheckRollup[i].state === "ERROR" && jenkinsBuild(c.url) ? { ...c, state: "ok" } : c);
  const builds = all.map((c) => ({ c, b: jenkinsBuild(c.url) })).filter((x) => x.b);
  const build = builds.find((x) => x.c.state === "ko") ?? builds[0];
  const run = (checkRuns ?? []).find((r) => SONAR.test(r.name));
  const found = sonarFindings(run);
  const sonar = found && {
    state: run.status && run.status !== "completed" ? "running" : found.failed || found.issues + found.hotspots > 0 ? "ko" : "ok",
    ...found,
    url: run.details_url ?? run.html_url ?? null,
    took: run.started_at && run.completed_at ? Date.parse(run.completed_at) - Date.parse(run.started_at) : null,
  };
  return {
    key: `${view.repo}#${view.number}`, repo: view.repo, number: view.number, url: view.url, title: view.title,
    branch: view.headRefName, head: view.headRefOid, draft: Boolean(view.isDraft), base: view.baseRefName,
    approved: view.reviewDecision === "APPROVED", changesRequested: view.reviewDecision === "CHANGES_REQUESTED", fixups: fixups(view.commits),
    conflict: { CONFLICTING: true, MERGEABLE: false }[view.mergeable] ?? null, // null: GitHub is still computing it
    jenkins: build && { state: build.c.state, url: build.c.url, ...build.b },
    sonar,
    skipCi,
    ciTook: ciTook(view.statusCheckRollup),
    pending: all.some((c) => c.state === "running"),
    failing: all.some((c) => c.state === "ko"),
    reported: all.length > 0 || (checkRuns ?? []).length > 0,
    markers: markers([...(view.comments ?? []), ...(view.reviews ?? [])], me),
    risk: risk && { ...risk, onHead: risk.sha === view.headRefOid ? true : null }, // watcher.js compares the trees otherwise
    error: null,
  };
}

export const LABELS = Object.freeze({
  ok: "ok", draft: "brouillon", waiting: "en attente", running: "agent en cours",
  yours: "à toi", noClone: "pas de clone local", error: "erreur", paused: "en pause",
});

export const BUDGET = 2; // attempts per check (rebase, jenkins, sonar, squash) and PR
// Jenkins failing too: the sonar fix goes before the jenkins one while the quality gate fails and Sonar has attempts left.
export const sonarFirst = (s, e) => s.sonar?.state === "ko" && Boolean(s.sonar.failed) && (e.attempts?.sonar ?? 0) < BUDGET;
export const REVIEW = ["pr-review", "qa", "pr-demo", "pr-risk"]; // pr-review --fix pushes first: qa, demo and risk see the fixed code; qa finds bugs before the demo shows them
const KARADOC = ["pr-demo", "qa"]; // start karadoc on fixed ports: one at a time
export const KARADOC_MAX_MIN = 45; // past it, a qa or pr-demo is mine: they take 30 min at most
const PUSHES = ["pr-review"]; // review steps that push fixups after their marker: they last until their tab closes

const CLOSES = ["pr-risk", "pr-review", "pr-demo"]; // review steps over once their marker is posted and their agent stopped (pr-review fixes, pr-demo tears down, in the same turn): their tab closes
const CLOSES_DONE = ["rebase", "squash", "jenkins", "sonar"]; // fix steps have no marker: their tab closes once their agent finished (its session stays in its band cell)

export const tabName = (number, step) => `⟳ #${number} ${step}`;

// Entry: what the watch remembers of a PR between rounds.
// - attempts: fix agents launched per check since it was last green or I last pushed.
// - told: the "à toi" toast of that check was shown; reset together with its attempts.
// - launched: the step running or last launched, with the head it started on and its tab name.
// - silent: per head, the review steps whose tab closed without their marker.
// - seen: that check reported on some head of this PR; null on a later head then means "not reported yet".
export function emptyEntry() {
  return {
    url: "", title: "", head: null, attempts: { jenkins: 0, sonar: 0 }, told: { jenkins: false, sonar: false },
    seen: { jenkins: false, sonar: false }, launched: null, silent: {}, label: LABELS.waiting, why: "pas encore de tour de surveillance", error: null,
  };
}

// The busy tab name that runs karadoc, or null: a pr-demo/qa tab of a PR whose repo holds karadoc, or of a PR
// missing from the round (merged, closed) whose agent may still use it. karadocPrs, roundPrs: Sets of PR numbers.
// shortcut: tab names carry no repo, so a demo of another repo's PR with the same number holds karadoc too
export function karadocHolder(busy, karadocPrs, roundPrs) {
  return busy.find((name) => {
    const m = /^⟳ #(\d+) (\S+)$/.exec(name);
    return m !== null && KARADOC.includes(m[2]) && (karadocPrs.has(Number(m[1])) || !roundPrs.has(Number(m[1])));
  }) ?? null;
}
// The PR of the repo whose qa or pr-demo tab is busy, or null: both start the app on the ports the repo fixes.
// busy: tab names; numbers: the repo's other PRs; roundPrs: Set of every PR number of the round. A PR missing from the
// round (merged, closed) whose agent still runs counts too, as in karadocHolder.
export function appTaken(busy, numbers, roundPrs) {
  for (const name of busy) {
    const m = /^⟳ #(\d+) (\S+)$/.exec(name);
    if (m && KARADOC.includes(m[2]) && (numbers.includes(Number(m[1])) || !roundPrs.has(Number(m[1])))) return Number(m[1]);
  }
  return null;
}

export const karadocHeld = (busy, karadocPrs, roundPrs) => karadocHolder(busy, karadocPrs, roundPrs) !== null;

// Watch tabs ([{ name, status }]) that hold their PR, and for pr-demo/qa karadoc: a working or blocked agent, or a review
// step whose tab exists without its marker (a Claude waiting for a text reply reads idle), or a pushing step's open tab. markersOf(number): Set, or null.
export function holdingTabs(tabs, markersOf) {
  return tabs.filter(({ name, status }) => {
    const m = /^⟳ #(\d+) (\S+)$/.exec(name);
    if (!m) return false;
    if (["working", "blocked"].includes(status)) return true;
    const found = markersOf(Number(m[1]));
    return REVIEW.includes(m[2]) && found !== null && (PUSHES.includes(m[2]) || !found.has(m[2]));
  }).map((t) => t.name);
}

// What to close this round ([{ cmd, args }]): the tab of a CLOSES step whose agent stopped and whose PR has its marker (or its
// stale marker, agent done or idle) or left
// the round (merged, closed), of a qa stopped (done or idle) without its marker, or of a CLOSES_DONE step whose agent finished (done or idle: null is not started yet), or its
// space when that tab is the space's only one. Never the tab I am looking at, nor one
// I split. args are confirmed: Herdr asks before closing a space, and nobody is there to answer.
// spaces: local SpaceInfo[]; markersOf(number, folder): the PR's Set, null when unknown, undefined when gone.
// qaBefore: the ids stoppedQa() gave the round before. fresh: freshTabs(), never closed: a Claude that just started
// reads idle for a moment before its task reaches it, and closing it then kills it before its session.
const qaStopped = (t, found) => ["done", "idle"].includes(t.status) && found?.has("qa") === false;

// The watch tab names launched less than FRESH_MS ago: by a watch round of any status-jc copy (entries: registry entries
// of the rounds, launched { tab, at }) or by the squash button (squashes: shared("pr-squash"), { state: "agent", tab, at }).
// shortcut: names carry no repo, a fresh "⟳ #3 jenkins" also keeps another repo's finished one a round longer
export const FRESH_MS = 60000;
export function freshTabs(entries, squashes, now) {
  const recent = (x) => x?.tab && now - (x.at ?? 0) < FRESH_MS;
  return new Set([...entries.map((e) => e?.launched), ...Object.values(squashes ?? {}).filter((q) => q?.state === "agent")]
    .filter(recent).map((x) => x.tab));
}

// The ids of the qa tabs stopped without their report this round, for the next round's closing(). fresh: as in closing().
export function stoppedQa(spaces, markersOf, fresh = new Set()) {
  return new Set(spaces.flatMap((sp) => sp.tabs.filter((t) => {
    const m = /^⟳ #(\d+) qa$/.exec(t.name);
    return m !== null && !fresh.has(t.name) && qaStopped(t, markersOf(Number(m[1]), sp.folder));
  }).map((t) => t.id)));
}

export function closing(spaces, markersOf, qaBefore = new Set(), fresh = new Set()) {
  return spaces.flatMap((sp) => sp.tabs.filter((t) => {
    const m = /^⟳ #(\d+) (\S+)$/.exec(t.name);
    if (m === null || t.panes !== 1 || (sp.active && t.active) || fresh.has(t.name)) return false;
    if (CLOSES_DONE.includes(m[2])) return ["done", "idle"].includes(t.status);
    // A qa stopped without its report (a question nobody reads) would hold the repo's app (appTaken) for good.
    // One that posted its report stays open, to fix its bugs there. Markers are read at the round's start: a report
    // posted during the round is missed, so the tab must have been stopped without it the round before too.
    if (m[2] === "qa" && qaBefore.has(t.id) && qaStopped(t, markersOf(Number(m[1]), sp.folder))) return true;
    if (!CLOSES.includes(m[2]) || ["working", "blocked"].includes(t.status)) return false;
    const found = markersOf(Number(m[1]), sp.folder);
    // A verdict posted on code that moved since (pr-risk-stale): its agent stopped, decide() then runs pr-risk again.
    // Not before: a pr-risk just launched on the stale verdict has no status yet.
    return found === undefined || (found?.has(m[2]) ?? false) || (Boolean(found?.has(`${m[2]}-stale`)) && ["done", "idle"].includes(t.status));
  }).map((t) => (sp.tabs.length === 1 ? { cmd: "space.close", args: { id: sp.id, confirmed: true } } : { cmd: "tab.close", args: { id: t.id, confirmed: true } })));
}

// Whether the agent of a conflicted squash (pr-squash entry { state: "agent", at, tab }) is over: its tab closed, no agent
// left in it (Claude quit, a shell remains), or done or idle, as closing() reads them. Not in the first seconds: start()
// does not wait for its tab, and another status-jc copy may look before spaces() and agents() list it.
// tabNames: Set of every tab name; agent: the agents() row in that tab, or undefined.
// shortcut: tab names carry no repo, another repo's "⟳ #N squash" can stand in for this one; match on the session id if it bites
export const SQUASH_GRACE_MS = 15000;
export function squashAgentOver(entry, tabNames, agent, now) {
  if (now - entry.at < SQUASH_GRACE_MS) return false;
  return !tabNames.has(entry.tab) || !agent || ["done", "idle"].includes(agent.status);
}

// `git worktree list --porcelain` → the folders with branch checked out. The watch's own worktree is detached, a prunable
// one no longer exists: neither is listed.
export function checkoutsOf(porcelain, branch) {
  return porcelain.split(/\n\s*\n/).map((block) => block.split("\n"))
    .filter((lines) => lines.includes(`branch refs/heads/${branch}`) && !lines.some((l) => l.startsWith("prunable")))
    .map((lines) => lines.find((l) => l.startsWith("worktree "))?.slice("worktree ".length))
    .filter(Boolean);
}

// A draft is watched only while a local space or pane shows one of its branch's checkouts (folders: their cwds).
export function draftShown(folders, porcelain, branch) {
  const checkouts = checkoutsOf(porcelain, branch);
  return folders.some((f) => checkouts.some((c) => f === c || f.startsWith(`${c}/`)));
}

// Whether this round watches PR s. known: it is in the registry; shown(): draftShown for it; ready: the local layout is
// restored (before, spaces() lacks the restored spaces). A failed read has no draft flag: only a PR already watched keeps
// its error row, a draft left aside must not come back as « erreur » during a GitHub outage.
export function watchedNow(s, { ready, known, shown }) {
  if (s.error) return known;
  if (!s.draft) return true;
  return ready ? shown() : known;
}

// The open drafts this round leaves aside (no space shows them), for the PR panel's fold: key, url and title. hidden: the
// last round's left-aside entries; a failed read has no draft flag, so one already aside stays aside through the outage.
export function asideDrafts(read, watched, hidden = {}) {
  return read.filter((s) => (s.draft || (s.error && s.key in hidden)) && !watched.has(s.key)).map((s) => ({ key: s.key, url: s.url, title: s.title }));
}

// `git reflog show --format=%H|%gs HEAD` of a watch worktree → the commits the watch itself checked out
// (worktree add, checkout of origin/<branch>): what the agent found, not what it committed.
export function checkoutBases(reflog, branch) {
  return reflog.split("\n").map((l) => l.split("|"))
    .filter(([h, gs]) => h && (gs === "" || (gs?.startsWith("checkout: ") && gs.endsWith(` to origin/${branch}`)))).map(([h]) => h);
}

// What to do with one PR this round: a new entry, the step to launch (or null), a toast (or null). Pure.
// tab: { exists, running, working } of entry.launched's tab (running: working or blocked), busy: another watch tab holds this PR (holdingTabs).
// ctx.hasCi: the local clone has a CI (Jenkinsfile, GitHub workflow); without it, no check is not worth waiting for.
// entry.why says in French why the PR has its label, for the panel.
export function decide(s, entry, tab, ctx) {
  const e = JSON.parse(JSON.stringify(entry)); // Herdr's runtime has no structuredClone
  e.told = { jenkins: false, sonar: false, ...e.told };
  e.url = s.url;
  e.title = s.title;
  const out = (label, why, launch = null, toast = null) => ({ entry: { ...e, label, why }, launch, toast });

  // errorRounds: rounds in a row GitHub could not read this PR; the journal waits for the second (a blip is not news).
  if (s.error) {
    e.error = s.error;
    e.errorRounds = (entry.errorRounds ?? 0) + 1;
    return out(LABELS.error, `lecture de la PR sur GitHub impossible : ${readHint(s.error)}`);
  }
  e.error = null;
  e.errorRounds = 0;
  // blocker: what to open when the watch gave up on a check (the panel's click on a « à toi » row), else null.
  e.blocker = null;
  e.seen = { jenkins: false, sonar: false, ...e.seen };
  for (const c of ["jenkins", "sonar"]) if (s[c]) e.seen[c] = true;
  // A check this PR had but the head lacks has not reported yet: wait, as for a running one.
  const state = (c) => s[c]?.state ?? (e.seen[c] && !s.skipCi ? "running" : "ok");

  if (s.head !== e.head) {
    // A head that appears while a fix agent's tab exists (done included) is its push: keep its budget.
    // Other review agents never push, and their tab may stay open for long.
    const pusher = e.launched && (!REVIEW.includes(e.launched.step) || PUSHES.includes(e.launched.step));
    if (!(pusher && tab.exists)) {
      e.attempts = { jenkins: 0, sonar: 0 };
      e.told = { jenkins: false, sonar: false };
    }
    e.head = s.head;
  }
  const short = (sha) => (sha ?? "").slice(0, 8);

  // A review step lasts until its marker appears or its tab closes; a fix step until its agent stops working.
  // pr-review posts its marker before fixing: it lasts until its tab closes, so pr-demo never runs on the unfixed head.
  const review = e.launched && REVIEW.includes(e.launched.step) && !s.markers.has(e.launched.step);
  const holds = review || PUSHES.includes(e.launched?.step) ? tab.exists : tab.running;
  if (e.launched && !holds) {
    if (review) e.silent[e.launched.head] = [...(e.silent[e.launched.head] ?? []), e.launched.step];
    e.launched = null;
  }
  // A qa or pr-demo still open long after its usual run and not working (a question nobody reads, a permission prompt)
  // holds karadoc and the repo's app for good. Paused: no toast, as for every paused PR.
  const minutes = Math.floor((ctx.now - e.launched?.at) / 60000);
  if (e.launched && holds && !tab.working && !ctx.paused && KARADOC.includes(e.launched.step) && minutes >= KARADOC_MAX_MIN) {
    const toast = e.launched.told ? null : `PR #${s.number} : ${e.launched.step} bloqué ? regarde ${e.launched.tab}`;
    e.launched.told = true;
    return out(LABELS.yours, `${e.launched.step} ouvert depuis ${minutes} min et arrêté, les qa et pr-demo suivants l'attendent : regarde son onglet ${e.launched.tab}`, null, toast);
  }
  if (e.launched && holds) return out(LABELS.running, `agent ${e.launched.step} lancé sur ${short(e.launched.head)}`);
  if (tab.busy) return out(LABELS.running, "un autre onglet ⟳ de cette PR travaille encore");
  if (ctx.paused) {
    // After the launched agent (it finishes), before any count or toast: resuming finds the PR as it was.
    const ci = s.conflict ? `en conflit avec ${s.base}` : state("jenkins") === "ko" || state("sonar") === "ko" || s.failing ? "un check en échec"
      : state("jenkins") === "running" || state("sonar") === "running" || s.pending ? "CI en cours"
      : s.reported ? "CI verte" : "aucun check";
    return out(LABELS.paused, `en pause ; ${ci}`);
  }

  // Right after a push to the base GitHub answers UNKNOWN: neither a reset nor a launch on a PR that may conflict.
  if (s.conflict === null) return out(LABELS.waiting, `GitHub calcule si la PR est en conflit avec ${s.base}`);
  if (!s.conflict) {
    delete e.attempts.rebase;
    delete e.told.rebase;
  }
  if (!s.fixups) {
    delete e.attempts.squash;
    delete e.told.squash;
  }
  for (const c of ["jenkins", "sonar"]) {
    if (s[c]?.state === "ok") {
      e.attempts[c] = 0;
      e.told[c] = false;
    }
  }

  let toast = null;
  let yours = null; // why the PR is mine, when the watch gives up on a check
  const refuse = (c, why) => {
    yours = why;
    const url = c === "jenkins" ? jenkinsConsole(s.jenkins?.url) : c === "sonar" ? s.sonar?.url ?? null : null;
    if (url) e.blocker = { step: c, url };
    if (!e.told[c]) toast = `PR #${s.number} : ${c} à toi`;
    e.told[c] = true;
  };

  let step;
  if (s.conflict) {
    // GitHub runs no CI on a PR in conflict: rebase first.
    if ((e.attempts.rebase ?? 0) >= BUDGET) {
      refuse("rebase", `encore en conflit avec ${s.base} après ${BUDGET} rebases`);
      return out(LABELS.yours, yours, null, toast);
    }
    step = "rebase";
  } else if (state("jenkins") === "ko") {
    // A failed quality gate goes first: a Jenkinsfile that waits on it fails the build for it.
    if (sonarFirst(s, e)) step = "sonar";
    else if (e.attempts.jenkins >= BUDGET) {
      refuse("jenkins", `Jenkins encore en échec après ${BUDGET} corrections`);
      return out(LABELS.yours, yours, null, toast);
    } else step = "jenkins";
  } else if (state("jenkins") === "running" || s.pending || state("sonar") === "running") {
    const busy = [
      state("jenkins") === "running" && (s.jenkins ? "Jenkins tourne" : "Jenkins n'a pas encore démarré sur ce commit"),
      state("sonar") === "running" && (s.sonar ? "Sonar analyse" : "Sonar n'a pas encore démarré sur ce commit"),
    ].filter(Boolean);
    return out(LABELS.waiting, `CI en cours : ${busy.length ? busy.join(", ") : "un check tourne"}`);
  } else if (state("sonar") === "ko" && e.attempts.sonar < BUDGET) {
    step = "sonar";
  } else {
    if (state("sonar") === "ko") {
      refuse("sonar", s.sonar.failed ? `quality gate Sonar encore en échec après ${BUDGET} corrections`
        : `Sonar remonte encore des problèmes après ${BUDGET} corrections`);
      if (s.sonar.failed) return out(LABELS.yours, yours, null, toast);
    }
    const silent = e.silent[s.head] ?? [];
    if (!s.draft) {
      // Another check blocks: a Sonar blocker kept from refuse() above would open the wrong page.
      if (s.failing) { e.blocker = null; return out(LABELS.yours, "un check en échec que la surveillance ne corrige pas (ni Jenkins ni Sonar)", null, toast); }
      if (!s.reported && ctx.hasCi) return out(LABELS.waiting, "aucun check sur ce commit : attente de la CI du repo");
      step = REVIEW.find((r) => (r !== "qa" || ctx.hasQa) && (r !== "pr-demo" || ctx.hasDemo) && !s.markers.has(r) && !silent.includes(r));
      // Fixups stay for the reviewers' "changes since last review" until a human approves, or pr-risk asks for none.
      if (!step && (s.approved || noHuman(s)) && s.fixups) {
        if ((e.attempts.squash ?? 0) >= BUDGET) refuse("squash", `commits fixup! encore là après ${BUDGET} squashs`);
        else step = "squash";
      }
    }
    if (!step) {
      if (yours) return out(LABELS.yours, yours, null, toast);
      const ci = s.reported ? "CI verte" : ctx.hasCi ? "aucun check" : "pas de CI";
      if (s.draft) return out(LABELS.draft, `${ci}, pas de review sur un brouillon`);
      const done = REVIEW.filter((r) => s.markers.has(r));
      return out(LABELS.ok, [ci, done.length && `faits : ${done.join(", ")}`, !s.approved && noHuman(s) && "pr-risk : 0 revue humaine, merge à toi", silent.length && `fermés sans commentaire : ${silent.join(", ")}`,
        !ctx.hasDemo && !s.markers.has("pr-demo") && "pas de pr-demo (pas de section ## Demo dans AGENTS.md ni CLAUDE.md)",
        !ctx.hasQa && !s.markers.has("qa") && "pas de qa (skill absent du clone)"].filter(Boolean).join(" ; "));
    }
  }

  const blocked = !ctx.on ? "surveillance coupée" : ctx.slots <= 0 ? "tous les agents de surveillance sont pris"
    : KARADOC.includes(step) && !ctx.karadocFree ? "karadoc occupé par un autre pr-demo ou qa"
    : KARADOC.includes(step) && ctx.app ? `#${ctx.app} occupe déjà l'appli de ce dépôt` : null;
  if (blocked) {
    const why = `${step} à lancer, mais ${blocked}`;
    return out(yours ? LABELS.yours : LABELS.waiting, yours ? `${yours} ; ${why}` : why, null, toast);
  }
  if (!REVIEW.includes(step)) e.attempts[step] = (e.attempts[step] ?? 0) + 1;
  e.launched = { step, head: s.head, tab: tabName(s.number, step) };
  return out(LABELS.running, `agent ${step} lancé sur ${short(s.head)}`, step, toast);
}

// A launch that could not start: the attempt is not counted and nothing runs.
export function undoLaunch(entry, step, label, error = null, why = null) {
  const attempts = { ...entry.attempts };
  if (!REVIEW.includes(step)) attempts[step]--;
  return { ...entry, attempts, launched: null, label, error, why: why ?? `${step} n'a pas pu démarrer` };
}

// The first message of a watch agent. Fixes push to the PR branch through an explicit refspec.
export function promptFor(step, s) {
  const push = `git push origin HEAD:refs/heads/${s.branch}`;
  const folder = "Ce dossier est un worktree détaché réservé à la surveillance des PR.";
  switch (step) {
    case "jenkins": {
      const { url, jobPath, number } = s.jenkins;
      return `Le build Jenkins de ${s.url} a échoué sur ${s.head.slice(0, 8)} (${url}). ${folder} `
        + `Lis le log avec \`jk log ${jobPath} ${number}\` ; sans VPN, Jenkins est injoignable : dis-le et arrête-toi. `
        + `Si l'échec vient du code de la PR, corrige, commite et pousse avec \`${push}\` (jamais de push forcé, jamais sur une autre branche). `
        + `S'il vient de l'infrastructure ou d'un test instable, relance avec \`jk run rerun ${jobPath} ${number}\` sans rien pousser.`;
    }
    case "sonar":
      return `Sonar remonte des problèmes sur ${s.url} (${s.sonar.url}). ${folder} `
        + `Lis les nouvelles issues et les security hotspots de la pull request ${s.number} : sur sonarcloud.io avec la CLI \`sonar\` (\`sonar list issues -p <clé> --pull-request ${s.number}\`, et \`sonar api get "/api/hotspots/search?projectKey=<clé>&pullRequest=${s.number}&status=TO_REVIEW"\` pour les hotspots, la clé étant le paramètre \`id\` de l'URL Sonar ci-dessus ; pas de MCP SonarQube), `
        + `sur un SonarQube interne avec son API web. Si tu ne peux pas les lire, dis-le et arrête-toi. Sinon `
        + `corrige-les tous, bloquants ou non. Commite et pousse avec \`${push}\` (jamais de push forcé, jamais sur une autre branche).`;
    case "rebase":
      return `${s.url} est en conflit avec sa base ${s.base}. ${folder} `
        + `Rebase (le bail du push est le commit d'où il part, ORIG_HEAD) avec \`git fetch origin ${s.base} && git rebase --no-autosquash origin/${s.base}\` et résous les conflits en gardant l'intention des deux côtés. `
        + `Si un conflit est ambigu, \`git rebase --abort\`, dis pourquoi et arrête-toi. Sinon compile et lance les tests des fichiers en conflit, `
        + `puis pousse avec \`git push --force-with-lease=${s.branch}:$(git rev-parse ORIG_HEAD) origin HEAD:refs/heads/${s.branch}\` (seul push forcé permis, jamais sur une autre branche).`;
    case "squash":
      return `Les commits fixup!/amend!/squash! de ${s.url} ne s'appliquent pas sans conflit. ${folder} `
        + `Lance \`git -c sequence.editor=: rebase -i --autosquash --no-update-refs $(git merge-base origin/${s.base} HEAD)\` et résous chaque conflit : le code final doit rester celui de ${s.head.slice(0, 8)}. `
        + `Avant de pousser, \`git diff --quiet ${s.head} HEAD\` doit réussir ; sinon, ou si un conflit est ambigu, \`git rebase --abort\`, dis pourquoi et arrête-toi. `
        + `Pousse avec \`git push --force-with-lease=${s.branch}:${s.head} origin HEAD:refs/heads/${s.branch}\` (seul push forcé permis, jamais sur une autre branche).`;
    case "pr-review":
      return `/pr-review ${s.url} --fix --copilot\n\n${folder}`;
    case "pr-demo":
      return `/pr-demo ${s.url} --narrate --auto\n\nNarration et légendes en français, quelle que soit la langue de la description.`;
    case "qa":
      return `/testing-api-pull-requests ${s.url}\n\nArrête-toi une fois le rapport posté (étape 7) : aucune correction, aucun push.`;
    default:
      return `/${step} ${s.url}`;
  }
}

// `git remote get-url origin` → owner/name on GitHub, or null.
export function repoOfRemote(url) {
  return /github\.com[:/]([^/\s]+\/[^/\s]+?)(?:\.git)?\/?\s*$/.exec(url ?? "")?.[1] ?? null;
}

// The PRs waiting on me: labelled « à toi » by the watch, or a watched PR whose armed merge GitHub refused. Keys "owner/repo#N".
// A refused merge outside the watch (merged by hand, not my PR) has no row to clear it from: not counted.
export function waitingOnMe(prs, merges) {
  const keys = new Set(Object.entries(prs ?? {}).filter(([, e]) => e?.label === LABELS.yours).map(([k]) => k));
  for (const [k, m] of Object.entries(merges ?? {})) if (m?.refused && k in (prs ?? {})) keys.add(k);
  return [...keys];
}

// What to do about a gh error reading a PR, from its first stderr line: the cause when gh says it, else the retry.
export function readHint(message) {
  const m = message ?? "";
  if (/could not resolve host|error connecting to|i\/o timeout|timed? ?out|connection (refused|reset)|network is unreachable|dial tcp|EOF/i.test(m)) return "réseau ou VPN ?";
  if (/HTTP 401|bad credentials|authentication|gh auth login/i.test(m)) return "connexion gh expirée, lance gh auth status";
  // A 403 is not always the rate limit: an organization's SAML SSO refuses a token it has not authorized.
  if (/SAML/i.test(m)) return "jeton gh pas autorisé pour l'organisation (SAML), lance gh auth refresh";
  if (/rate limit/i.test(m)) return "limite de l'API GitHub, réessayé au prochain tour";
  if (/command not found|no such file or directory.*\bgh\b|ENOENT/i.test(m)) return "gh introuvable dans le PATH de Herdr";
  if (/HTTP 404|could not resolve to a pullrequest/i.test(m)) return "PR introuvable (supprimée, ou dépôt renommé ?)";
  return "réessayé au prochain tour";
}
