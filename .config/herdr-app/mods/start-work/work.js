// The side effects of start-work, in order: take the Jira ticket, make the worktree with worktrunk,
// open a space with Claude, type the brainstorming prompt without sending it.
import { exec, run, spaces, panes } from "herdr";
import { parseJiraIssues, pickStartTransition, promptFor, spaceIn, clipboardIsText } from "./lib.js";

const ME = "jean-christophe.gay@vidal.fr";
// Herdr starts programs without a locale, and pbcopy then reads its input as MacRoman (é → √©).
const UTF8 = "export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8;";
const JIRA = "https://vidalgroup.atlassian.net";

// The first line of an error, without the colors jira-cli adds.
export const firstLine = (r) => (r.stderr || r.stdout || "").replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n")[0];

export async function cmd(program, args, cwd, timeout = 30000) {
  const r = await exec(program, args, { cwd, timeout });
  if (r.code !== 0) throw new Error(firstLine(r) || `${program} a échoué`);
  return r.stdout;
}

// jira-cli and the REST API through fish: Herdr starts programs without the fish environment,
// where JIRA_API_TOKEN lives (conf.d/secrets.fish).
export const jira = (args, cwd) => cmd("fish", ["-c", "jira $argv", ...args], cwd);
// My Jira display name: search results hide emails, mine included, so names are compared.
export const myName = () => cmd("fish", ["-c", `curl -sf -u "${ME}:$JIRA_API_TOKEN" $argv`, `${JIRA}/rest/api/3/myself`]).then((out) => JSON.parse(out).displayName);
const transitions = (key) => cmd("fish", ["-c", `curl -sf -u "${ME}:$JIRA_API_TOKEN" $argv`, `${JIRA}/rest/api/3/issue/${key}/transitions`]);

// Every checked-out branch of the repo and its folder.
async function checkouts(main) {
  const out = await cmd("git", ["worktree", "list", "--porcelain"], main);
  return new Map(out.split("\n\n").flatMap((block) => {
    const lines = block.split("\n");
    const branch = lines.find((l) => l.startsWith("branch refs/heads/"));
    return branch ? [[branch.slice("branch refs/heads/".length), lines[0].replace(/^worktree /, "")]] : [];
  }));
}

// Assign the ticket to me, then move it to In Progress if it was still to do. Only the assignment
// stops the run: the state is a comfort, and the assignment cannot be undone.
async function take(key, main, notes) {
  const ticket = parseJiraIssues(await jira(["issue", "view", key, "--raw"], main))[0];
  if (ticket.assignee !== ME) {
    try { await jira(["issue", "assign", key, ME], main); }
    catch (e) { throw new Error(`Jira refuse de t'assigner ${key} : ${e.message}. Rien n'a été créé.`); }
  }
  if (ticket.category !== "new") return;
  try {
    const start = pickStartTransition(JSON.parse(await transitions(key)).transitions ?? []);
    if (!start) return void notes.push(`${key} assigné, état inchangé : aucune transition « En cours » depuis « ${ticket.status} ».`);
    await jira(["issue", "move", key, start.name], main);
  } catch (e) { notes.push(`${key} assigné, état inchangé : ${e.message}`); }
}

export async function start(state, cx, phase = () => {}) {
  const { repo, item, base, branch } = state;
  const notes = [];
  const sleep = (ms) => new Promise((resolve) => cx.timer.after(ms, () => resolve()));
  try { await cmd("git", ["check-ref-format", "--branch", branch], repo.main); }
  catch { throw new Error(`« ${branch} » n'est pas un nom de branche valide.`); }
  // Créer never lands on an existing branch: worktrunk would refuse it after Jira was taken, or an
  // old checkout of it would get the new work. A delivered branch keeps its name: rename the new one.
  if (!state.resume && (await exec("git", ["show-ref", "--verify", "--quiet", `refs/heads/${branch}`], { cwd: repo.main })).code === 0)
    throw new Error(`La branche ${branch} existe déjà : donne un autre nom à la nouvelle.`);
  const taking = state.take && !state.resume && item.kind === "jira";
  if (taking) { phase("Jira…"); await take(item.key, repo.main, notes); }
  const done = taking ? `${item.key} est déjà à toi. ` : "";

  // The worktree: one already checked out is used as is, work in progress and all.
  let trees = await checkouts(repo.main);
  if (!trees.has(branch)) {
    const args = state.resume ? ["switch", branch, "--no-cd"] : ["switch", "--create", branch, "--base", base, "--no-cd"];
    phase("worktrunk…");
    try { await cmd("wt", args, repo.main, 600000); }
    catch (e) { throw new Error(`${done}worktrunk : ${e.message}`); }
    trees = await checkouts(repo.main);
  }
  const folder = trees.get(branch);
  if (!folder) throw new Error(`${done}worktrunk n'a pas sorti ${branch}.`);

  // A space already on it: show it, nothing else.
  const open = spaceIn(folder, [...trees.values()], panes(), spaces());
  if (open) {
    run("space.select", { id: open.space.id });
    if (open.tab) run("tab.select", { id: open.tab });
    return notes;
  }
  run("space.new", { folder, argv: ["claude"] });
  if (state.resume) return notes;

  // The prompt, typed but not sent: Claude takes no draft on its command line, and hc send
  // presses Enter. So: the clipboard, then terminal.paste, then the clipboard as it was.
  const prompt = promptFor(item);
  const fallback = (why) => { notes.push(`Prompt à coller dans Claude (${why}) : ${prompt}`); return notes; };
  // The new space is the one started in the worktree; its pane holds Claude (documented fields only).
  const claudePane = () => {
    const space = spaces().find((s) => s.folder === folder);
    const tabs = new Set(space?.tabs.map((t) => t.id) ?? []);
    const pane = panes().find((p) => tabs.has(p.tab) && p.terminal);
    return pane ? { space, pane } : null;
  };
  phase("attente de Claude…");
  let claude = null;
  for (let waited = 0; waited < 30000 && !claude; waited += 500) {
    await sleep(500);
    const found = claudePane();
    if (found?.pane.status === "idle") claude = found;
  }
  if (!claude) return fallback("Claude n'était pas prêt");
  if (!claude.space.active) return fallback("tu as changé d'espace");
  const info = await cmd("osascript", ["-e", "clipboard info"]).catch(() => null);
  if (info === null || !clipboardIsText(info)) return fallback("le presse-papier contient autre chose que du texte");
  // Saved to a file, not passed through argv or exec's output: a large clipboard survives whole.
  const saved = (await cmd("mktemp", ["-t", "start-work-clipboard"])).trim();
  try {
    await cmd("sh", ["-c", `${UTF8} pbpaste > "$1"`, "sh", saved]);
    await cmd("sh", ["-c", `${UTF8} printf %s "$1" | pbcopy`, "sh", prompt]);
    run("pane.focus", { terminal: claude.pane.terminal });
    run("terminal.paste");
    await sleep(300); // the paste reads the clipboard: let it before putting it back
  } catch (e) { fallback(e.message); }
  finally {
    await cmd("sh", ["-c", `${UTF8} pbcopy < "$1" && rm -f "$1"`, "sh", saved]).catch(() => notes.push(`Le presse-papier n'a pas pu être remis : il est sauvé dans ${saved}.`));
  }
  return notes;
}
