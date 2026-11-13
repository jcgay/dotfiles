// Pure helpers of start-work: no Herdr import, so `node --test` (and the dotfiles CI) loads them.
// slug, branchFor, existingWork and spaceIn come from aguiddir/herdr-config's start-work
// (mods/start-work/lib.js), adapted.

// "Données : 🐛 Fix l'accès" -> "donnees-fix-l-acces", at most 50 chars, cut at a dash.
export function slug(text) {
  let s = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 50) s = s.slice(0, 50).replace(/-[^-]*$/, "");
  return s;
}

// Jira and GitHub link a branch to its ticket by the key or number at its start.
export function branchFor(item) {
  if (item.kind === "jira") return `${item.key}-${slug(item.title)}`;
  if (item.kind === "issue") return `${item.number}-${slug(item.title)}`;
  return slug(item.title);
}

const KEY = /^[A-Z][A-Z0-9]+-\d+$/;

export function parseQuery(text) {
  const t = text.trim();
  if (!t) return { kind: "empty" };
  if (KEY.test(t.toUpperCase())) return { kind: "key", key: t.toUpperCase() };
  const issue = /^#(\d+)$/.exec(t);
  if (issue) return { kind: "issue", number: Number(issue[1]) };
  return { kind: "text", text: t };
}

// The Jira projects a repo works on: keys opening its commit subjects ("MERLIN-2321: …"),
// kept when seen at least `min` times, most frequent first.
export function jiraProjects(subjects, min = 3) {
  const counts = new Map();
  for (const s of subjects) {
    const m = /^([A-Z][A-Z0-9]+)-\d+/.exec(s);
    if (m) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  }
  return [...counts].filter(([, n]) => n >= min).sort((a, b) => b[1] - a[1]).map(([k]) => k);
}

const quote = (s) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

// Always names its projects: without a project clause jira-cli adds its default one. No ORDER BY:
// jira-cli appends its own, so the order goes through `--order-by updated`.
export function jql({ projects, text, mine }) {
  return [
    `project in (${projects.map(quote).join(", ")})`,
    mine ? "assignee = currentUser()" : null,
    "statusCategory != Done",
    text ? `text ~ ${quote(text)}` : null,
  ].filter(Boolean).join(" AND ");
}

// `jira issue list --raw` (an array) or `jira issue view --raw` (one issue).
export function parseJiraIssues(raw) {
  const data = JSON.parse(raw);
  return (Array.isArray(data) ? data : [data]).map((i) => ({
    kind: "jira",
    key: i.key,
    title: i.fields.summary,
    status: i.fields.status?.name ?? null,
    category: i.fields.status?.statusCategory?.key ?? null,
    assignee: i.fields.assignee?.emailAddress ?? null, // Jira Cloud hides colleagues' emails
    assigneeName: i.fields.assignee?.displayName ?? null,
  }));
}

// `gh issue list|view --json number,title,url,assignees`.
export function parseGhIssues(json) {
  const data = JSON.parse(json);
  return (Array.isArray(data) ? data : [data]).map((i) => ({
    kind: "issue", number: i.number, title: i.title, url: i.url, assignees: (i.assignees ?? []).map((a) => a.login),
  }));
}

export function promptFor(item) {
  const brainstorm = "/superpowers:brainstorming";
  if (item.kind === "jira") return `${brainstorm} ${item.key} : ${item.title}`;
  if (item.kind === "issue") return `${brainstorm} ${item.url} : ${item.title}`;
  return `${brainstorm} ${item.title}`;
}

const plain = (s) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// The transition that starts work: to an "in progress" category state, and named like it.
// The category alone is not enough: MERLIN has six indeterminate states (Bloqué, En validation…).
export function pickStartTransition(transitions) {
  const t = transitions.find((t) => t.to?.statusCategory?.key === "indeterminate" && /en cours|in progress/.test(`${plain(t.name)} ${plain(t.to?.name)}`));
  return t ? { id: t.id, name: t.name } : null;
}

// The work in progress for an item: an open PR whose title starts with its key, else an open PR on
// a branch carrying its key or number, else the newest branch carrying them, outside backup/ and
// not delivered (merged into the base, or carrying a merged PR). prs: open ones only; branches:
// newest first, without "origin/".
export function existingWork(item, branches, prs, delivered) {
  const id = item.kind === "jira" ? item.key : item.kind === "issue" ? String(item.number) : null;
  if (!id) return null;
  const head = item.kind === "jira" ? new RegExp(`(^|/)${id}(?![0-9])`, "i") : new RegExp(`(^|/)${id}-`);
  const title = new RegExp(`^[^A-Za-z0-9]*${id}(?![0-9])`, "i");
  const pr = (item.kind === "jira" && prs.find((p) => title.test(p.title))) || prs.find((p) => head.test(p.headRefName));
  const branch = pr?.headRefName ?? branches.find((b) => head.test(b) && !b.startsWith("backup/") && !delivered.has(b));
  return branch ? { branch, pr: prs.find((p) => p.headRefName === branch) ?? null } : null;
}

// Where new work starts: the default branch, then origin's sprint-* branches (newest first).
export function baseChoices(defaultBranch, remoteBranches) {
  const sprints = remoteBranches.map((b) => b.replace(/^origin\//, "")).filter((b) => b.startsWith("sprint-"));
  return [defaultBranch, ...new Set(sprints)];
}

// The space showing a terminal in this checkout, and that terminal's tab. A terminal in another
// checkout nested in it (.claude/worktrees/…) does not count. A space only started there answers
// when no terminal is there. panes and spaces: as Herdr's panes() and spaces() give them.
export function spaceIn(path, checkouts, panes, spaces) {
  const dirs = [path, ...checkouts];
  const under = (cwd, dir) => cwd === dir || cwd.startsWith(`${dir}/`);
  const checkout = (cwd) => dirs.filter((dir) => under(cwd, dir)).sort((a, b) => b.length - a.length)[0];
  const inside = panes.find((p) => p.cwd && checkout(p.cwd) === path);
  const space = inside && spaces.find((sp) => sp.tabs.some((t) => t.id === inside.tab));
  if (space) return { space, tab: inside.tab };
  const started = spaces.find((sp) => sp.folder === path);
  return started ? { space: started, tab: null } : null;
}
