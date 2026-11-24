// The CI panel (view "ci"): the last Jenkins build of each long-lived branch of the repos I contributed to this week.
// main.js delegates to it; it asks gh and jk only when main.js calls refresh (panel shown).
// Design: ~/.config/herdr-app/docs/2026-11-24-ci-watch-design.md
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, run, spaces, panes, home } from "herdr";
import { minutes } from "./model.js";
import { ORG, JOBS_FOLDER, sinceDate, reposOf, longJobs, rowOf, fixOf, groups, jenkinsDown, fixBranch, fixPrompt, worktrees, remoteRepo, jkReached, listComplete } from "./ci-model.js";

const LIST_MS = 15 * 60000; // repos and their jobs change little: asked again after this, or on « rafraîchir »
const RESULT = { SUCCESS: "ok", FAILURE: "échec", UNSTABLE: "instable", ABORTED: "abandonné" };
const firstLine = (s) => (s ?? "").trim().split("\n")[0];
// A failed or timed-out call is a result like another: the round goes on.
const call = (cmd, args, opts) => exec(cmd, args, { timeout: 30000, ...opts }).catch((e) => ({ code: 1, stdout: "", stderr: String(e) }));
const rowKey = (r) => `${r.repo}/${r.branch}`;
const NOTE_MS = 300000; // an error stays under its row this long
const sh = async (cmd, args, timeout) => {
  const r = await call(cmd, args, { timeout: timeout ?? 30000 });
  if (r.code !== 0) throw new Error(firstLine(r.stderr) || `${cmd} ${args[0]} : code ${r.code}`);
  return r.stdout;
};
// Every folder a local space shows: its own and its panes' cwds.
const localFolders = () => spaces().filter((s) => !s.machine).map((s) => {
  const tabs = new Set(s.tabs.map((t) => t.id));
  return { space: s, folders: [s.folder, ...panes().filter((p) => tabs.has(p.tab)).map((p) => p.cwd)].filter(Boolean) };
});

export class Ci {
  constructor() {
    this.repos = null; this.jobs = []; this.listedAt = 0;
    this.groups = []; this.fixes = {}; this.notes = {}; this.noteAt = {};
    this.clones = new Map(); this.trees = {}; this.fixing = new Set();
    this.error = null; this.loading = false; this.at = 0; this.again = null;
    this.rerunning = new Set();
  }

  refresh(cx, force = false) {
    // A refresh asked during a round (« Rafraîchir », after a rerun) runs once that round ends, keeping its force.
    if (this.loading) { this.again = force || this.again === true; return; }
    this.loading = true;
    cx.spawn(async (cx) => {
      try { await this.round(force); } catch (e) { this.error = e.message; }
      this.loading = false; this.at = Date.now();
      const again = this.again;
      this.again = null;
      if (again !== null) this.refresh(cx, again);
      cx.notify();
    });
    // No cx.notify() here: render calls refresh, and GPUI forbids notify during render. The task's end redraws.
  }

  async round(force) {
    const now = Date.now(), jk = [];
    for (const [k, at] of Object.entries(this.noteAt)) if (now - at > NOTE_MS) { delete this.notes[k]; delete this.noteAt[k]; }
    if (force || this.repos === null || now - this.listedAt > LIST_MS) {
      const q = (kind, date) => call("gh", ["search", kind, "--author=@me", `--${date}=>${sinceDate(now)}`, "--owner", ORG, "--json", "repository", "--limit", "1000"]);
      const [prs, commits] = await Promise.all([q("prs", "merged-at"), q("commits", "committer-date")]);
      if (prs.code !== 0 && commits.code !== 0) throw new Error(firstLine(prs.stderr) || "gh search : échec");
      const repos = reposOf(prs.stdout, commits.stdout);
      // A repo without a Jenkins folder answers 404: it drops out.
      const ls = await Promise.all(repos.map((r) => call("jk", ["job", "ls", `${JOBS_FOLDER}/${r}`, "--json"])));
      jk.push(...ls.map((r) => ({ ok: jkReached(r) })));
      // An incomplete answer (rate limit, a jk timeout) is used only when nothing better is known, and asked again next round.
      const complete = listComplete([prs, commits], ls);
      if (complete || this.repos === null) {
        this.repos = repos;
        this.jobs = repos.flatMap((r, i) => ls[i].code === 0 ? longJobs(r, ls[i].stdout) : []);
      }
      if (complete) this.listedAt = now;
    }
    const runs = await Promise.all(this.jobs.map((j) => call("jk", ["run", "ls", j.jobPath, "--limit", "1", "--json"])));
    jk.push(...runs.map((r) => ({ ok: jkReached(r) })));
    const rows = this.jobs.map((j, i) => runs[i].code === 0 ? rowOf(j, runs[i].stdout, now) : null).filter(Boolean);
    const red = [...new Set(rows.filter((r) => r.state === "ko").map((r) => r.repo))];
    const fixes = {};
    await Promise.all(red.map(async (repo) => {
      const [prs, trees] = await Promise.all([
        call("gh", ["pr", "list", "-R", `${ORG}/${repo}`, "--state", "open", "--json", "number,headRefName,url", "--limit", "100"]),
        this.worktreeBranches(repo),
      ]);
      let open = [];
      try { open = prs.code === 0 ? JSON.parse(prs.stdout) : []; } catch { /* no PR known */ }
      for (const r of rows.filter((x) => x.repo === repo && x.state === "ko")) fixes[rowKey(r)] = fixOf(r, open, trees);
    }));
    this.groups = groups(rows); this.fixes = fixes;
    this.error = jenkinsDown(jk) ? "Jenkins injoignable (VPN ?)" : null;
  }

  // The branches checked out in the repo's local worktrees (none without a clone); kept for « fix en cours ».
  async worktreeBranches(repo) {
    const clone = await this.findClone(repo);
    const list = clone ? await call("git", ["-C", clone, "worktree", "list", "--porcelain"]) : null;
    this.trees[repo] = list?.code === 0 ? worktrees(list.stdout) : [];
    return this.trees[repo].map((w) => w.branch).filter(Boolean);
  }

  // A local checkout of softwarevidal/<repo>: a space or pane folder, ~/dev/agents-worktree/<repo>/*, else ~/dev/<repo>.
  // Copied from status-jc's findClone (a mod cannot import another's files). A miss is kept LIST_MS, a hit for good.
  async findClone(repo) {
    const known = this.clones.get(repo);
    if (known && (known.folder || Date.now() - known.at < LIST_MS)) return known.folder;
    const watch = await call("find", [`${home()}/dev/agents-worktree/${repo}`, "-mindepth", "1", "-maxdepth", "1", "-type", "d"]);
    const folders = [...localFolders().flatMap((l) => l.folders), ...(watch.code === 0 ? watch.stdout.split("\n").filter(Boolean) : []), `${home()}/dev/${repo}`];
    for (const folder of new Set(folders)) {
      const r = await call("git", ["-C", folder, "remote", "get-url", "origin"]);
      if (r.code === 0 && remoteRepo(r.stdout) === `${ORG}/${repo}`) { this.clones.set(repo, { folder }); return folder; }
    }
    this.clones.set(repo, { folder: null, at: Date.now() });
    return null;
  }

  // The local space showing folder (either form of the ~/dev symlink), or undefined.
  async spaceShowing(folder) {
    const real = (await call("realpath", [folder])).stdout?.trim();
    const shows = (f) => [folder, real].some((x) => x && (f === x || f.startsWith(`${x}/`)));
    return localFolders().find((l) => l.folders.some(shows))?.space;
  }

  note(key, text) { this.notes[key] = text; this.noteAt[key] = Date.now(); }

  // A worktree on fix/ci-<branch>-<N> from origin/<branch>, and a space with Claude told to fix build N or rerun it.
  fix(cx, row) {
    const key = rowKey(row);
    if (this.fixing.has(key)) return;
    this.fixing.add(key);
    this.notes[key] = "ouverture…"; delete this.noteAt[key];
    cx.spawn(async (cx) => {
      try {
        const clone = await this.findClone(row.repo);
        if (!clone) throw new Error(`aucun clone local de ${row.repo}`);
        const branch = fixBranch(row.branch, row.number);
        const folderOf = async () => worktrees(await sh("git", ["-C", clone, "worktree", "list", "--porcelain"])).find((w) => w.branch === branch)?.folder;
        let folder = await folderOf();
        if (!folder) {
          await sh("git", ["-C", clone, "fetch", "origin", row.branch], 120000);
          // A fix branch left without its worktree is switched to, as it is: --create refuses an existing branch.
          const exists = (await call("git", ["-C", clone, "show-ref", "--verify", "--quiet", `refs/heads/${branch}`])).code === 0;
          await sh("wt", ["-C", clone, "switch", ...(exists ? [branch] : ["--create", branch, "--base", `origin/${row.branch}`]), "--no-cd"], 600000);
          folder = await folderOf();
        }
        if (!folder) throw new Error(`worktrunk n'a pas sorti ${branch}`);
        const space = await this.spaceShowing(folder);
        if (space) run("space.select", { id: space.id });
        else run("space.new", { folder, tab: `ci ${row.branch}`, argv: ["claude"], task: fixPrompt(row) });
        delete this.notes[key];
        this.fixes[key] = { branch };
        this.trees[row.repo] = [...(this.trees[row.repo] ?? []), { folder, branch }];
      } catch (e) { this.note(key, `Corriger : ${e.message}`); }
      this.fixing.delete(key);
      cx.notify();
    });
  }

  // One rerun at a time per row: a second click would queue a second build. The note says it was relaunched,
  // since the refresh right after still sees the old build until Jenkins starts the new one.
  rerun(cx, row) {
    const key = rowKey(row);
    if (this.rerunning.has(key)) return;
    this.rerunning.add(key);
    this.notes[key] = "relance…"; delete this.noteAt[key];
    cx.spawn(async (cx) => {
      const r = await call("jk", ["run", "rerun", row.jobPath, String(row.number)]);
      this.note(key, r.code === 0 ? `#${row.number} relancé` : `relance : ${firstLine(r.stderr || r.stdout)}`);
      this.rerunning.delete(key);
      if (r.code === 0) this.refresh(cx);
      cx.notify();
    });
  }

  render(_cx, t) {
    const now = Date.now();
    const dot = (state) => state === "ok" ? div().size(7).rounded(4).flex_none().bg(t.done)
      : state === "ko" ? div().size(7).rounded(4).flex_none().bg(t.ansi1)
      : state === "idle" ? div().size(7).rounded(4).flex_none().border_1().border_color(t.dim)
      : div().size(7).rounded(4).flex_none().border_1().border_color(t.working).loop("opacity", { from: 0.3, to: 1, period: 1200 });
    // A glyph or a verb inside a clickable row: its own click must not open the build.
    const icon = (id, glyph, tip, onClick) => h_flex().id(id).w(20).h(20).flex_none().items_center().justify_center().rounded(4)
      .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(tip).accessibility_label(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); }).child(glyph);
    const action = (id, text, onClick, color, tip) => h_flex().id(id).flex_none().h(20).px(4).items_center().rounded(4).text_size(11)
      .text_color(color ?? t.accent).cursor_pointer().hover((s) => s.bg(t.hover))
      .when(Boolean(tip), (e) => e.tooltip(tip).accessibility_label(tip))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); }).child(text);

    const row = (r) => {
      const key = rowKey(r), fix = this.fixes[key], note = this.notes[key];
      const age = r.state === "running" ? minutes(now - r.startTime) : `il y a ${minutes(now - r.startTime - r.durationMs)}`;
      const word = r.state === "running" ? "en cours" : RESULT[r.result] ?? (r.result ?? "").toLowerCase();
      const fixing = this.fixing.has(key) ? div()
        : fix ? action(`ci-fixing-${key}`, fix.pr ? `fix en cours → #${fix.pr.number}` : "fix en cours", (cx) => this.goToFix(cx, r), t.muted)
        : action(`ci-fix-${key}`, "Corriger", (cx) => this.fix(cx, r), null,
          `Worktree ${fixBranch(r.branch, r.number)} et Claude : relance ou corrige, puis PR brouillon vers ${r.branch}`);
      // A red row has its buttons: its age goes to the tooltip, so the branch name keeps its room.
      const red = r.state === "ko";
      return v_flex().gap(2)
        .child(h_flex().id(`ci-row-${key}`).gap(8).items_center().cursor_pointer().hover((s) => s.opacity(0.8))
          .tooltip(red ? `Ouvrir le build Jenkins (fini ${age})` : "Ouvrir le build Jenkins").on_click(() => exec("open", [r.url]))
          .child(dot(r.state))
          .child(div().flex_1().min_w(0).truncate().child(r.branch))
          .child(div().flex_none().text_color(red ? t.ansi1 : t.foreground).child(`#${r.number} ${word}`))
          .when(!red, (e) => e.child(div().flex_none().text_size(11).text_color(t.dim).child(age)))
          .when(red, (e) => e
            .child(icon(`ci-log-${key}`, svg("mods/workspace-chrome/file-text.svg").size(13), "Log Jenkins", () => exec("open", [`${r.url}console`])))
            .child(icon(`ci-rerun-${key}`, svg("mods/pr/rerun.svg").size(13), "Relancer le build", (cx) => this.rerun(cx, r)))
            .child(fixing)))
        .when(Boolean(note), (e) => e.child(div().pl(15).text_size(11).text_color(t.muted).child(note)));
    };

    const empty = (text) => div().text_color(t.dim).child(text);
    // An error sits above the last known rows: they are still the latest state.
    const list = this.repos === null ? (this.error ? [] : [empty("Recherche des builds…")])
      : this.repos.length === 0 ? [empty("Aucune contribution de toi depuis 7 jours")]
      : this.groups.length === 0 ? [empty("Aucun build de branche longue cette semaine")]
      : this.groups.map((g) => v_flex().gap(6).pb(12)
        .child(div().font_semibold().child(g.repo))
        .children(g.rows.map(row)));
    const body = [this.error ? div().pb(10).text_color(t.ansi1).child(this.error) : null, ...list].filter(Boolean);

    const header = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("CI des branches longues")).child(div().flex_1())
      .child(div().text_size(11).text_color(t.dim).child(this.loading ? "…" : this.at ? (now - this.at < 60000 ? "à l'instant" : `il y a ${minutes(now - this.at)}`) : ""))
      .child(div().id("ci-refresh").text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.refresh(cx, true); cx.notify(); }).child("Rafraîchir"));
    return v_flex().id("ci").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(13)
      .child(header)
      .child(v_flex().id("ci-body").flex_1().min_h(0).overflow_y_scroll().p(14).text_size(12).children(body));
  }

  // « fix en cours »: the space showing its worktree, else its PR; with neither, a space with Claude on the worktree.
  goToFix(cx, row) {
    const fix = this.fixes[rowKey(row)];
    const folder = (this.trees[row.repo] ?? []).find((w) => w.branch === fix?.branch)?.folder;
    cx.spawn(async () => {
      const space = folder ? await this.spaceShowing(folder) : undefined;
      if (space) run("space.select", { id: space.id });
      else if (fix?.pr) exec("open", [fix.pr.url]);
      else if (folder) run("space.new", { folder, argv: ["claude"] });
    });
  }
}
