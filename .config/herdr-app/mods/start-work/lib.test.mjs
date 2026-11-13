// node --test ~/.config/herdr-app/mods/start-work/lib.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { slug, branchFor, parseQuery, jiraProjects, jql, parseJiraIssues, parseGhIssues, promptFor } from "./lib.js";

test("slug drops accents, emoji and punctuation", () => {
  assert.equal(slug("Données : 🐛 Fix l'accès"), "donnees-fix-l-acces");
});

test("slug stays under 50 characters, cut at a dash", () => {
  const s = slug("Uniformiser les types acceptés dans les URIs de médicament pack package et plus");
  assert.ok(s.length <= 50, s);
  assert.ok(!s.endsWith("-"), s);
  assert.ok("uniformiser-les-types-acceptes-dans-les-uris-de-medicament".startsWith(s), s);
});

test("branch names", () => {
  assert.equal(branchFor({ kind: "jira", key: "MERLIN-2330", title: "Inflexions des noms composés" }), "MERLIN-2330-inflexions-des-noms-composes");
  assert.equal(branchFor({ kind: "issue", number: 5355, title: "Inflections dans la recherche" }), "5355-inflections-dans-la-recherche");
  assert.equal(branchFor({ kind: "free", title: "Ma super idée" }), "ma-super-idee");
});

test("query kinds", () => {
  assert.deepEqual(parseQuery(""), { kind: "empty" });
  assert.deepEqual(parseQuery("  "), { kind: "empty" });
  assert.deepEqual(parseQuery("merlin-2321"), { kind: "key", key: "MERLIN-2321" });
  assert.deepEqual(parseQuery("#5355"), { kind: "issue", number: 5355 });
  assert.deepEqual(parseQuery("inflexions"), { kind: "text", text: "inflexions" });
});

test("jira projects from commit subjects, most frequent first", () => {
  const subjects = ["MERLIN-1: a", "MERLIN-2: b", "MERLIN-3: c", "APIREST-9: d", "Fix x", "ZAPI-1: y"];
  assert.deepEqual(jiraProjects(subjects), ["MERLIN"]);
  assert.deepEqual(jiraProjects(subjects, 1), ["MERLIN", "APIREST", "ZAPI"]);
});

test("jql for my tickets", () => {
  assert.equal(jql({ projects: ["MERLIN", "APIREST"], mine: true }),
    'project in ("MERLIN", "APIREST") AND assignee = currentUser() AND statusCategory != Done');
});

test("jql text is quoted and escaped, never a second clause", () => {
  const q = jql({ projects: ["MERLIN"], text: 'say "hi" \\ AND x' });
  assert.ok(q.includes('text ~ "say \\"hi\\" \\\\ AND x"'), q);
  assert.equal(q.match(/project in/g).length, 1);
  assert.ok(!/ORDER BY/i.test(q), "jira-cli adds its own ORDER BY: --order-by updated");
});

const jiraOne = { key: "MERLIN-2321", fields: { summary: "Uniformiser les URIs", status: { name: "Ouvert", statusCategory: { key: "new" } }, assignee: null } };

test("jira issues from list and view output", () => {
  const item = { kind: "jira", key: "MERLIN-2321", title: "Uniformiser les URIs", status: "Ouvert", category: "new", assignee: null, assigneeName: null };
  assert.deepEqual(parseJiraIssues(JSON.stringify([jiraOne])), [item]);
  assert.deepEqual(parseJiraIssues(JSON.stringify(jiraOne)), [item]);
  const mine = { ...jiraOne, fields: { ...jiraOne.fields, assignee: { emailAddress: "me@x.fr" } } };
  assert.equal(parseJiraIssues(JSON.stringify([mine]))[0].assignee, "me@x.fr");
});

test("github issues", () => {
  assert.deepEqual(parseGhIssues('[{"number":5446,"title":"t","url":"u","assignees":[{"login":"jcgay"}]}]'),
    [{ kind: "issue", number: 5446, title: "t", url: "u", assignees: ["jcgay"] }]);
  assert.equal(parseGhIssues('{"number":1,"title":"t","url":"u","assignees":[]}').length, 1);
});

test("prompts", () => {
  assert.equal(promptFor({ kind: "jira", key: "MERLIN-2321", title: "T" }), "/superpowers:brainstorming MERLIN-2321 : T");
  assert.equal(promptFor({ kind: "issue", number: 1, url: "https://g/1", title: "T" }), "/superpowers:brainstorming https://g/1 : T");
  assert.equal(promptFor({ kind: "free", title: "idée" }), "/superpowers:brainstorming idée");
});

import { pickStartTransition, existingWork, baseChoices, spaceIn } from "./lib.js";

const t = (name, to, cat) => ({ id: name, name, to: { name: to, statusCategory: { key: cat } } });
const merlin = [
  t("Selected for Development", "Selected for Development", "new"),
  t("Attente Validation", "En Validation PO", "indeterminate"),
  t("En validation", "En validation", "indeterminate"),
  t("In Progress", "En cours", "indeterminate"),
  t("Bloqué", "Bloqué", "indeterminate"),
  t("Invalid", "Invalid", "done"),
  t("Done Dev", "Done Dev", "indeterminate"),
];

test("the start transition is the in-progress one, not any indeterminate", () => {
  assert.equal(pickStartTransition(merlin).name, "In Progress");
  assert.equal(pickStartTransition([t("Bloqué", "Bloqué", "indeterminate"), t("Open", "Ouvert", "new")]), null);
  assert.equal(pickStartTransition([t("Démarrer", "En Cours", "indeterminate")]).name, "Démarrer");
  assert.equal(pickStartTransition([t("In Progress", "En cours", "done")]), null);
});

const jira = { kind: "jira", key: "MERLIN-2321", title: "T" };

test("existing work: an open PR titled with the key wins", () => {
  const pr = { number: 9, title: "MERLIN-2321: Accept pack", headRefName: "x" };
  assert.deepEqual(existingWork(jira, [], [pr], new Set()), { branch: "x", pr });
});

test("existing work: newest undelivered branch, never backup/ nor a longer key", () => {
  const branches = ["backup/MERLIN-2321", "MERLIN-23210-other", "MERLIN-2321-old", "MERLIN-2321"];
  assert.deepEqual(existingWork(jira, branches, [], new Set(["MERLIN-2321-old"])), { branch: "MERLIN-2321", pr: null });
  assert.equal(existingWork(jira, branches, [], new Set(["MERLIN-2321-old", "MERLIN-2321"])), null);
});

test("existing work for issues and free work", () => {
  const issue = { kind: "issue", number: 5355, title: "T" };
  assert.equal(existingWork(issue, ["15355-x", "5355-inflections"], [], new Set()).branch, "5355-inflections");
  assert.equal(existingWork({ kind: "free", title: "x" }, ["x"], [], new Set()), null);
});

test("base choices: the default branch, then sprint branches", () => {
  assert.deepEqual(baseChoices("master", ["origin/HEAD", "origin/master", "origin/sprint-la-search", "origin/sprint-old", "origin/feature"]),
    ["master", "sprint-la-search", "sprint-old"]);
});

test("spaceIn: the space with a terminal in the checkout", () => {
  const spaces = [{ id: "s1", folder: "/r", tabs: [{ id: "t1" }] }, { id: "s2", folder: "/w/a", tabs: [{ id: "t2" }] }];
  assert.deepEqual(spaceIn("/w/a", ["/r", "/w/a"], [{ tab: "t2", cwd: "/w/a/sub" }], spaces), { space: spaces[1], tab: "t2" });
});

test("spaceIn: a nested checkout is not its parent", () => {
  const spaces = [{ id: "s1", folder: "/r", tabs: [{ id: "t1" }] }];
  assert.deepEqual(spaceIn("/r", ["/r", "/r/.claude/worktrees/a"], [{ tab: "t1", cwd: "/r/.claude/worktrees/a" }], spaces), { space: spaces[0], tab: null });
});

test("spaceIn: a space started in the folder with no terminal there", () => {
  const spaces = [{ id: "s1", folder: "/w/a", tabs: [{ id: "t1" }] }];
  assert.deepEqual(spaceIn("/w/a", ["/w/a"], [{ tab: "t1", cwd: "/elsewhere" }], spaces), { space: spaces[0], tab: null });
});

import { clipboardIsText } from "./lib.js";

test("clipboard: plain text only, as osascript's clipboard info lists it", () => {
  assert.equal(clipboardIsText("«class utf8», 15, «class ut16», 32, string, 15, Unicode text, 30"), true);
  assert.equal(clipboardIsText(""), true);
  assert.equal(clipboardIsText("«class PNGf», 1024, TIFF picture, 4096"), false);
  assert.equal(clipboardIsText("«class furl», 40, «class utf8», 20"), false);
  assert.equal(clipboardIsText("«class RTF », 300, «class utf8», 15, string, 15"), false);
});

test("a colleague's ticket keeps their name when Jira hides their email", () => {
  const theirs = { ...jiraOne, fields: { ...jiraOne.fields, assignee: { emailAddress: null, displayName: "Charles Metivier" } } };
  const [item] = parseJiraIssues(JSON.stringify([theirs]));
  assert.equal(item.assignee, null);
  assert.equal(item.assigneeName, "Charles Metivier");
  assert.equal(parseJiraIssues(JSON.stringify([jiraOne]))[0].assigneeName, null);
});
