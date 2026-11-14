import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, agents, focused, exec, theme, layout, run, shared, setShared } from "herdr";
import { jenkinsBuild, checks, minutes, deploymentsFor, parseContainers } from "./model.js";

// The pull request of the shown space's branch (gh), and its Jenkins build (jk).
const FIELDS = "number,title,state,isDraft,reviewDecision,reviewRequests,url,headRefName,baseRefName,additions,deletions,statusCheckRollup";

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, branch: pane?.branch ?? space?.branch ?? null, on: space?.machine ?? null };
}
const key = () => JSON.stringify(location());

// A hidden copy keeps its timers: ask gh and jk only while the panel shows this block.
function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const found = find(child, id); if (found) return found; }
  return null;
}
function visible() {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  return Boolean(panel && !panel.hidden && body?.active === "pr");
}

export default class PullRequest extends View {
  init(_props, cx) {
    this.context = null; this.pr = null; this.build = null; this.error = null; this.loading = false; this.note = null;
    this.deployed = []; this.scan = { at: 0, list: null };
    cx.timer.every(60000, (cx) => { if (visible()) this.refresh(cx); });
  }

  // Every container of the shared Docker hosts, through the wrappers in ~/.local/bin. One scan
  // serves every space for 5 minutes: it inspects some 270 containers.
  async containers(force) {
    if (!force && this.scan.list && Date.now() - this.scan.at < 300000) return this.scan.list;
    const lists = await Promise.all(["dockersw", "docker-sw2", "dockerbo"].map((cli) =>
      exec("sh", ["-c", `${cli} ps -q | xargs ${cli} inspect --format '{{.Name}}|{{json .Config.Env}}'`], { timeout: 30000 })
        .then((r) => parseContainers(r.stdout)).catch(() => [])));
    this.scan = { at: Date.now(), list: lists.flat() };
    return this.scan.list;
  }

  refresh(cx, force = false) {
    const where = location(), context = key();
    if (context !== this.context) { this.context = context; this.pr = null; this.build = null; this.error = null; this.deployed = []; }
    if (!where.cwd || !where.branch) { this.loading = false; return; }
    this.loading = true;
    cx.spawn(async (cx) => {
      let pr = null, build = null, error = null, deployed = [];
      try {
        const [r, origin] = await Promise.all([
          exec("gh", ["pr", "view", "--json", FIELDS], { cwd: where.cwd, on: where.on, timeout: 20000 }),
          exec("git", ["remote", "get-url", "origin"], { cwd: where.cwd, on: where.on }).catch(() => null),
        ]);
        if (r.code === 0) pr = JSON.parse(r.stdout);
        else if (!/no (open )?pull requests? found/i.test(r.stderr)) error = (r.stderr || r.stdout).trim().split("\n")[0];
        const repo = origin?.code === 0 ? origin.stdout.trim().replace(/\.git$/, "").split(/[/:]/).pop() : null;
        const jenkins = pr && checks(pr.statusCheckRollup).map((c) => jenkinsBuild(c.url)).find(Boolean);
        const [j, containers] = await Promise.all([
          jenkins ? exec("jk", ["run", "view", jenkins.jobPath, String(jenkins.number), "--json"], { timeout: 20000 }).catch(() => null) : null,
          repo ? this.containers(force) : [],
        ]);
        if (jenkins) build = j?.code === 0 ? { ...jenkins, ...JSON.parse(j.stdout) } : { ...jenkins, unreachable: true };
        deployed = deploymentsFor(containers, { repo, branch: pr?.headRefName ?? where.branch, pr: pr?.number, title: pr?.title });
      } catch (e) { error = String(e?.message ?? e); }
      if (key() === context) { this.pr = pr; this.build = build; this.error = error; this.deployed = deployed; this.loading = false; }
      cx.notify();
    });
  }

  act(cx, label, args, opts) {
    this.note = `${label}…`;
    cx.spawn(async (cx) => {
      const r = await exec(args[0], args.slice(1), opts).catch((e) => ({ code: 1, stderr: String(e) }));
      this.note = r.code === 0 ? null : `${label} : ${(r.stderr || r.stdout).trim().split("\n")[0]}`;
      this.refresh(cx); cx.notify();
    });
    cx.notify();
  }

  render(cx) {
    // Opening the panel, or another space or pane while it is open, asks again.
    const shown = visible();
    if (shown && (!this.shown || key() !== this.context)) this.refresh(cx);
    this.shown = shown;
    const t = theme(), pr = this.pr, b = this.build, where = location();
    const dot = (state) => state === "ok" ? div().size(7).rounded(4).flex_none().bg(t.done)
      : state === "ko" ? div().size(7).rounded(4).flex_none().bg(t.ansi1)
      : div().size(7).rounded(4).flex_none().border_1().border_color(t.working).loop("opacity", { from: 0.3, to: 1, period: 1200 });
    const chip = (text, color) => div().px(6).py(1).rounded(4).border_1().border_color(color).text_size(10.5).text_color(color).child(text);
    const button = (id, text, onClick, primary) => div().id(id).h(28).px(12).flex().items_center().rounded(7).cursor_pointer().text_size(12)
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground).hover((s) => s.opacity(0.85))
      .on_click((_e, cx) => onClick(cx)).child(text);
    const section = (title) => div().pt(10).pb(4).text_size(10.5).font_semibold().text_color(t.dim).child(title.toUpperCase());

    const state = pr && (pr.isDraft ? ["Brouillon", t.muted] : pr.state === "MERGED" ? ["Mergée", t.ansi5] : pr.state === "CLOSED" ? ["Fermée", t.ansi1] : ["Ouverte", t.done]);
    const review = pr && ({ APPROVED: ["Approuvée", t.done], CHANGES_REQUESTED: ["Changements demandés", t.blocked], REVIEW_REQUIRED: ["Revue attendue", t.muted] }[pr.reviewDecision]);
    const list = pr ? checks(pr.statusCheckRollup) : [];
    const running = b && !b.unreachable && b.status !== "completed";
    const deployed = (el) => el.when(this.deployed.length > 0, (e) => e.child(section("Déployée sur")).children(this.deployed.map((url, i) =>
      h_flex().id(`deployed-${i}`).h(24).gap(8).items_center().rounded(6).px(4).text_size(12).cursor_pointer().text_color(t.accent)
        .hover((s) => s.bg(t.hover)).on_click(() => exec("open", [url])).child(div().flex_1().min_w(0).truncate().child(url.replace(/^https?:\/\//, ""))))));

    const body = !where.branch ? div().text_color(t.dim).child("Pas de branche git ici.")
      : this.error ? div().text_color(t.ansi1).child(this.error)
      : !pr ? v_flex().gap(10).child(div().text_color(t.dim).child(this.loading ? "Recherche de la PR…" : `Pas de PR pour ${where.branch}.`))
        .when(!this.loading, (e) => e.child(h_flex().child(button("pr-create", "Créer la PR", (cx) => this.act(cx, "Création", ["gh", "pr", "create", "--web"], { cwd: where.cwd, on: where.on })))))
        .when(true, deployed)
      : v_flex().gap(4)
        .child(div().text_size(14).font_semibold().child(pr.title))
        .child(h_flex().gap(6).items_center().flex_wrap().pt(4)
          .child(div().text_color(t.muted).child(`#${pr.number}`))
          .child(chip(...state)).when(Boolean(review), (e) => e.child(chip(...review)))
          .child(div().text_size(11).text_color(t.ansi2).child(`+${pr.additions}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${pr.deletions}`)))
        .child(div().text_size(11).text_color(t.dim).child(`${pr.headRefName} → ${pr.baseRefName}`))
        .when((pr.reviewRequests ?? []).length > 0, (e) => e.child(div().text_size(11).text_color(t.muted)
          .child(`Revue demandée à ${pr.reviewRequests.map((r) => r.login ?? r.name ?? r.slug).join(", ")}`)))
        .when(true, deployed)
        .when(Boolean(b), (e) => e.child(section("Jenkins")).child(b.unreachable
          ? div().text_size(12).text_color(t.dim).child("Jenkins injoignable (VPN ?)")
          : v_flex().gap(3).text_size(12)
            .child(h_flex().gap(8).items_center()
              .child(dot(running ? "running" : b.result === "SUCCESS" ? "ok" : "ko"))
              .child(div().font_semibold().child(`#${b.number} ${running ? "en cours" : ({ SUCCESS: "réussi", FAILURE: "échec", UNSTABLE: "instable", ABORTED: "annulé" }[b.result] ?? (b.result ?? "").toLowerCase())}`))
              .child(div().text_color(t.dim).child(running
                ? `${minutes(Date.now() - Date.parse(b.startTime))} / ~${minutes(b.estimatedDurationMs)}`
                : minutes(b.durationMs))))
            .when(Boolean(b.tests?.total), (e) => e.child(div().text_color(b.tests.failed ? t.ansi1 : t.muted)
              .child(`${b.tests.total} tests · ${b.tests.failed} en échec · ${b.tests.skipped} ignorés`)))))
        .when(list.length > 0, (e) => e.child(section("Checks")).children(list.map((c, i) =>
          h_flex().id(`check-${i}`).h(24).gap(8).items_center().rounded(6).px(4).text_size(12)
            .when(Boolean(c.url), (r) => r.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => exec("open", [c.url])))
            .child(dot(c.state)).child(div().flex_1().min_w(0).truncate().child(c.name)))))
        .child(h_flex().gap(8).pt(14).flex_wrap()
          .child(button("pr-open", "Ouvrir la PR", () => exec("open", [pr.url]), true))
          .when(Boolean(b && !b.unreachable), (e) => e.child(button("pr-jenkins", "Log Jenkins", () => exec("open", [`${b.url}console`]))))
          .when(Boolean(b && !b.unreachable && !running && b.result !== "SUCCESS"), (e) => e.child(button("pr-rerun", "Relancer",
            (cx) => this.act(cx, "Relance", ["jk", "run", "rerun", b.jobPath, String(b.number)], { timeout: 30000 })))));

    // The PR watch (status-jc writes it): all PRs, so it shows even without one in this space.
    const reg = shared("pr-watch") ?? null, entries = Object.entries(reg?.prs ?? {});
    const labelColor = (l) => l === "à toi" || l === "erreur" ? t.blocked : l === "agent en cours" ? t.working : l === "ok" ? t.done : t.dim;
    const open = (entry) => {
      const agent = entry.launched && agents().find((a) => a.tab_name === entry.launched.tab);
      const terminal = agent && panes().find((p) => p.pane === agent.pane)?.terminal;
      if (terminal) run("agent.focus", { terminal }); else exec("open", [entry.url]);
    };
    const watch = v_flex().gap(2)
      .child(section("Surveillance"))
      .child(h_flex().id("watch-switch").h(24).gap(8).items_center().rounded(6).px(4).text_size(12).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click(() => setShared("pr-watch", { on: false, prs: {}, error: null, at: 0, ...reg, on: !reg?.on }))
        .child(dot(reg?.on ? "ok" : "ko")).child(div().child(reg?.on ? "Surveillance active" : "Surveillance coupée")))
      .when(!reg, (e) => e.child(div().text_size(11).text_color(t.dim).child("Surveillance : pas encore de tour")))
      .when(Boolean(reg?.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(reg.error)))
      .children(entries.map(([k, entry], i) => v_flex().id(`watch-${i}`).rounded(6).px(4).py(2).text_size(12).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click(() => open(entry))
        .child(h_flex().h(20).gap(8).items_center()
          .child(div().flex_1().min_w(0).truncate().child(`#${k.split("#")[1]} ${k.split("#")[0].split("/").pop()}`))
          .child(div().flex_none().text_color(labelColor(entry.label)).child(entry.label ?? "")))
        .when(Boolean(entry.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(entry.error)))));

    return v_flex().id("pr").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Pull request")).child(div().flex_1())
        .when(this.loading, (e) => e.child(div().text_size(11).text_color(t.dim).child("…")))
        .child(div().id("pr-refresh").text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => { this.refresh(cx, true); cx.notify(); }).child("Rafraîchir")))
      .child(v_flex().id("pr-body").flex_1().min_h(0).overflow_y_scroll().p(14).child(body).child(watch))
      .when(Boolean(this.note), (e) => e.child(div().px(14).pb(10).text_size(11).text_color(t.muted).child(this.note)));
  }
}
