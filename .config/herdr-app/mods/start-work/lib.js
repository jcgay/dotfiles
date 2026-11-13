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
