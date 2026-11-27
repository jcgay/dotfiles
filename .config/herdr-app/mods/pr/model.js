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

// checks() without the ones pointing at `build` (the Build row shows it); another Jenkins job stays.
export function otherChecks(list, build) {
  return list.filter((c) => { const j = jenkinsBuild(c.url); return !(j && build && j.jobPath === build.jobPath && j.number === build.number); });
}

// checks() → { state: the worst one, text: "1 en échec · 1 en cours · 2 ✓" }, or null when none.
export function summary(list) {
  if (!list.length) return null;
  const n = (s) => list.filter((c) => c.state === s).length, ko = n("ko"), running = n("running"), ok = n("ok");
  const text = [ko && `${ko} en échec`, running && `${running} en cours`, ok && `${ok} ✓`].filter(Boolean).join(" · ");
  return { state: ko ? "ko" : running ? "running" : "ok", text };
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

// A Map used as a bounded cache: writing a key makes it the newest, and past `max` keys the
// oldest go, so a Herdr left open for days does not keep every space or build it ever showed.
export function remember(map, key, value, max) {
  map.delete(key); map.set(key, value);
  while (map.size > max) map.delete(map.keys().next().value);
  return value;
}

// The watch list (status-jc writes its registry, pipeline.js its band and clock).

// A watched PR's clock → its line's first words: the running step, the time to ready-to-approve, or "dépend de toi".
export function clockText(clock, now) {
  if (!clock) return null;
  if (clock.yours) return "dépend de toi";
  return [
    clock.step && clock.since != null && `${clock.step} depuis ${minutes(now - clock.since)}`,
    clock.readyAt && (clock.readyAt > now ? `prête à approuver dans ~${minutes(clock.readyAt - now)}` : "prête à approuver bientôt"),
  ].filter(Boolean).join(" · ") || null;
}

const holds = (folder, f) => f === folder || f.startsWith(`${folder}/`);

// What ⌨ shows for entry.work ({ folder, exists } or null without a clone), given the folders local spaces show.
export function workLook(work, folders) {
  const shown = Boolean(work?.folder) && folders.some((f) => holds(work.folder, f));
  const tip = !work ? "Travailler dessus" : shown ? "Aller au space" : work.exists ? "Ouvrir le worktree" : "Créer le worktree et travailler dessus";
  return { tip, missing: Boolean(work) && !work.exists, shown };
}

// ~/dev is a symlink (to /Volumes/sourcecode): Herdr shows a space in either form, git prints the resolved one.
// path under link → the same under real; real null (not resolved yet): unchanged.
export function realFolder(path, link, real) {
  if (!real || !(path === link || path.startsWith(`${link}/`))) return path;
  return real + path.slice(link.length);
}

// The name of the local space showing entry.work's folder, or null. spaces: [{ name, folders }].
export function spaceShowing(work, spaces) {
  if (!work?.folder) return null;
  return spaces.find((s) => s.folders.some((f) => holds(work.folder, f)))?.name ?? null;
}

// The watch list's sections: « À toi » (status-jc's waitingOnMe, copied: a label « à toi » or a refused merge), then one
// per repo, the repo of the most urgent PR first, then by name. Within a section: by rank, registry order on a tie.
// entries: [key "owner/repo#N", entry], merges: shared("pr-merge"), rank: label → number (lower first).
export function watchSections(entries, merges, rank) {
  const byRank = (rows) => [...rows].sort(([, a], [, b]) => rank(a.label) - rank(b.label));
  const mine = entries.filter(([k, e]) => e.label === "à toi" || merges?.[k]?.refused);
  const rest = entries.filter((x) => !mine.includes(x));
  const repos = new Map();
  for (const x of rest) { const repo = x[0].split("#")[0]; repos.set(repo, [...(repos.get(repo) ?? []), x]); }
  const names = [...repos.keys()].map((r) => r.split("/").pop());
  const groups = [...repos].map(([repo, rows]) => {
    const short = repo.split("/").pop();
    return { title: names.filter((n) => n === short).length > 1 ? repo : short, repo, rows: byRank(rows), best: Math.min(...rows.map(([, e]) => rank(e.label))) };
  }).sort((a, b) => a.best - b.best || a.title.localeCompare(b.title)).map(({ best, ...g }) => g);
  return [...(mine.length ? [{ title: "À toi", repo: null, rows: byRank(mine) }] : []), ...groups];
}

// The row's ⤵ and ⇥/✕: merge and squash are the PR's requests in shared("pr-merge") and shared("pr-squash").
// picked: the row the keyboard picked. A squash is a force push: before approval it wipes the reviewer's "changes since
// last review", so a ready PR offers it only once approved (chipLabel « squash à venir ») or on the picked row; a draft
// has no reviewer. The Pull request panel keeps it at any time.
export function rowActions(entry, merge, squash, picked = false) {
  const cleared = entry.draft === true || picked || entry.approved === true || chipLabel(entry, null) === "squash à venir";
  return {
    squash: entry.fixups > 0 && (!squash || squash.state === "error") && cleared,
    // status-jc cancels a merge armed over fixup! commits; after a squash the stale count hides ⇥ until the next round.
    arm: entry.draft === false && entry.head ? (merge ? (merge.refused ? "refused" : "disarm") : entry.fixups > 0 ? null : "arm") : null,
  };
}

// The nine slots of a band (a draft's band has three): an armed merge runs, a refused one failed.
// merge: the PR's shared("pr-merge") entry (true stands for armed).
export function bandStates(band, merge) {
  const last = !merge ? null : merge.refused ? "ko" : "run";
  return Array.from({ length: 9 }, (_, i) => (i === 8 && last && band.length === 9 ? last : band[i] ?? null));
}

// The Claude session behind a band cell: the last agent launched for that step (git: rebase or squash). sessions: entry.sessions.
const CELL_STEPS = { git: ["rebase", "squash"], jenk: ["jenkins"], sonar: ["sonar"], rev: ["pr-review"], qa: ["qa"], demo: ["pr-demo"], risk: ["pr-risk"] };
export function sessionOf(sessions, cell) {
  return (CELL_STEPS[cell] ?? []).map((step) => sessions?.[step] && { step, ...sessions[step] }).filter(Boolean)
    .sort((a, b) => b.at - a.at)[0] ?? null;
}

// The header's round: running (or asked through ↻), when the next comes, or none yet. every: 5 min before it was written.
export function nextRound(reg, asked, now) {
  if (reg?.running || asked) return "tour en cours";
  if (!reg?.at) return "pas encore de tour";
  return `tour dans ${minutes(Math.max(60000, (reg.next ?? reg.at + (reg.every ?? 300000)) - now))}`;
}

// A watched PR's entry is a draft: its draft flag (a paused draft's label is "en pause"), or the label of a registry
// written before status-jc kept the flag.
export function isDraft(entry) {
  return entry.draft ?? entry.label === "brouillon";
}

// Hidden by the drafts chip: a draft, unless it needs me.
export function hiddenDraft(entry, hideDrafts) {
  return hideDrafts && isDraft(entry) && !["à toi", "erreur", "pas de clone local"].includes(entry.label);
}

// The watch row selected after an arrow key: keys in display order, sel the selected key (or one gone), delta ±1.
// Nothing selected yet, or the selection gone: the first row. Stops at both ends.
export function moveSel(keys, sel, delta) {
  if (keys.length === 0) return null;
  const i = keys.indexOf(sel);
  if (i < 0) return keys[0];
  return keys[Math.min(keys.length - 1, Math.max(0, i + delta))];
}

// A repo's JetBrains icon, as the spaces and projects panels show it. Copied from projects/lib.js (a mod cannot import
// another mod's files): the copy script prints "name\tlight\tdark" per repo of ~/dev that has one.
export function parseIcons(stdout, dir) {
  const out = {};
  for (const l of stdout.split("\n")) {
    const [name, light, dark] = l.split("\t");
    if (name && light) out[name] = { light: `${dir}/${light}`, dark: `${dir}/${dark || light}` };
  }
  return out;
}

// The avatar of a repo without icon: its first letter, as a space's (owner/name: the name's).
export const repoLetter = (repo) => [...(repo.split("/").pop() ?? "")][0]?.toUpperCase() ?? "?";

// The watch list's filter: every word of query (any case) appears in the PR's repo, title, space or #number.
// key "owner/repo#N", space: the name of the space showing it, or null.
export function matchesFilter(key, entry, space, query) {
  const [repo, number] = key.split("#");
  const text = `${repo} ${entry.title ?? ""} ${space ?? ""} #${number}`.toLowerCase();
  return query.toLowerCase().split(/\s+/).filter(Boolean).every((w) => text.includes(w));
}

// The chip of a watched PR. status-jc's « ok » means the watch has nothing left to do; the chip says who acts next,
// read from the band's appr cell (pipeline.js bandOf: wait = a reviewer must approve) and the PR's armed merge.
export function chipLabel(entry, merge) {
  if (entry.label !== "ok") return entry.label ?? "";
  if (merge && !merge.refused) return "merge armé";
  const appr = Array.isArray(entry.band) && entry.band.length === 9 ? entry.band[7] : null;
  if (appr === "wait") return "attend relecture";
  if (appr === "ok") return "prête à merger";
  if (appr === "todo" && entry.fixups > 0) return "squash à venir";
  return "ok";
}

// The right-click menu of a watch row: its own actions first (as under the row), then open, work on, pause. The menu
// is a deliberate choice, like the row picked from the keyboard, so it offers the squash too. ctx: { merge, squash,
// paused, aside } (aside: a draft status-jc leaves aside, with no entry: ready for review, open, work on).
const BLOCKER_VERBS = { jenkins: "Ouvrir le log Jenkins", sonar: "Ouvrir l'analyse Sonar" };
export function menuItems(entry, { merge = null, squash = null, paused = false, aside = false } = {}) {
  const common = [{ id: "open", label: "Ouvrir la PR" }, { id: "work", label: "Travailler dessus" }];
  if (aside) return [{ id: "ready", label: "Passer prête pour review" }, ...common];
  const can = rowActions(entry, merge, squash, true);
  return [
    entry.label === "à toi" && entry.blocker?.url && { id: "blocker", label: BLOCKER_VERBS[entry.blocker.step] ?? "Ouvrir le check en échec" },
    isDraft(entry) && { id: "ready", label: "Passer prête pour review" },
    can.arm === "arm" && { id: "arm", label: "Merger quand tout est vert" },
    can.arm === "disarm" && { id: "disarm", label: "Désarmer le merge" },
    can.arm === "refused" && { id: "clear", label: "Effacer le refus du merge" },
    can.squash && { id: "squash", label: `Squasher ${entry.fixups} fixup! (push forcé)` },
    ...common,
    paused ? { id: "resume", label: "Reprendre la surveillance" } : { id: "pause", label: "Mettre en pause" },
  ].filter(Boolean);
}

// The « à toi » violet: the theme's ansi5 with its saturation and lightness, its hue turned to violet (270°). Some
// themes' ansi5 is a magenta (gruvbox #b16286) that read as the band's red failure; a mix with ansi4 went gray there.
// status-jc's bar has a copy (a mod cannot import another's files).
export function violetOf(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex ?? "");
  if (!m) return hex;
  const [r, g, b] = m.slice(1).map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  const s = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
  // Back from HSL with h = 270°.
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((270 / 60) % 2) - 1)), o = l - c / 2;
  const [rr, gg, bb] = [x, 0, c]; // 240° ≤ h < 300°: (x, 0, c)
  return `#${[rr, gg, bb].map((v) => Math.round((v + o) * 255).toString(16).padStart(2, "0")).join("")}`;
}
