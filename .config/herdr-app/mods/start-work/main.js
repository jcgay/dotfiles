// start-work: pick a Jira ticket, a GitHub issue or free work, then work.js assigns it, makes the
// worktree with worktrunk, opens a space with Claude and types the brainstorming prompt (unsent).
// Design: ~/.config/herdr-app/docs/2026-11-13-start-work-design.md

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, ScrollHandle } from "gpui-base";
import { props, closeOverlay, theme, focused, spaces, exec, appHome, readTextFile, notify } from "herdr";
import { branchFor, parseQuery, jiraProjects, jql, parseJiraIssues, parseGhIssues, existingWork, baseChoices } from "./lib.js";
import { start, cmd, jira, myName } from "./work.js";

const lines = (s) => s.split("\n").map((l) => l.trim()).filter(Boolean);

// The repo a folder belongs to: its main checkout and its name.
async function repoOf(folder) {
  const r = await exec("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { cwd: folder });
  if (r.code !== 0) return null;
  const common = r.stdout.trim();
  const main = common.endsWith("/.git") ? common.slice(0, -5) : common;
  return { main, name: main.split("/").pop() };
}

export default class StartWork extends View {
  init(_props, cx) {
    this.repo = undefined; // undefined: looking, null: not usable (this.blocked says why)
    this.blocked = "";
    this.rows = []; // Item[] shown, Jira then GitHub then free
    this.notes = []; // a line per source that failed
    this.at = 0;
    this.seq = 0; // the latest query: older answers are dropped
    this.take = true;
    this.busy = false;
    this.error = "";
    this.bases = [];
    this.base = 0;
    this.branchOf = null; // the row the branch field was filled from
    this.ctx = { branches: [], prs: [], delivered: new Set(), projects: [] };
    this.input = InputState.new({ placeholder: "Clé Jira, #issue, ou décris le travail" });
    this.input.on("change", (_e, cx) => { this.error = ""; this.search(cx); cx.notify(); });
    this.input.on("submit", (_e, cx) => this.go(cx));
    this.branch = InputState.new({ placeholder: "branche" });
    this.branch.on("change", (_e, cx) => cx.notify());
    this.branch.on("submit", (_e, cx) => this.go(cx));
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new(); // keeps the row chosen with the arrows on screen
    this.handle.focus();
    cx.spawn(async (cx) => this.load(cx));
  }

  async load(cx) {
    const f = focused();
    const space = spaces().find((s) => s.id === f?.space) ?? spaces().find((s) => s.active);
    if (space?.machine) { this.repo = null; this.blocked = "Disponible seulement sur cette machine."; return cx.notify(); }
    this.repo = await repoOf(f?.cwd || space?.folder || "/").catch(() => null);
    if (!this.repo) { this.blocked = "Pas un dépôt git : ouvre start-work depuis un terminal dans un dépôt."; return cx.notify(); }
    cx.notify();
    cx.timer.after(100, () => this.input.focus());
    const main = this.repo.main;
    await exec("git", ["fetch", "--quiet", "origin"], { cwd: main, timeout: 60000 }).catch(() => null);
    myName().then((name) => { this.me = name; cx.notify(); }).catch(() => {});
    const [refs, head, subjects, config] = await Promise.all([
      cmd("git", ["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)", "refs/heads", "refs/remotes/origin"], main).catch(() => ""),
      cmd("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], main).catch(() => "origin/master"),
      cmd("git", ["log", "--since=12.months", "--format=%s"], main).catch(() => ""),
      readTextFile(`${appHome()}/mods/start-work/config.json`).then((t) => JSON.parse(t ?? "{}")).catch(() => ({})),
    ]);
    const defaultBranch = head.trim().replace(/^origin\//, "");
    const all = lines(refs).filter((b) => b !== "origin" && b !== "origin/HEAD");
    this.bases = baseChoices(defaultBranch, all.filter((b) => b.startsWith("origin/"))).slice(0, 5); // the 4 newest sprints
    this.ctx.branches = [...new Set(all.map((b) => b.replace(/^origin\//, "")))];
    this.ctx.projects = config.jira?.[this.repo.name] ? [].concat(config.jira[this.repo.name]) : jiraProjects(lines(subjects));
    const [prs, mergedPrs] = await Promise.all([
      cmd("gh", ["pr", "list", "--state", "open", "--limit", "100", "--json", "number,title,headRefName"], main).then(JSON.parse).catch(() => []),
      cmd("gh", ["pr", "list", "--state", "merged", "--limit", "200", "--json", "headRefName"], main).then(JSON.parse).catch(() => []),
    ]);
    this.ctx.prs = prs;
    // Delivered: a merged PR only. `git branch --merged` also lists a branch just created, with no
    // commit of its own yet, and its ticket would never resume.
    this.ctx.delivered = new Set(mergedPrs.map((p) => p.headRefName));
    this.ready = true;
    this.search(cx, true);
  }

  // Ask Jira and GitHub for what the field holds, after a short pause in typing.
  search(cx, now = false) {
    if (!this.repo) return;
    const seq = ++this.seq;
    const ask = (cx) => cx.spawn(async (cx) => {
      const text = this.input.value();
      const q = parseQuery(text);
      const main = this.repo.main, projects = this.ctx.projects;
      const gh = ["--json", "number,title,url,assignees"];
      const jiraList = (query) => jira(["issue", "list", "-p", "", "-q", query, "--order-by", "updated", "--raw", "--paginate", "0:20"], main);
      const jiraCall = q.kind === "key" ? jira(["issue", "view", q.key, "--raw"], main)
        : q.kind === "issue" || !projects.length ? null
        : jiraList(jql({ projects, mine: q.kind === "empty", text: q.kind === "text" ? q.text : undefined }));
      const ghCall = q.kind === "issue" ? cmd("gh", ["issue", "view", String(q.number), ...gh], main)
        : q.kind === "key" ? null
        : cmd("gh", ["issue", "list", "--state", "open", "--limit", "20", ...gh, ...(q.kind === "empty" ? ["--assignee", "@me"] : ["--search", q.text])], main);
      const [j, g] = await Promise.allSettled([jiraCall, ghCall]);
      if (seq !== this.seq) return; // a newer query is on its way
      const notes = [], rows = [];
      if (jiraCall) { if (j.status === "fulfilled") rows.push(...parseJiraIssues(j.value || "[]")); else notes.push(`Jira : ${j.reason?.message ?? j.reason}`); }
      else if (this.ready && q.kind !== "issue" && !projects.length) notes.push("Jira : aucun projet trouvé pour ce dépôt (mods/start-work/config.json)");
      if (ghCall) { if (g.status === "fulfilled") rows.push(...parseGhIssues(g.value || "[]")); else notes.push(`GitHub : ${g.reason?.message ?? g.reason}`); }
      if (q.kind === "text") rows.push({ kind: "free", title: q.text });
      this.rows = rows; this.notes = notes; this.at = 0; this.shown = seq;
      this.sync();
      cx.notify();
    });
    // Each callback gets its own cx: the change handler's must not be kept for the timer.
    if (now) ask(cx); else cx.timer.after(300, (cx) => { if (seq === this.seq) ask(cx); });
  }

  selected() { return this.rows[Math.min(this.at, this.rows.length - 1)]; }
  rowId(r) { return r ? (r.kind === "jira" ? r.key : r.kind === "issue" ? `#${r.number}` : `free:${r.title}`) : null; }
  resume() { const s = this.selected(); return s ? existingWork(s, this.ctx.branches, this.ctx.prs, this.ctx.delivered) : null; }

  // Fill the branch field from the chosen row; a name typed by hand stays until the row changes.
  sync() {
    const s = this.selected(), id = this.rowId(s);
    if (id === this.branchOf && s?.kind !== "free") return;
    this.branchOf = id;
    this.branch.set_value(s ? this.resume()?.branch ?? branchFor(s) : "");
  }

  dismiss() { closeOverlay(props().overlay); }

  go(cx) {
    const item = this.selected(), branch = this.branch.value().trim();
    // Rows of an older query (Enter typed before the answer) would start the wrong ticket.
    if (this.busy || !this.ready || !item || !branch || this.shown !== this.seq) return;
    const work = this.resume();
    const state = { repo: this.repo, item, base: this.bases[this.base], branch, take: this.take && item.kind === "jira", resume: work?.branch === branch ? work : null };
    this.busy = true; this.error = ""; this.phase = "";
    cx.spawn(async (cx) => {
      try {
        const notes = await start(state, cx, (phase) => { this.phase = phase; cx.notify(); });
        for (const n of notes) notify({ title: "start-work", body: n, level: "warning", timeout: 60000 });
        this.busy = false; // before closing: close() reports a run cut short
        this.dismiss();
      } catch (e) { this.error = String(e?.message ?? e); }
      this.busy = false; this.phase = "";
      cx.notify();
    });
    cx.notify();
  }

  // Closed while working (Esc is Herdr's, it closes even then): the run is cancelled, so say where.
  async close() {
    if (this.busy) notify({ title: "start-work interrompu", body: `Fenêtre fermée pendant : ${this.phase || "la création"}. Ce qui était fait reste fait (ticket, worktree) ; vérifie et relance.`, level: "error", timeout: 60000 });
  }

  key(e, cx) {
    if (e.key === "escape") { if (this.busy) return cx.stop_propagation(); return this.dismiss(); }
    const n = this.rows.length;
    if ((e.key === "down" || e.key === "up") && n) {
      this.at = (this.at + (e.key === "down" ? 1 : n - 1)) % n;
      this.scroll.scroll_to_item(this.at);
      this.sync();
      cx.stop_propagation();
      cx.notify();
    }
  }

  row(item, i, t) {
    const on = i === this.at;
    const [source, id] = item.kind === "jira" ? ["JIRA", item.key] : item.kind === "issue" ? ["GH", `#${item.number}`] : ["", "Sans ticket :"];
    const who = item.kind === "jira" && item.assigneeName && item.assigneeName !== this.me ? item.assigneeName : "";
    return h_flex().id(`row-${i}`).flex_none().h(30).px(10).gap(10).items_center().rounded(6).cursor_pointer()
      .when(on, (el) => el.bg(t.selected)).when(!on, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click((_e, cx) => { this.at = i; this.sync(); cx.notify(); })
      .child(div().w(34).flex_none().text_size(10.5).text_color(t.dim).child(source))
      .child(div().flex_none().text_color(item.kind === "free" ? t.muted : t.accent).child(id))
      .child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(item.title))
      .when(Boolean(who), (el) => el.child(div().flex_none().text_size(11).text_color(t.dim).child(who)))
      .when(Boolean(item.status), (el) => el.child(div().flex_none().text_size(11).text_color(t.muted).child(item.status)));
  }

  render() {
    const t = theme(), item = this.selected(), work = this.resume();
    const resuming = Boolean(work && work.branch === this.branch.value().trim());
    const field = (state) => Input.new(state).h(32).px(10).items_center().rounded(6).border(1).border_color(t.input).bg(t.background).text_color(t.foreground);
    const enabled = this.ready && item && !this.busy;
    return v_flex().id("start-work").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(16).gap(10).bg(t.popover).text_size(13).text_color(t.foreground)
      .child(h_flex().child(div().flex_1().font_semibold().child(`Commencer un travail${this.repo ? ` · ${this.repo.name}` : ""}`))
        .child(div().text_size(11).text_color(t.dim).child(this.ctx.projects.join(", "))))
      .when(this.repo === undefined, (el) => el.child(div().text_color(t.muted).child("…")))
      .when(this.repo === null, (el) => el.child(div().text_color(t.muted).child(this.blocked)))
      .when(Boolean(this.repo), (el) => el
        .child(field(this.input))
        .children(this.notes.map((n) => div().text_size(11).text_color(t.blocked).truncate().child(n)))
        .child(div().relative().flex_1().min_h(0)
          .child(v_flex().id("sw-list").size_full().overflow_y_scroll().track_scroll(this.scroll).children(this.rows.map((r, i) => this.row(r, i, t)))
            .when(!this.rows.length, (el) => el.child(div().p(10).text_color(t.dim).child(this.ready ? "Rien trouvé." : "Chargement…"))))
          .child(Scrollbar.vertical("sw-list").absolute().inset_0()))
        .child(h_flex().gap(6).items_center().flex_wrap().text_size(12)
          .child(div().text_color(t.dim).child("Base"))
          .children(this.bases.map((b, i) => div().id(`base-${i}`).px(8).py(2).rounded(5).cursor_pointer().border(1)
            .border_color(i === this.base ? t.accent : t.border).text_color(i === this.base ? t.foreground : t.muted)
            .on_click((_e, cx) => { this.base = i; cx.notify(); }).child(b))))
        .child(h_flex().gap(8).items_center().child(div().text_size(12).text_color(t.dim).child("Branche")).child(div().flex_1().child(field(this.branch))))
        .child(h_flex().gap(10).items_center()
          .when(item?.kind === "jira" && !resuming, (el) => el.child(div().id("take").cursor_pointer().text_size(12).text_color(t.muted)
            .on_click((_e, cx) => { this.take = !this.take; cx.notify(); }).child(`${this.take ? "☑" : "☐"} M'assigner et passer En cours`)))
          .child(div().flex_1())
          .when(Boolean(this.error), (el) => el.child(div().max_w(320).text_size(11).text_color(t.ansi1).child(this.error)))
          .child(div().id("go").h(30).px(14).flex().items_center().rounded(7).text_size(12)
            .bg(enabled ? t.solid : t.raised).text_color(enabled ? t.solid_foreground : t.dim).when(Boolean(enabled), (e) => e.cursor_pointer())
            .on_click((_e, cx) => this.go(cx)).child(this.busy ? (this.phase || "Création…") : resuming ? "Reprendre" : "Créer"))))
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).child("↑↓ choisir · ↵ créer · esc fermer"));
  }
}
