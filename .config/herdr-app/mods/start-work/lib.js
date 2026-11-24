// Pure helpers of start-work: no Herdr import, so `node --test` (and the dotfiles CI) loads them.
// slug, branchFor, existingWork and spaceIn come from aguiddir/herdr-config's start-work
// (mods/start-work/lib.js), adapted.

// ~/.config/herdr-app/config.json (rendered by `yadm alt` from the machine class) → its jira entry, if any.
// start-work needs no owners: only a missing or unreadable file is an error.
export const CONFIG_ERROR = "~/.config/herdr-app/config.json absent ou invalide : lance yadm alt";
export function jiraOf(text) {
  let config;
  try { config = JSON.parse(text); } catch { return { jira: null, error: CONFIG_ERROR }; }
  if (config === null || typeof config !== "object") return { jira: null, error: CONFIG_ERROR };
  // A partial entry would curl undefined/rest/… and assign tickets to "undefined": no Jira then.
  const ok = (v) => typeof v === "string" && v !== "";
  return { jira: ok(config.jira?.url) && ok(config.jira?.me) ? config.jira : null, error: null };
}

// "Données : 🐛 Fix l'accès" ->"donnees-fix-l-acces", at most 50 chars, cut at a dash.
export function slug(text) {
  let s = text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (s.length > 50) s = s.slice(0, 50).replace(/-[^-]*$/, "");
  return s;
}

// The branch Créer or Reprendre uses: what the field says, except a PR, which only resumes its own.
export function chosenBranch(item, typed) {
  return item?.kind === "pr" ? item.branch : typed.trim();
}

// Jira and GitHub link a branch to its ticket by the key or number at its start.
export function branchFor(item) {
  if (item.kind === "jira") return `${item.key}-${slug(item.title)}`;
  if (item.kind === "issue") return `${item.number}-${slug(item.title)}`;
  if (item.kind === "pr") return item.branch;
  return slug(item.title);
}

const KEY = /^[A-Z][A-Z0-9]+-\d+$/;

// jira false (no Jira on this machine): a key-shaped text (utf-8, ABC-12) is searched as text.
export function parseQuery(text, jira = true) {
  const t = text.trim();
  if (!t) return { kind: "empty" };
  if (jira && KEY.test(t.toUpperCase())) return { kind: "key", key: t.toUpperCase() };
  // shortcut: a pasted URL is read in the current repo, whatever repo it names.
  const issue = /^#(\d+)$/.exec(t) ?? /^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:pull|issues)\/(\d+)\b/.exec(t);
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
    bug: isBug((i.fields.issueType ?? i.fields.issuetype)?.name), // jira-cli: issueType in list, issuetype in view
  }));
}

// The whole name: a label "not a bug" or "bug-bounty" is no bug.
const isBug = (name) => name?.toLowerCase() === "bug";

// `gh issue list|view --json number,title,url,assignees,labels,issueType`: a bug by its type or a label.
export function parseGhIssues(json) {
  const data = JSON.parse(json);
  return (Array.isArray(data) ? data : [data]).map((i) => ({
    kind: "issue", number: i.number, title: i.title, url: i.url, assignees: (i.assignees ?? []).map((a) => a.login),
    bug: isBug(i.issueType?.name) || (i.labels ?? []).some((l) => isBug(l.name)),
  }));
}

// `gh pr view --json number,title,url,headRefName`: a PR is resumed on its own branch.
export function parseGhPr(json) {
  const p = JSON.parse(json);
  return [{ kind: "pr", number: p.number, title: p.title, url: p.url, branch: p.headRefName }];
}

export function promptFor(item) {
  const skill = item.bug ? "/superpowers:systematic-debugging" : "/superpowers:brainstorming";
  if (item.kind === "jira") return `${skill} ${item.key} : ${item.title}`;
  if (item.kind === "issue") return `${skill} ${item.url} : ${item.title}`;
  return `${skill} ${item.title}`;
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
  if (item.kind === "pr") return { branch: item.branch, pr: item };
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

// `osascript -e 'clipboard info'` ("«class utf8», 15, string, 15, …"): true when the clipboard
// holds only plain text (or nothing), which pbpaste/pbcopy can save and restore whole.
const TEXT = new Set(["«class utf8»", "«class ut16»", "string", "Unicode text"]);
export function clipboardIsText(info) {
  const parts = info.split(",").map((s) => s.trim()).filter(Boolean);
  return parts.filter((_, i) => i % 2 === 0).every((type) => TEXT.has(type));
}
