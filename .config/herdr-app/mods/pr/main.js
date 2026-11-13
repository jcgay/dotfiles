import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, focused, exec, theme, layout } from "herdr";
import { jenkinsBuild, checks, minutes } from "./model.js";

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
    cx.timer.every(60000, (cx) => { if (visible()) this.refresh(cx); });
  }

  refresh(cx) {
    const where = location(), context = key();
    if (context !== this.context) { this.context = context; this.pr = null; this.build = null; this.error = null; }
    if (!where.cwd || !where.branch) { this.loading = false; return; }
    this.loading = true;
    cx.spawn(async (cx) => {
      let pr = null, build = null, error = null;
      try {
        const r = await exec("gh", ["pr", "view", "--json", FIELDS], { cwd: where.cwd, on: where.on, timeout: 20000 });
        if (r.code === 0) pr = JSON.parse(r.stdout);
        else if (!/no (open )?pull requests? found/i.test(r.stderr)) error = (r.stderr || r.stdout).trim().split("\n")[0];
        const jenkins = pr && checks(pr.statusCheckRollup).map((c) => jenkinsBuild(c.url)).find(Boolean);
        if (jenkins) {
          const j = await exec("jk", ["run", "view", jenkins.jobPath, String(jenkins.number), "--json"], { timeout: 20000 }).catch(() => null);
          build = j?.code === 0 ? { ...jenkins, ...JSON.parse(j.stdout) } : { ...jenkins, unreachable: true };
        }
      } catch (e) { error = String(e?.message ?? e); }
      if (key() === context) { this.pr = pr; this.build = build; this.error = error; this.loading = false; }
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

    const body = !where.branch ? div().text_color(t.dim).child("Pas de branche git ici.")
      : this.error ? div().text_color(t.ansi1).child(this.error)
      : !pr ? v_flex().gap(10).child(div().text_color(t.dim).child(this.loading ? "Recherche de la PR…" : `Pas de PR pour ${where.branch}.`))
        .when(!this.loading, (e) => e.child(h_flex().child(button("pr-create", "Créer la PR", (cx) => this.act(cx, "Création", ["gh", "pr", "create", "--web"], { cwd: where.cwd, on: where.on })))))
      : v_flex().gap(4)
        .child(div().text_size(14).font_semibold().child(pr.title))
        .child(h_flex().gap(6).items_center().flex_wrap().pt(4)
          .child(div().text_color(t.muted).child(`#${pr.number}`))
          .child(chip(...state)).when(Boolean(review), (e) => e.child(chip(...review)))
          .child(div().text_size(11).text_color(t.ansi2).child(`+${pr.additions}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${pr.deletions}`)))
        .child(div().text_size(11).text_color(t.dim).child(`${pr.headRefName} → ${pr.baseRefName}`))
        .when((pr.reviewRequests ?? []).length > 0, (e) => e.child(div().text_size(11).text_color(t.muted)
          .child(`Revue demandée à ${pr.reviewRequests.map((r) => r.login ?? r.name ?? r.slug).join(", ")}`)))
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

    return v_flex().id("pr").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Pull request")).child(div().flex_1())
        .when(this.loading, (e) => e.child(div().text_size(11).text_color(t.dim).child("…")))
        .child(div().id("pr-refresh").text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => { this.refresh(cx); cx.notify(); }).child("Rafraîchir")))
      .child(v_flex().id("pr-body").flex_1().min_h(0).overflow_y_scroll().p(14).child(body))
      .when(Boolean(this.note), (e) => e.child(div().px(14).pb(10).text_size(11).text_color(t.muted).child(this.note)));
  }
}
