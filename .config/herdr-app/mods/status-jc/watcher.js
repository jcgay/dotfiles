// One round of the PR watch: gh, git and Herdr side effects around the pure decisions of watch.js.
import { exec, spaces, agents, panes, machines, run, notify, home, shared, setShared } from "herdr";
import { randomUUID } from "crypto";
import { watchPath } from "./open.js";
import { roundLines, searchLine } from "./journal.js";
import { appendJournal } from "./journal-file.js";
import { readHint, searchSince, ownerArgs, signalsOf, withRiskTree, decide, emptyEntry, promptFor, repoOfRemote, undoLaunch, holdingTabs, karadocHeld, karadocHolder, appTaken, closing, stoppedQa, freshTabs, checkoutBases, checkoutsOf, draftShown, watchedNow, asideDrafts, LABELS } from "./watch.js";
import { bandOf, measure, addSamples, clockOf, workOf } from "./pipeline.js";

const MAX_AGENTS = 3; // default; the PR panel's header sets pr-watch.maxAgents
const LEASE = "pr-watch-lease";
const LEASE_MS = 240000; // a round older than this died without clearing its lease
const VIEW_FIELDS = "number,title,url,isDraft,headRefName,headRefOid,statusCheckRollup,comments,reviews,mergeable,baseRefName,reviewDecision,commits";

const firstLine = (text) => (text ?? "").trim().split("\n")[0] || null;

// A program's stdout; a nonzero exit throws its first stderr line.
export async function sh(cmd, args, cwd, timeout = 120000) {
  const r = await exec(cmd, args, { cwd, timeout });
  if (r.code !== 0) throw new Error(firstLine(r.stderr) ?? `${cmd} ${args[0]} : code ${r.code}`);
  return r.stdout;
}

// Whether two commits have the same tree: true, false, or null when gh cannot tell (a sha gone after a force-push).
// trees: sha -> tree sha, kept across rounds (a commit's tree never changes).
// shortcut: a failed lookup is asked again each round (one gh call per such PR), cache failures if the rate limit suffers
async function sameTree(repo, a, b, trees) {
  try {
    for (const sha of [a, b]) trees[sha] ??= (await sh("gh", ["api", `repos/${repo}/commits/${sha}`, "--jq", ".commit.tree.sha"])).trim();
    return trees[a] === trees[b];
  } catch {
    return null;
  }
}

async function signals(pr, me, before, trees) {
  const repo = pr.repository.nameWithOwner;
  try {
    const view = JSON.parse(await sh("gh", ["pr", "view", String(pr.number), "-R", repo, "--json", VIEW_FIELDS]));
    const runs = JSON.parse(await sh("gh", ["api", `repos/${repo}/commits/${view.headRefOid}/check-runs?per_page=100`]));
    const s = signalsOf({ ...view, repo }, runs.check_runs, me);
    // A verdict on another commit still holds on the same code (a squash keeps the tree).
    return s.risk?.sha && s.risk.onHead !== true ? withRiskTree(s, await sameTree(repo, s.risk.sha, s.head, trees)) : s;
  } catch (e) {
    const url = `https://github.com/${repo}/pull/${pr.number}`;
    return { key: `${repo}#${pr.number}`, repo, number: pr.number, url, title: before?.title ?? "", error: e.message };
  }
}

// Every folder a local space shows: its own and its panes' cwds.
export function localFolders() {
  const local = spaces().filter((s) => !s.machine);
  const tabs = new Set(local.flatMap((s) => s.tabs.map((t) => t.id)));
  return [...new Set([...local.map((s) => s.folder), ...panes().filter((p) => tabs.has(p.tab)).map((p) => p.cwd)].filter(Boolean))];
}

// The main checkout of a local clone of repo (owner/name), or null.
export async function findClone(repo) {
  const name = repo.split("/")[1];
  const watchDir = `${home()}/dev/agents-worktree/${name}`;
  const ls = await exec("find", [watchDir, "-mindepth", "1", "-maxdepth", "1", "-type", "d"]).catch(() => null);
  const folders = [
    ...localFolders(),
    ...(ls?.stdout.split("\n") ?? []),
    `/Volumes/sourcecode/${name}`,
  ].filter(Boolean);
  for (const folder of new Set(folders)) {
    try {
      if (repoOfRemote(await sh("git", ["remote", "get-url", "origin"], folder)) !== repo) continue;
      const common = (await sh("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], folder)).trim();
      return common.replace(/\/[^/]+$/, "");
    } catch {
      // not a folder or not a git checkout: next one
    }
  }
  return null;
}

// A clone found in an earlier round is kept while its origin is still repo: one git call instead
// of two per open folder. A move or a deleted clone looks again; no clone found is not kept.
async function knownClone(repo, clones) {
  const known = clones.get(repo);
  if (known) {
    const origin = await sh("git", ["remote", "get-url", "origin"], known).catch(() => null);
    if (origin && repoOfRemote(origin) === repo) return known;
  }
  return findClone(repo);
}

async function cloneOf(repo, clones) {
  const clone = await knownClone(repo, clones);
  // Without the marker in its report template, a QA would be relaunched on every head.
  // Read on the default branch as last fetched, never the checked-out one: the clone may sit on a PR that adds the
  // Jenkinsfile or the "## Demo" section, and the repo has neither until it is merged. origin/HEAD is unset in some clones.
  const git = (...args) => exec("git", ["-C", clone, ...args]);
  let base = null;
  for (const ref of ["origin/HEAD", "origin/main", "origin/master"]) {
    if (clone !== null && (await git("rev-parse", "--verify", "-q", `${ref}^{commit}`)).code === 0) { base = ref; break; }
  }
  const read = async (path) => {
    if (base === null) return null;
    const r = await git("show", `${base}:${path}`);
    return r.code === 0 ? r.stdout : null;
  };
  const has = async (path) => base !== null && (await git("cat-file", "-e", `${base}:${path}`)).code === 0;
  const report = (dir) => read(`${dir}/skills/testing-api-pull-requests/references/report.md`);
  const hasQa = clone !== null && /^<!-- testing-api-pull-requests -->$/m.test((await report(".agents")) ?? (await report(".claude")) ?? "");
  // pr-demo stops without a "## Demo" section telling how to start the app. No clone: kept, so its launch says "pas de clone local".
  const demo = async (file) => /^## Demo\s*$/m.test((await read(file)) ?? "");
  const hasDemo = clone === null || (await demo("AGENTS.md")) || (await demo("CLAUDE.md"));
  // A PR adding the first CI is seen without CI.
  const hasCi = (await has("Jenkinsfile")) || (await has(".github/workflows"));
  // karadoc is arthur's module: only repos that hold it run it on its fixed ports
  // ⌨'s worktree, read before this round's launches: one created now shows at the next round.
  const listed = clone === null ? null : await exec("git", ["-C", clone, "worktree", "list", "--porcelain"]);
  return { clone, hasQa, hasDemo, hasCi, hasKaradoc: await has("karadoc"), worktrees: listed?.code === 0 ? listed.stdout : "" };
}

// The watch's own worktree for branch, detached on origin/<branch>; dirty when an agent left work in it, busy (the
// folder) when I have branch checked out with work origin lacks: an agent would redo it.
// paused: asked after the fetch, the one long step: the PR panel's ⌨ may have opened this worktree meanwhile.
export async function prepareWorktree(clone, repo, branch, paused = () => false) {
  const path = watchPath(home(), repo, branch);
  await sh("git", ["-C", clone, "fetch", "origin", branch]);
  if (paused()) return { paused: true };
  // What origin/<branch> pointed to: once a rebase agent force-pushed, my synced checkout holds commits origin no longer has.
  const pointed = await exec("git", ["-C", clone, "reflog", "show", "--format=%H", `refs/remotes/origin/${branch}`]);
  const pushed = pointed.code === 0 ? pointed.stdout.split("\n").filter(Boolean) : [];
  for (const folder of checkoutsOf(await sh("git", ["-C", clone, "worktree", "list", "--porcelain"]), branch)) {
    // My live checkout: git status must not take its index lock under a commit of mine.
    try {
      if ((await sh("git", ["--no-optional-locks", "status", "--porcelain"], folder)).trim()
        || (await sh("git", ["rev-list", "HEAD", "--not", "--remotes=origin", ...pushed], folder)).trim()) return { busy: folder };
    } catch {
      // git fails there (unmounted volume): it does not hold the PR
    }
  }
  if ((await exec("test", ["-e", path])).code !== 0) {
    await sh("git", ["-C", clone, "worktree", "add", "--detach", path, `origin/${branch}`]);
    return { path };
  }
  // Unpushed: commits on top of what the watch checked out and of anything origin/<branch> pointed to,
  // so a rebase + force-push of mine does not leave the agent's old base looking unpushed.
  const tracked = await exec("git", ["reflog", "show", "--format=%H", `refs/remotes/origin/${branch}`], { cwd: path });
  const bases = [
    ...checkoutBases(await sh("git", ["reflog", "show", "--format=%H|%gs", "HEAD"], path), branch),
    ...(tracked.code === 0 ? tracked.stdout.split("\n").filter(Boolean) : []),
  ];
  if ((await sh("git", ["status", "--porcelain"], path)).trim()
    || (await sh("git", ["rev-list", "HEAD", "--not", "--remotes=origin", ...bases], path)).trim()) return { dirty: true };
  await sh("git", ["checkout", "--detach", `origin/${branch}`], path);
  return { path };
}

// Folds the fixup!/amend!/squash! commits of a watch worktree checked out at s.head and force-pushes. Rebased on its own
// merge-base, so the code must not change: a different tree is put back and refused. false: the rebase stopped (a conflict),
// aborted, an agent has to solve it.
export async function autosquash(path, s) {
  if ((await sh("git", ["rev-parse", "HEAD"], path)).trim() !== s.head) throw new Error(`origin/${s.branch} n'est plus ${s.head.slice(0, 8)}`);
  await sh("git", ["fetch", "origin", s.base], path);
  const base = (await sh("git", ["merge-base", `origin/${s.base}`, "HEAD"], path)).trim();
  // squash! keeps both messages: core.editor=: takes git's combined message as is.
  const r = await exec("git", ["-c", "sequence.editor=:", "-c", "core.editor=:", "rebase", "-i", "--autosquash", "--no-update-refs", base], { cwd: path, timeout: 120000 });
  if (r.code !== 0) {
    await exec("git", ["rebase", "--abort"], { cwd: path });
    return false;
  }
  if ((await exec("git", ["diff", "--quiet", s.head, "HEAD"], { cwd: path })).code !== 0) {
    await sh("git", ["checkout", "--detach", s.head], path);
    throw new Error("le squash change le code (commit de merge ?) : rien poussé");
  }
  try {
    await sh("git", ["push", `--force-with-lease=${s.branch}:${s.head}`, "origin", `HEAD:refs/heads/${s.branch}`], path);
  } catch (e) {
    // Left on the squashed commits, the worktree would look unpushed and block every later step of the PR.
    await exec("git", ["checkout", "--detach", s.head], { cwd: path });
    throw e;
  }
  return true;
}

// A background launch: focus false keeps the user where they are. session: the Claude session id, so the PR panel can resume it.
export function start(path, name, task, session = randomUUID()) {
  const argv = ["claude", "--session-id", session];
  const space = spaces().find((s) => !s.machine && s.folder === path);
  if (space) run("tab.new", { space: space.id, folder: path, name, argv, task, focus: false });
  else run("space.new", { folder: path, tab: name, argv, task, focus: false });
}

// Every watch tab ("⟳ #<n> <step>") that holds its PR, given each watched PR's markers.
function heldTabs(all) {
  const names = new Set(spaces().flatMap((s) => s.tabs.map((t) => t.name)).filter((n) => n?.startsWith("⟳ ")));
  const list = agents();
  for (const a of list) if (a.tab_name.startsWith("⟳ ")) names.add(a.tab_name);
  const tabs = [...names].map((name) => ({ name, status: list.find((a) => a.tab_name === name)?.status ?? null }));
  // A PR whose signals failed this round has unknown markers: its review tabs keep holding.
  return holdingTabs(tabs, (n) => { const s = all.find((x) => x.number === n); return s ? s.markers ?? new Set() : null; });
}

function tabOf(entry) {
  const name = entry.launched?.tab;
  if (!name) return { exists: false, running: false };
  return {
    exists: spaces().some((s) => s.tabs.some((t) => t.name === name)),
    running: agents().some((a) => a.tab_name === name && ["working", "blocked"].includes(a.status)),
    working: agents().some((a) => a.tab_name === name && a.status === "working"),
  };
}

// Only the current head's finished-without-comment steps matter: keeps the registry bounded.
const pruned = (e) => {
  const silent = e.silent ?? {};
  return { ...e, silent: silent[e.head] ? { [e.head]: silent[e.head] } : {} };
};

// One watch round: reads my open PRs, decides, launches; returns the new registry, or null when another round
// holds or took the lease (two status-jc copies must not launch twice). `cache` keeps `me` and the clones found.
export async function round(registry, cache = {}, owners) {
  const at = Date.now();
  // One id per round, not per copy: a round main.js gave up on as stuck stops at its next PR if it ever resumes.
  const leaseId = `${at}-${Math.random()}`;
  const lease = shared(LEASE);
  if (lease && at - lease.at < LEASE_MS) return null;
  setShared(LEASE, { at, id: leaseId });
  // Only the copy running the round says so: a copy refused by the lease must not clear it.
  setShared("pr-watch", { ...(shared("pr-watch") ?? {}), running: true });
  try {
    return await roundUnderLease(registry, cache, at, owners, leaseId);
  } finally {
    if (shared(LEASE)?.id === leaseId) setShared(LEASE, null);
  }
}

async function roundUnderLease(registry, cache, at, owners, leaseId) {
  // Read after every long await: a round main.js gave up on as stuck must not launch, close tabs or write once it resumes.
  const held = () => shared(LEASE)?.id === leaseId;
  let found;
  try {
    cache.me ??= (await sh("gh", ["api", "user", "--jq", ".login"])).trim();
    found = JSON.parse(await sh("gh", ["search", "prs", "--author=@me", "--state=open", ...ownerArgs(owners),
      `--updated=>=${searchSince(new Date())}`, "--json", "number,repository,updatedAt"]));
  } catch (e) {
    // The common outage (network, gh logged out) stops here, before any PR: the journal hears of it on its second round.
    const searchFails = (registry.searchFails ?? 0) + 1;
    const line = searchLine(searchFails, registry.on, e.message);
    if (line) await appendJournal([line]);
    return { ...registry, error: `${e.message} (${readHint(e.message)})`, at, searchFails };
  }

  cache.trees ??= {}; // shortcut: never pruned (two shas per push), prune it if the app runs for months
  const read = await Promise.all(found.map((pr) => signals(pr, cache.me, registry.prs[`${pr.repository.nameWithOwner}#${pr.number}`] ?? registry.hidden?.[`${pr.repository.nameWithOwner}#${pr.number}`], cache.trees)));
  // Rebuilt each round from this round's repos: a repo with no open PR left drops out.
  const names = [...new Set(read.map((s) => s.repo))];
  const repos = new Map(await Promise.all(names.map(async (repo) => [repo, await cloneOf(repo, cache.clones ?? new Map())])));
  cache.clones = new Map([...repos].filter(([, r]) => r.clone).map(([repo, r]) => [repo, r.clone]));
  // A draft no local space or pane shows is left alone, as if merged: no agent, no row, its tabs close (watchedNow).
  const ready = machines().find((m) => m.name === null)?.layout === "ready";
  // ~/dev is a symlink: git prints a worktree's resolved path, Herdr may show the space in the other form. Only with a draft.
  const shown = localFolders();
  const folders = !read.some((s) => s.draft) ? [] : [...shown, ...(await Promise.all(shown.map((f) => sh("realpath", [f]).then((r) => r.trim()).catch(() => null)))).filter(Boolean)];
  const all = read.filter((s) => watchedNow(s, { ready, known: s.key in (registry.prs ?? {}), shown: () => draftShown(folders, repos.get(s.repo).worktrees, s.branch) }));
  // A draft left aside keeps its entry (attempts, sessions, clock) for when a space shows it again: otherwise its fix
  // agents get a fresh budget each time its space is reopened. Only drafts still open: the map stays bounded.
  const watched = new Set(all.map((s) => s.key));
  const aside = asideDrafts(read, watched, registry.hidden ?? {});
  const hidden = Object.fromEntries(aside.map((d) => [d.key, registry.prs?.[d.key] ?? registry.hidden?.[d.key]]).filter(([, e]) => e));

  const roundPrs = new Set(all.map((s) => s.number));
  const karadocPrs = new Set(all.filter((s) => repos.get(s.repo).hasKaradoc).map((s) => s.number));
  // A repo where Sonar never reported on any PR has no Sonar: its case is dotted, not green.
  const sonarRepos = new Set([...(registry.sonarRepos ?? []), ...all.filter((s) => s.sonar).map((s) => s.repo)]);
  const samples = []; // durations finished this round, for the step history
  const launched = []; // tab names started this round: running before agents() lists them
  const prs = {};
  const toasts = new Map(); // PR key → this round's toast, for the journal
  // Read live, as paused: the panel's − / + may change it during the round.
  const maxAgents = () => shared("pr-watch")?.maxAgents ?? MAX_AGENTS;
  // Read live too: switching the watch off mid-round must stop this round's launches, squashes and tab closing.
  const isOn = () => Boolean(shared("pr-watch")?.on);
  for (const s of all) {
    // A round may outlast LEASE_MS (gh timeouts, fetches): renewed per PR so another copy does not start a twin round.
    // Already lost (the reads above took longer): the copy that took it runs the round, this one stops and writes nothing.
    if (!held()) return null;
    setShared(LEASE, { at: Date.now(), id: leaseId });
    const before = registry.prs[s.key] ?? registry.hidden?.[s.key] ?? emptyEntry();
    try {
      const busy = [...new Set([...heldTabs(all), ...launched])];
      const { clone, hasQa, hasDemo, hasCi, hasKaradoc, worktrees } = repos.get(s.repo);
      // paused read live: the PR panel's ⌨ may have paused this PR since the round started.
      const ctx = { now: Date.now(), on: isOn(), paused: (shared("pr-watch")?.paused ?? registry.paused ?? []).includes(s.key), slots: maxAgents() - busy.length, karadocFree: !hasKaradoc || !karadocHeld(busy, karadocPrs, roundPrs), hasQa, hasDemo, hasCi,
        // busy holds this round's launches: two PRs of one round are covered.
        // shortcut: tabs name the PR number only, two repos' PRs of the same number share it; it only waits more
        app: appTaken(busy, all.filter((x) => x.repo === s.repo && x.number !== s.number).map((x) => x.number), roundPrs) };
      const tab = { ...tabOf(before), busy: busy.some((t) => t.startsWith(`⟳ #${s.number} `)) };
      const r = decide(s, before, tab, ctx);
      if (r.toast) { notify({ title: r.toast, body: s.url, level: "warning" }); toasts.set(s.key, r.toast); }
      let entry = r.entry;
      if (r.launch) {
        if (clone === null) entry = undoLaunch(entry, r.launch, LABELS.noClone, null, `aucun clone local de ${s.repo} pour lancer ${r.launch}`);
        else {
          try {
            const isPaused = () => (shared("pr-watch")?.paused ?? []).includes(s.key);
            const wt = await prepareWorktree(clone, s.repo, s.branch, isPaused);
            if (!held()) return null;
            if (wt.busy) entry = undoLaunch(entry, r.launch, LABELS.yours, null, `tu travailles sur ${s.branch} dans ${wt.busy.split("/").pop()} (non poussé)`);
            else if (wt.dirty) entry = undoLaunch(entry, r.launch, LABELS.yours, null, `le worktree de surveillance a du travail non poussé : ${r.launch} pas lancé`);
            // Paused during prepareWorktree's fetch: the user may already be working in this worktree.
            else if (wt.paused || isPaused()) entry = undoLaunch(entry, r.launch, LABELS.paused, null, `mise en pause pendant la préparation : ${r.launch} pas lancé`);
            else if (!isOn()) entry = undoLaunch(entry, r.launch, LABELS.waiting, null, `surveillance coupée pendant la préparation : ${r.launch} pas lancé`);
            else {
              // squash goes through git alone; only a conflict (false) needs its agent. A refusal spends the attempt.
              const squashed = r.launch === "squash" ? await autosquash(wt.path, s).catch((err) => err) : false;
              if (!held()) return null;
              if (squashed === true) entry = { ...entry, launched: null, label: LABELS.waiting, why: `fixups squashés et poussés sur ${s.branch}` };
              else if (squashed instanceof Error) entry = { ...entry, launched: null, label: LABELS.error, error: squashed.message, why: "squash refusé" };
              else {
                const id = randomUUID();
                start(wt.path, entry.launched.tab, promptFor(r.launch, s), id);
                launched.push(entry.launched.tab);
                // The last session of each step, for its badge in the PR panel (model.js sessionOf).
                entry = { ...entry, sessions: { ...entry.sessions, [r.launch]: { id, folder: wt.path, at: Date.now() } } };
              }
            }
          } catch (e) {
            entry = undoLaunch(entry, r.launch, LABELS.error, e.message, `préparation du worktree pour ${r.launch} impossible`);
          }
        }
      }
      if (!s.error) {
        if (entry.launched && entry.launched.at == null) entry = { ...entry, launched: { ...entry.launched, at: Date.now() } };
        const m = measure(before, entry, s, Date.now());
        samples.push(...m.samples);
        entry = {
          ...entry, ci: m.ci, fixups: s.fixups, draft: s.draft,
          band: bandOf(s, entry, { hasCi, hasQa, hasDemo, hasSonar: sonarRepos.has(s.repo) }),
          work: clone === null ? null : workOf(worktrees, { draft: s.draft, branch: s.branch, watch: watchPath(home(), s.repo, s.branch) }),
        };
      }
      prs[s.key] = pruned(entry);
    } catch (e) {
      // One broken PR keeps the others' launch records.
      // errorRounds 0: not a GitHub read error, the journal writes it at once.
      prs[s.key] = pruned({ ...before, label: LABELS.error, why: "la surveillance a planté sur cette PR", error: e?.message ?? String(e), errorRounds: 0 });
    }
  }
  if (!held()) return null;
  // After the PRs: decide() must still see the tab of a fix agent that pushed then stopped, or it takes that push for
  // mine and resets the attempts budget.
  if (isOn()) {
    // A watch space's folder is …/agents-worktree/<repo name>/<branch>-watch: tab names carry no repo. A PR whose signals
    // failed has no markers (null: its tabs stay); one missing from the round (undefined) is merged or closed.
    const markersOf = (n, folder) => {
      const s = all.find((x) => x.number === n && folder.includes(`/agents-worktree/${x.repo.split("/")[1]}/`));
      return s && (s.markers ?? null);
    };
    const local = spaces().filter((sp) => !sp.machine);
    // Every copy's rounds and the squash button share these entries: a tab another copy just opened is kept too.
    const fresh = new Set([...launched, ...freshTabs([...Object.values(registry.prs ?? {}), ...Object.values(prs)], shared("pr-squash"), Date.now())]);
    for (const { cmd, args } of closing(local, markersOf, cache.qaStopped, fresh)) {
      try { run(cmd, args); } catch { /* already gone */ }
    }
    cache.qaStopped = stoppedQa(local, markersOf, fresh);
  }
  await appendJournal(roundLines(registry, { on: registry.on, prs }, toasts));
  if (!held()) return null;
  const durations = addSamples(registry.durations ?? {}, samples);
  for (const key of Object.keys(prs)) prs[key] = { ...prs[key], clock: clockOf(prs[key], durations, Date.now()) };
  // For the panel's header: the watch agents at the end of the round and the one holding karadoc.
  const busy = [...new Set([...heldTabs(all), ...launched])];
  // journalOn: `on` as this round saw it, so the next round writes a switch made in between.
  return { ...registry, prs, hidden, aside, error: null, searchFails: 0, at, journalOn: registry.on, durations, sonarRepos: [...sonarRepos],
    agents: { busy: busy.length, max: maxAgents() }, karadoc: karadocHolder(busy, karadocPrs, roundPrs) };
}
