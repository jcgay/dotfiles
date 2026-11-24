// The CI panel (view "ci"): the last Jenkins build of each long-lived branch of the repos I contributed to this week.
// main.js delegates to it; it asks gh and jk only when main.js calls refresh (panel shown).
// Design: ~/.config/herdr-app/docs/2026-11-24-ci-watch-design.md
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec } from "herdr";
import { minutes } from "./model.js";
import { ORG, JOBS_FOLDER, sinceDate, reposOf, longJobs, rowOf, fixOf, groups, jenkinsDown } from "./ci-model.js";

const LIST_MS = 15 * 60000; // repos and their jobs change little: asked again after this, or on « rafraîchir »
const RESULT = { SUCCESS: "ok", FAILURE: "échec", UNSTABLE: "instable", ABORTED: "abandonné" };
const firstLine = (s) => (s ?? "").trim().split("\n")[0];
// A failed or timed-out call is a result like another: the round goes on.
const call = (cmd, args, opts) => exec(cmd, args, { timeout: 30000, ...opts }).catch((e) => ({ code: 1, stdout: "", stderr: String(e) }));
const rowKey = (r) => `${r.repo}/${r.branch}`;

export class Ci {
  constructor() {
    this.repos = null; this.jobs = []; this.listedAt = 0;
    this.groups = []; this.fixes = {}; this.notes = {};
    this.error = null; this.loading = false; this.at = 0;
  }

  refresh(cx, force = false) {
    if (this.loading) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try { await this.round(force); } catch (e) { this.error = e.message; }
      this.loading = false; this.at = Date.now();
      cx.notify();
    });
    // No cx.notify() here: render calls refresh, and GPUI forbids notify during render. The task's end redraws.
  }

  async round(force) {
    const now = Date.now(), jk = [];
    if (force || this.repos === null || now - this.listedAt > LIST_MS) {
      const q = (kind, date) => call("gh", ["search", kind, "--author=@me", `--${date}=>${sinceDate(now)}`, "--owner", ORG, "--json", "repository", "--limit", "1000"]);
      const [prs, commits] = await Promise.all([q("prs", "merged-at"), q("commits", "committer-date")]);
      if (prs.code !== 0 && commits.code !== 0) throw new Error(firstLine(prs.stderr) || "gh search : échec");
      const repos = reposOf(prs.stdout, commits.stdout);
      // A repo without a Jenkins folder answers 404: it drops out.
      const ls = await Promise.all(repos.map((r) => call("jk", ["job", "ls", `${JOBS_FOLDER}/${r}`, "--json"])));
      jk.push(...ls.map((r) => ({ ok: r.code === 0 })));
      this.repos = repos;
      this.jobs = repos.flatMap((r, i) => ls[i].code === 0 ? longJobs(r, ls[i].stdout) : []);
      // Every jk call failed (VPN off): ask the list again next round.
      if (!jenkinsDown(jk)) this.listedAt = now;
    }
    const runs = await Promise.all(this.jobs.map((j) => call("jk", ["run", "ls", j.jobPath, "--limit", "1", "--json"])));
    jk.push(...runs.map((r) => ({ ok: r.code === 0 })));
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

  // The branches checked out in the repo's local worktrees: none until Corriger knows where the clone is.
  async worktreeBranches(_repo) { return []; }

  fix(_cx, _row) {}

  rerun(cx, row) {
    const key = rowKey(row);
    this.notes[key] = "relance…";
    cx.spawn(async (cx) => {
      const r = await call("jk", ["run", "rerun", row.jobPath, String(row.number)]);
      this.notes[key] = r.code === 0 ? null : `relance : ${firstLine(r.stderr || r.stdout)}`;
      if (r.code === 0) this.refresh(cx);
      cx.notify();
    });
  }

  render(_cx, t) {
    const now = Date.now();
    const dot = (state) => state === "ok" ? div().size(7).rounded(4).flex_none().bg(t.done)
      : state === "ko" ? div().size(7).rounded(4).flex_none().bg(t.ansi1)
      : div().size(7).rounded(4).flex_none().border_1().border_color(t.working).loop("opacity", { from: 0.3, to: 1, period: 1200 });
    // A glyph or a verb inside a clickable row: its own click must not open the build.
    const icon = (id, glyph, tip, onClick) => h_flex().id(id).w(20).h(20).flex_none().items_center().justify_center().rounded(4)
      .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(tip).accessibility_label(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); }).child(glyph);
    const action = (id, text, onClick, color) => h_flex().id(id).flex_none().h(20).px(4).items_center().rounded(4).text_size(11)
      .text_color(color ?? t.accent).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); }).child(text);

    const row = (r) => {
      const key = rowKey(r), fix = this.fixes[key], note = this.notes[key];
      const age = r.state === "running" ? minutes(now - r.startTime) : `il y a ${minutes(now - r.startTime - r.durationMs)}`;
      const word = r.state === "running" ? "en cours" : RESULT[r.result] ?? (r.result ?? "").toLowerCase();
      const fixing = fix?.pr ? action(`ci-fixing-${key}`, `fix en cours → #${fix.pr.number}`, () => exec("open", [fix.pr.url]), t.muted)
        : fix ? action(`ci-fixing-${key}`, "fix en cours", (cx) => this.goToFix(cx, r), t.muted)
        : action(`ci-fix-${key}`, "Corriger", (cx) => this.fix(cx, r));
      return v_flex().gap(2)
        .child(h_flex().id(`ci-row-${key}`).gap(8).items_center().cursor_pointer().hover((s) => s.opacity(0.8))
          .tooltip("Ouvrir le build Jenkins").on_click(() => exec("open", [r.url]))
          .child(dot(r.state))
          .child(div().flex_1().min_w(0).truncate().child(r.branch))
          .child(div().flex_none().text_color(r.state === "ko" ? t.ansi1 : t.foreground).child(`#${r.number} ${word}`))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(age))
          .when(r.state === "ko", (e) => e
            .child(icon(`ci-log-${key}`, svg("mods/workspace-chrome/file-text.svg").size(13), "Log Jenkins", () => exec("open", [`${r.url}console`])))
            .child(icon(`ci-rerun-${key}`, svg("mods/pr/rerun.svg").size(13), "Relancer le build", (cx) => this.rerun(cx, r)))
            .child(fixing)))
        .when(Boolean(note), (e) => e.child(div().pl(15).text_size(11).text_color(t.muted).child(note)));
    };

    const empty = (text) => div().text_color(t.dim).child(text);
    const body = this.error ? [div().text_color(t.ansi1).child(this.error)]
      : this.repos === null ? [empty("…")]
      : this.repos.length === 0 ? [empty("Aucune contribution de toi depuis 7 jours")]
      : this.groups.length === 0 ? [empty("Aucun build de branche longue cette semaine")]
      : this.groups.map((g) => v_flex().gap(6).pb(12)
        .child(div().font_semibold().child(g.repo))
        .children(g.rows.map(row)));

    const header = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("CI des branches longues")).child(div().flex_1())
      .child(div().text_size(11).text_color(t.dim).child(this.loading ? "…" : this.at ? `il y a ${minutes(now - this.at)}` : ""))
      .child(div().id("ci-refresh").text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => { this.refresh(cx, true); cx.notify(); }).child("rafraîchir"));
    return v_flex().id("ci").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border)
      .text_color(t.foreground).text_size(13)
      .child(header)
      .child(v_flex().id("ci-body").flex_1().min_h(0).overflow_y_scroll().p(14).text_size(12).children(body));
  }

  goToFix(_cx, _row) {}
}
