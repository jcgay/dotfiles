// Opening a watched PR to work on it (PR panel button): the pure decisions, status-jc's opener.js does the rest.

// The watch's own worktree of branch: …/agents-worktree/<repo name>/<branch>-watch.
export const watchPath = (home, repo, branch) => `${home}/dev/agents-worktree/${repo.split("/")[1]}/${branch}-watch`;

// held: the opening owns the pause, so closing its space resumes it. A PR paused by hand stays the user's;
// wasHeld: opened again while its pause was already the opening's, which keeps it.
export function holdPause(paused, key, wasHeld = false) {
  return paused.includes(key) ? { paused, held: wasHeld } : { paused: [...paused, key], held: true };
}

// Whether folder is one of paths or under it: a space follows its pane's cwd, and ~/dev is a symlink.
export const shows = (paths, folder) => paths.some((p) => folder === p || folder.startsWith(`${p}/`));

// The held PRs no local space or pane shows anymore: their pause ends.
export function toRelease(open, folders) {
  return Object.entries(open ?? {})
    .filter(([, e]) => e.state === "held" && !folders.some((f) => shows(e.folders ?? [], f))).map(([k]) => k);
}
