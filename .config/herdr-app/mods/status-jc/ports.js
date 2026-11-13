// Which listening TCP ports belong to which space. Pure: fed with command output.

// `lsof -nP -iTCP -sTCP:LISTEN -Fpn` → Map pid → Set of ports.
export function parseListeners(out) {
  const byPid = new Map();
  let pid = null;
  for (const line of out.split("\n")) {
    if (line[0] === "p") pid = Number(line.slice(1));
    else if (line[0] === "n" && pid) {
      const port = Number(line.slice(line.lastIndexOf(":") + 1));
      // shortcut: ephemeral ports (daemons, IDE helpers) are dropped; a dev server on one won't show.
      if (port > 0 && port < 32768) (byPid.get(pid) ?? byPid.set(pid, new Set()).get(pid)).add(port);
    }
  }
  return byPid;
}

// `ps -axo pid=,ppid=` → Map pid → ppid.
export function parseParents(out) {
  const parents = new Map();
  for (const line of out.trim().split("\n")) {
    const [pid, ppid] = line.trim().split(/\s+/).map(Number);
    if (pid) parents.set(pid, ppid);
  }
  return parents;
}

// `lsof -a -d cwd -Fn -p ...` → Map pid → cwd.
export function parseCwds(out) {
  const cwds = new Map();
  let pid = null;
  for (const line of out.split("\n")) {
    if (line[0] === "p") pid = Number(line.slice(1));
    else if (line[0] === "n" && pid) cwds.set(pid, line.slice(1));
  }
  return cwds;
}

// The space a listener belongs to: a terminal among its ancestors (npm run dev), else the
// space whose folder holds its working folder, deepest first (a JVM forked by the Gradle
// daemon is no descendant, but runs in the worktree). shells: Map pid → space id;
// roots: [{ folder, space }].
export function spaceOf(pid, { parents, shells, cwds, roots }) {
  for (let p = pid, hops = 0; p > 1 && hops < 64; p = parents.get(p), hops++) {
    if (shells.has(p)) return shells.get(p);
  }
  const cwd = cwds.get(pid);
  if (!cwd) return null;
  const hit = roots
    .filter((r) => cwd === r.folder || cwd.startsWith(r.folder + "/"))
    .sort((a, b) => b.folder.length - a.folder.length)[0];
  return hit?.space ?? null;
}

// curl's verdict on http://127.0.0.1:<port>/ → "up" | "starting".
// Not HTTP at all (a database: empty reply, 52/56) still counts as up: the port is open.
export function health(httpCode, exitCode) {
  if (exitCode === 52 || exitCode === 56) return "up";
  const code = Number(httpCode);
  return code > 0 && code < 500 ? "up" : "starting";
}
