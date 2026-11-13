// The side effects of start-work: running programs, then (Task 4) starting the work.
import { exec, notify } from "herdr";

// The first line of an error, without the colors jira-cli adds.
export const firstLine = (r) => (r.stderr || r.stdout || "").replace(/\x1b\[[0-9;]*m/g, "").trim().split("\n")[0];

export async function run(cmd, args, cwd, timeout = 30000) {
  const r = await exec(cmd, args, { cwd, timeout });
  if (r.code !== 0) throw new Error(firstLine(r) || `${cmd} a échoué`);
  return r.stdout;
}

// jira-cli through fish: Herdr starts programs without the fish environment, where
// JIRA_API_TOKEN lives (conf.d/secrets.fish).
export const jira = (args, cwd) => run("fish", ["-c", "jira $argv", ...args], cwd);
// My Jira display name: search results hide emails, mine included, so names are compared.
export const myName = () => run("fish", ["-c", 'curl -sf -u "jean-christophe.gay@vidal.fr:$JIRA_API_TOKEN" $argv', "https://vidalgroup.atlassian.net/rest/api/3/myself"]).then((out) => JSON.parse(out).displayName);

// Placeholder until Task 4: shows what would be started.
export async function start(state) {
  notify({ title: "start-work (essai)", body: `${state.item.kind} ${state.item.key ?? state.item.number ?? state.item.title} → ${state.branch} depuis ${state.base}${state.resume ? " (reprise)" : ""}` });
  return [];
}
