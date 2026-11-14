// One round of the PR watch: gh, git and Herdr side effects around the pure decisions of watch.js.
import { exec, spaces, agents, panes, run, notify, readTextFile, home, shared, setShared } from "herdr";
import { searchSince, signalsOf, decide, emptyEntry, promptFor, repoOfRemote, undoLaunch, holdingTabs, checkoutBases, LABELS } from "./watch.js";

const MAX_AGENTS = 3;
const KARADOC = ["pr-demo", "qa"];
const LEASE = "pr-watch-lease";
const LEASE_MS = 240000; // a round older than this died without clearing its lease
const VIEW_FIELDS = "number,title,url,isDraft,headRefName,headRefOid,statusCheckRollup,comments";

const firstLine = (text) => (text ?? "").trim().split("\n")[0] || null;

// A program's stdout; a nonzero exit throws its first stderr line.
async function sh(cmd, args, cwd) {
  const r = await exec(cmd, args, { cwd, timeout: 120000 });
  if (r.code !== 0) throw new Error(firstLine(r.stderr) ?? `${cmd} ${args[0]} : code ${r.code}`);
  return r.stdout;
}

async function signals(pr, me, before) {
  const repo = pr.repository.nameWithOwner;
  try {
    const view = JSON.parse(await sh("gh", ["pr", "view", String(pr.number), "-R", repo, "--json", VIEW_FIELDS]));
    const runs = JSON.parse(await sh("gh", ["api", `repos/${repo}/commits/${view.headRefOid}/check-runs?per_page=100`]));
    return signalsOf({ ...view, repo }, runs.check_runs, me);
  } catch (e) {
    const url = `https://github.com/${repo}/pull/${pr.number}`;
    return { key: `${repo}#${pr.number}`, repo, number: pr.number, url, title: before?.title ?? "", error: e.message };
  }
}

// The main checkout of a local clone of repo (owner/name), or null.
async function findClone(repo) {
  const name = repo.split("/")[1];
  const local = spaces().filter((s) => !s.machine);
  const tabs = new Set(local.flatMap((s) => s.tabs.map((t) => t.id)));
  const watchDir = `${home()}/dev/agents-worktree/${name}`;
  const ls = await exec("find", [watchDir, "-mindepth", "1", "-maxdepth", "1", "-type", "d"]).catch(() => null);
  const folders = [
    ...local.map((s) => s.folder),
    ...panes().filter((p) => tabs.has(p.tab)).map((p) => p.cwd),
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

async function cloneOf(repo) {
  const clone = await findClone(repo);
  // Without the marker in its report template, a QA would be relaunched on every head.
  const report = (dir) => readTextFile(`${clone}/${dir}/skills/testing-api-pull-requests/references/report.md`);
  const hasQa = clone !== null && /^<!-- testing-api-pull-requests -->$/m.test((await report(".agents")) ?? (await report(".claude")) ?? "");
  return { clone, hasQa };
}

// The watch's own worktree for branch, detached on origin/<branch>; dirty when an agent left work in it.
export async function prepareWorktree(clone, repo, branch) {
  const path = `${home()}/dev/agents-worktree/${repo.split("/")[1]}/${branch}-watch`;
  await sh("git", ["-C", clone, "fetch", "origin", branch]);
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

function start(path, name, task) {
  const space = spaces().find((s) => !s.machine && s.folder === path);
  if (space) run("tab.new", { space: space.id, folder: path, name, argv: ["claude"], task });
  else run("space.new", { folder: path, tab: name, argv: ["claude"], task });
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
  };
}

// Only the current head's finished-without-comment steps matter: keeps the registry bounded.
const pruned = (e) => {
  const silent = e.silent ?? {};
  return { ...e, silent: silent[e.head] ? { [e.head]: silent[e.head] } : {} };
};

// One watch round: reads my open PRs, decides, launches; returns the new registry, or null when another round
// holds the lease (two status-jc copies must not launch twice). `cache` keeps `me` and this copy's lease id.
export async function round(registry, cache = {}) {
  const at = Date.now();
  cache.lease ??= `${at}-${Math.random()}`;
  const lease = shared(LEASE);
  if (lease && lease.id !== cache.lease && at - lease.at < LEASE_MS) return null;
  setShared(LEASE, { at, id: cache.lease });
  try {
    return await roundUnderLease(registry, cache, at);
  } finally {
    if (shared(LEASE)?.id === cache.lease) setShared(LEASE, null);
  }
}

async function roundUnderLease(registry, cache, at) {
  let found;
  try {
    cache.me ??= (await sh("gh", ["api", "user", "--jq", ".login"])).trim();
    found = JSON.parse(await sh("gh", ["search", "prs", "--author=@me", "--state=open", "--owner=softwarevidal",
      `--updated=>=${searchSince(new Date())}`, "--json", "number,repository,updatedAt"]));
  } catch (e) {
    return { ...registry, error: e.message, at };
  }

  const all = await Promise.all(found.map((pr) => signals(pr, cache.me, registry.prs[`${pr.repository.nameWithOwner}#${pr.number}`])));
  const repos = new Map();
  for (const repo of new Set(all.map((s) => s.repo))) repos.set(repo, await cloneOf(repo));

  const launched = []; // tab names started this round: running before agents() lists them
  const prs = {};
  for (const s of all) {
    const before = registry.prs[s.key] ?? emptyEntry();
    try {
      const busy = [...new Set([...heldTabs(all), ...launched])];
      const { clone, hasQa } = repos.get(s.repo);
      const ctx = { on: registry.on, slots: MAX_AGENTS - busy.length, karadocFree: !busy.some((t) => KARADOC.some((k) => t.endsWith(` ${k}`))), hasQa };
      const tab = { ...tabOf(before), busy: busy.some((t) => t.startsWith(`⟳ #${s.number} `)) };
      const r = decide(s, before, tab, ctx);
      if (r.toast) notify({ title: r.toast, body: s.url, level: "warning" });
      let entry = r.entry;
      if (r.launch) {
        if (clone === null) entry = undoLaunch(entry, r.launch, LABELS.noClone);
        else {
          try {
            const wt = await prepareWorktree(clone, s.repo, s.branch);
            if (wt.dirty) entry = undoLaunch(entry, r.launch, LABELS.yours);
            else {
              start(wt.path, entry.launched.tab, promptFor(r.launch, s));
              launched.push(entry.launched.tab);
            }
          } catch (e) {
            entry = undoLaunch(entry, r.launch, LABELS.error, e.message);
          }
        }
      }
      prs[s.key] = pruned(entry);
    } catch (e) {
      // One broken PR keeps the others' launch records.
      prs[s.key] = pruned({ ...before, label: LABELS.error, error: e?.message ?? String(e) });
    }
  }
  return { ...registry, prs, error: null, at };
}
