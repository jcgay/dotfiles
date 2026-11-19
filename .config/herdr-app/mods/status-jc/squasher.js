// The PR panel's squash button: it writes { state: "asked" } in shared("pr-squash"), this folds the PR's fixup! commits in its
// watch worktree with git alone (autosquash), and only on a conflict opens a "⟳ #N squash" agent tab.
import { spaces, shared, setShared } from "herdr";
import { tabName, promptFor } from "./watch.js";
import { findClone, prepareWorktree, autosquash, start, sh } from "./watcher.js";

const SQUASH = "pr-squash";
const ERROR_MS = 300000; // an error shows on the row this long
const DEAD_MS = 600000; // a squash older than this died with its copy: asked again

const setEntry = (key, entry) => {
  const { [key]: _, ...rest } = shared(SQUASH) ?? {};
  setShared(SQUASH, entry === null ? rest : { ...rest, [key]: entry });
};

// One pass: drops old errors, squashes at most one asked PR. id names this status-jc copy.
// shortcut: a watch round squashing the same approved PR at the same moment is not excluded; the push lease makes the second fail
export async function squashRound(id) {
  const now = Date.now(), all = shared(SQUASH) ?? {};
  for (const [k, e] of Object.entries(all)) if (e.state === "error" && now - e.at > ERROR_MS) setEntry(k, null);
  const [key] = Object.entries(all).find(([, e]) => e.state === "asked" || (e.state === "running" && now - e.at > DEAD_MS)) ?? [];
  if (!key) return;
  // Claimed before any await: copies share one single-threaded runtime.
  setEntry(key, { state: "running", at: now, by: id });
  const [repo, number] = key.split("#");
  try {
    // A paused PR's watch worktree may be the one I work in (⌨).
    if ((shared("pr-watch")?.paused ?? []).includes(key)) throw new Error("PR en pause : son worktree de surveillance est peut-être le tien");
    // A watch agent may work in the same worktree; an old squash agent would get a twin.
    // shortcut: tab names carry no repo, so another repo's PR with the same number blocks too
    if (spaces().some((sp) => sp.tabs.some((t) => t.name?.startsWith(tabName(Number(number), ""))))) throw new Error(`un onglet ⟳ #${number} est ouvert : ferme-le avant de squasher`);
    const v = JSON.parse(await sh("gh", ["pr", "view", number, "-R", repo, "--json", "url,headRefName,headRefOid,baseRefName"]));
    const s = { url: v.url, number: Number(number), branch: v.headRefName, head: v.headRefOid, base: v.baseRefName };
    const clone = await findClone(repo);
    if (clone === null) throw new Error(`aucun clone local de ${repo}`);
    const wt = await prepareWorktree(clone, repo, s.branch);
    if (wt.busy) throw new Error(`tu travailles sur ${s.branch} dans ${wt.busy.split("/").pop()} (non poussé)`);
    if (wt.dirty) throw new Error("le worktree de surveillance a du travail non poussé");
    if (!(await autosquash(wt.path, s))) start(wt.path, tabName(s.number, "squash"), promptFor("squash", s));
    setEntry(key, null);
  } catch (e) {
    setEntry(key, { state: "error", at: Date.now(), error: e?.message ?? String(e) });
  }
}
