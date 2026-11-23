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
    const [name, at] = l.split(/\s+/);
    if (name && /^\d+$/.test(at ?? "")) out[name] = Number(at) * 1000;
  }
  return out;
}

// Herdr's recently closed spaces, from view.json.
export function parseRecent(json) {
  try {
    return (JSON.parse(json)?.recent ?? []).map((r) => r?.folder).filter((f) => typeof f === "string");
  } catch {
    return [];
  }
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

export function order(names, recent, commits) {
  const by = (a, b) => (b ?? -1) - (a ?? -1);
  return [...names].sort((a, b) => {
    const r = by(recent[a], recent[b]);
    if (r) return r;
    if (recent[a] == null) { const c = by(commits[a], commits[b]); if (c) return c; }
    return a.localeCompare(b);
  });
}

export function filter(names, query) {
  const q = query.trim().toLowerCase();
  if (!q) return names;
  const hits = names.filter((n) => n.toLowerCase().includes(q));
  return [...hits.filter((n) => n.toLowerCase().startsWith(q)), ...hits.filter((n) => !n.toLowerCase().startsWith(q))];
}

export function openSpaceFor(name, roots, panes, spaces) {
  const names = new Set([name]);
  for (const s of spaces) {
    if (s.machine) continue; // only this computer's ~/dev
    const tabs = new Set(s.tabs.map((t) => t.id));
    if (panes.some((p) => tabs.has(p.tab) && p.cwd && repoOfFolder(p.cwd, roots, names))) return s.id;
  }
  return null;
}
