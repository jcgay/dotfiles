// Opening a watched PR to work on it: the PR panel writes { state: "asked" } in shared("pr-open"), this opens a space
// with Claude in its worktree. A draft gets its branch worktree; a ready PR its -watch one, paused until its space closes.
import { exec, spaces, panes, machines, run, home, shared, setShared } from "herdr";
import { watchPath, holdPause, toRelease, shows } from "./open.js";
import { checkoutsOf } from "./watch.js";
import { findClone, sh } from "./watcher.js";

const OPEN = "pr-open";
const WATCH = "pr-watch";
const ERROR_MS = 300000; // an error shows on the row this long
const DEAD_MS = 900000; // an opening older than this (wt alone may take 10 min) died with its copy: asked again

const without = (obj, keys) => Object.fromEntries(Object.entries(obj).filter(([k]) => !keys.includes(k)));
const setEntry = (key, entry) => {
  const cur = shared(OPEN) ?? {};
  setShared(OPEN, entry === null ? without(cur, [key]) : { ...cur, [key]: entry });
};
const setPaused = (paused) => setShared(WATCH, { on: false, prs: {}, error: null, at: 0, ...(shared(WATCH) ?? {}), paused });

async function folderFor(repo, number) {
  const view = JSON.parse(await sh("gh", ["pr", "view", String(number), "-R", repo, "--json", "isDraft,headRefName"]));
  const branch = view.headRefName;
  const clone = await findClone(repo);
  if (clone === null) throw new Error(`aucun clone local de ${repo}`);
  if (view.isDraft) {
    const list = async () => checkoutsOf(await sh("git", ["-C", clone, "worktree", "list", "--porcelain"]), branch)[0];
    let folder = await list();
    if (!folder) {
      // A draft pushed from elsewhere has no ref here yet.
      await sh("git", ["-C", clone, "fetch", "origin", branch]);
      await sh("wt", ["switch", branch, "--no-cd"], clone, 600000);
      folder = await list();
    }
    if (!folder) throw new Error(`worktrunk n'a pas sorti ${branch}`);
    return { folder, draft: true };
  }
  const folder = watchPath(home(), repo, branch);
  // An existing -watch is opened as it is: the agent's work is what I came for.
  if ((await exec("test", ["-e", folder])).code !== 0) {
    await sh("git", ["-C", clone, "fetch", "origin", branch]);
    await sh("git", ["-C", clone, "worktree", "add", "--detach", folder, `origin/${branch}`]);
  }
  return { folder, draft: false };
}

// Every folder a local space shows: its own and its panes' cwds.
const localSpaces = () => spaces().filter((s) => !s.machine).map((s) => {
  const tabs = new Set(s.tabs.map((t) => t.id));
  return { space: s, folders: [s.folder, ...panes().filter((p) => tabs.has(p.tab)).map((p) => p.cwd)].filter(Boolean) };
});

// One pass: ends the pauses whose space closed, drops old errors, opens at most one asked PR.
// id names this status-jc copy: two copies must not open the same PR twice.
export async function openRound(id) {
  const now = Date.now();
  let open = shared(OPEN) ?? {};
  if (Object.keys(open).length === 0) return;
  const local = localSpaces();
  // Until the local layout is read (start, reconnect), spaces() lacks the restored ones: nothing to release yet.
  const ready = machines().find((m) => m.name === null)?.layout === "ready";
  const released = ready ? toRelease(open, local.flatMap((l) => l.folders)) : [];
  const stale = Object.entries(open).filter(([, e]) => e.state === "error" && now - e.at > ERROR_MS).map(([k]) => k);
  // A failed reopen keeps its held entry with the error: only the error goes.
  for (const [k, e] of Object.entries(open)) if (e.state === "held" && e.error && now - e.at > ERROR_MS) open = { ...open, [k]: without(e, ["error"]) };
  if (released.length) setPaused((shared(WATCH)?.paused ?? []).filter((k) => !released.includes(k)));
  const kept = without(open, [...released, ...stale]);
  if (JSON.stringify(kept) !== JSON.stringify(shared(OPEN))) setShared(OPEN, kept); // shared() is persisted: write only a change
  open = kept;

  const [key] = Object.entries(open).find(([, e]) => e.state === "asked" || (e.state === "opening" && now - e.at > DEAD_MS)) ?? [];
  if (!key) return;
  // held: the panel asked again while the opening owned the pause (the click replaced "held" with "asked").
  const wasHeld = open[key].held === true, heldFolders = open[key].folders;
  // Claimed before any await: copies share one single-threaded runtime, the other one sees "opening" on its next pass.
  setEntry(key, { state: "opening", at: now, by: id, held: wasHeld, folders: heldFolders });
  const [repo, number] = key.split("#");
  try {
    const { folder, draft } = await folderFor(repo, number);
    // ~/dev is a symlink: a space may show either form of the folder.
    const real = (await sh("realpath", [folder])).trim();
    const folders = [...new Set([folder, real])];
    const space = localSpaces().find((l) => l.folders.some((f) => shows(folders, f)))?.space;
    if (space) run("space.select", { id: space.id });
    else run("space.new", { folder, argv: ["claude"] });
    if (draft) {
      // Now a draft: a pause this opening held is the watch's to lift, nothing else will.
      if (wasHeld) setPaused((shared(WATCH)?.paused ?? []).filter((k) => k !== key));
      return void setEntry(key, null);
    }
    const { paused, held } = holdPause(shared(WATCH)?.paused ?? [], key, wasHeld);
    if (held) setPaused(paused);
    setEntry(key, held ? { state: "held", at: Date.now(), folders } : null);
  } catch (e) {
    // A failed reopen keeps the pause the opening owns: its space may still be open.
    setEntry(key, wasHeld ? { state: "held", at: Date.now(), folders: heldFolders, error: e?.message ?? String(e) } : { state: "error", at: Date.now(), error: e?.message ?? String(e) });
  }
}
