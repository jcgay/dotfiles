// projects: the pure part (no herdr import), tested by lib.test.mjs.
// Design: ~/.config/herdr-app/docs/2026-11-23-projects-picker-design.md

const lines = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);

// `find <root>/ -mindepth 2 -maxdepth 2 -name .git -type d`: a worktree's .git is a file, so it is not there.
export function parseRepos(stdout) {
  return lines(stdout).map((l) => l.replace(/\/\.git$/, "").split("/").pop())
    .filter((n) => n && n !== "agents-worktree").sort();
}

// "<name> <unix seconds>" per line.
export function parseCommits(stdout) {
  const out = {};
  for (const l of lines(stdout)) {
    const m = l.match(/^(.+) (\d+)$/); // the name may hold spaces, the date is the last word
    if (m) out[m[1]] = Number(m[2]) * 1000;
  }
  return out;
}

// ~/dev is a symlink: Herdr reports folders under its real path, so every root is tried.
export function repoOfFolder(folder, roots, names) {
  for (const root of roots) {
    if (!folder.startsWith(root + "/")) continue;
    const name = folder.slice(root.length + 1).split("/")[0];
    if (names.has(name)) return name;
  }
  return null;
}

export function stamp(recent, names, now) {
  const out = { ...recent };
  for (const n of names) out[n] = now;
  return out;
}

// The repos open now that were not open the last time the picker looked: they were opened since.
export function markOpened(recent, wasOpen, nowOpen, now) {
  const was = new Set(wasOpen);
  return stamp(recent, nowOpen.filter((n) => !was.has(n)), now);
}

export function order(names, recent, commits) {
  const by = (a, b) => (b ?? -1) - (a ?? -1);
  return [...names].sort((a, b) => {
    const r = by(recent[a], recent[b]);
    if (r) return r;
    if (recent[a] == null) { const c = by(commits[a], commits[b]); if (c) return c; }
    // Not localeCompare: Herdr's QuickJS compares code points there, uppercase first.
    const x = a.toLowerCase(), y = b.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });
}

export function filter(names, query) {
  const q = query.trim().toLowerCase();
  if (!q) return names;
  const hits = names.filter((n) => n.toLowerCase().includes(q));
  const rank = (n) => (n.toLowerCase() === q ? 0 : n.toLowerCase().startsWith(q) ? 1 : 2);
  return [0, 1, 2].flatMap((r) => hits.filter((n) => rank(n) === r));
}

// A space's repo is where its first terminal is, as Herdr names it: another pane cd'd elsewhere does not count.
export function spaceRepo(space, panes, roots, names) {
  const first = panes.find((p) => p.tab === space.tabs[0]?.id && p.cwd);
  return first ? repoOfFolder(first.cwd, roots, names) : null;
}

export function openSpaceFor(name, roots, panes, spaces) {
  const names = new Set([name]);
  // only this computer's ~/dev
  return spaces.find((s) => !s.machine && spaceRepo(s, panes, roots, names))?.id ?? null;
}
