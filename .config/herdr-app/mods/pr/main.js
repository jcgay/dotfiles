import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, panes, agents, focused, exec, theme, layout, run, shared, setShared } from "herdr";
import { jenkinsBuild, checks, otherChecks, summary, minutes, deploymentsFor, parseContainers, watchBranch, remember } from "./model.js";

// How many spaces, checkouts and Jenkins builds the caches keep.
const KEEP = 30;

// The pull request of the shown space's branch (gh), and its Jenkins build (jk).
const FIELDS = "number,title,state,isDraft,headRefOid,reviewDecision,reviewRequests,url,headRefName,baseRefName,additions,deletions,statusCheckRollup,commits";

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const cwd = pane?.cwd || f?.cwd || space?.folder || null, branch = pane?.branch ?? space?.branch ?? null;
  const detached = branch ? null : watchBranch(cwd);
  return { cwd, branch: branch ?? detached, detached: Boolean(detached), on: space?.machine ?? null };
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
    this.context = null; this.pr = null; this.build = null; this.error = null; this.loading = false; this.note = null; this.checksOpen = false;
    this.deployed = []; this.scan = { at: 0, list: null, pending: null };
    // Last state of each space or pane seen, shown at once when it comes back while a refresh runs;
    // finished Jenkins builds, which never change; the repo name of each checkout.
    this.seen = new Map(); this.builds = new Map(); this.remotes = new Map(); this.turns = new Map();
    cx.timer.every(60000, (cx) => { if (visible()) this.refresh(cx); });
  }

  // Every container of the shared Docker hosts, through the wrappers in ~/.local/bin. One scan
  // serves every space for 5 minutes: it inspects some 270 containers. Concurrent callers share it.
  containers(force) {
    if (!force && this.scan.list && Date.now() - this.scan.at < 300000) return Promise.resolve(this.scan.list);
    this.scan.pending ??= Promise.all(["dockersw", "docker-sw2", "dockerbo"].map((cli) =>
      exec("sh", ["-c", `${cli} ps -q | xargs ${cli} inspect --format '{{.Name}}|{{json .Config.Env}}'`], { timeout: 30000 })
        .then((r) => parseContainers(r.stdout)).catch(() => [])))
      .then((lists) => { this.scan = { at: Date.now(), list: lists.flat(), pending: null }; return this.scan.list; });
    return this.scan.pending;
  }

  // The repo name of origin, asked once per checkout (retried if git failed).
  repo(where) {
    const id = `${where.on ?? ""}|${where.cwd}`;
    if (!this.remotes.has(id)) remember(this.remotes, id, exec("git", ["remote", "get-url", "origin"], { cwd: where.cwd, on: where.on })
      .then((o) => o.code === 0 ? o.stdout.trim().replace(/\.git$/, "").split(/[/:]/).pop() : null).catch(() => null)
      .then((name) => { if (!name) this.remotes.delete(id); return name; }), KEEP);
    return this.remotes.get(id);
  }

  // Each answer shows as it comes: the PR as soon as gh answers, then its build and deployments.
  refresh(cx, force = false) {
    const where = location(), context = key();
    if (context !== this.context) {
      const seen = this.seen.get(context);
      Object.assign(this, { context, pr: null, build: null, error: null, deployed: [] }, seen);
    }
    if (!where.cwd || !where.branch) { this.loading = false; return; }
    this.loading = true;
    // Only the latest refresh of a context writes: an older one may answer last.
    const turn = (this.turns.get(context) ?? 0) + 1;
    remember(this.turns, context, turn, KEEP);
    const live = () => this.turns.get(context) === turn;
    cx.spawn(async (cx) => {
      // Uses the task's cx: the caller's (render, a click) is stale once an await has returned.
      const show = (patch) => {
        if (!live()) return;
        remember(this.seen, context, { ...this.seen.get(context), ...patch }, KEEP);
        if (key() === context) Object.assign(this, patch);
        cx.notify();
      };
      // The scan does not wait for gh, only for the repo name: no origin, nothing to look for.
      const repo = this.repo(where), scan = repo.then((name) => name && this.containers(force));
      try {
        const r = await exec("gh", ["pr", "view", ...(where.detached ? [where.branch] : []), "--json", FIELDS], { cwd: where.cwd, on: where.on, timeout: 20000 });
        let pr = null, error = null;
        if (r.code === 0) pr = JSON.parse(r.stdout);
        else if (!/no (open )?pull requests? found/i.test(r.stderr)) error = (r.stderr || r.stdout).trim().split("\n")[0];
        const jenkins = pr && checks(pr.statusCheckRollup).map((c) => jenkinsBuild(c.url)).find(Boolean);
        const id = jenkins && `${jenkins.jobPath}#${jenkins.number}`, done = id && this.builds.get(id);
        // The build already shown stays until jk answers, if it is still this one.
        const prev = this.seen.get(context)?.build;
        show({ pr, error, build: !jenkins ? null : done ?? (prev && `${prev.jobPath}#${prev.number}` === id ? prev : null) });
        await Promise.all([
          // A jk failure, unreadable JSON included, marks the build unreachable but keeps the PR.
          jenkins && !done && exec("jk", ["run", "view", jenkins.jobPath, String(jenkins.number), "--json"], { timeout: 20000 })
            .then((j) => j.code === 0 ? { ...jenkins, ...JSON.parse(j.stdout) } : null).catch(() => null)
            .then((found) => {
              const build = found ?? { ...jenkins, unreachable: true };
              if (build.status === "completed") remember(this.builds, id, build, KEEP);
              show({ build });
            }),
          repo.then(async (name) => show({ deployed: name
            ? deploymentsFor(await scan, { repo: name, branch: pr?.headRefName ?? where.branch, pr: pr?.number, title: pr?.title }) : [] })),
        ]);
      } catch (e) { show({ pr: null, build: null, deployed: [], error: String(e?.message ?? e) }); }
      if (live() && key() === context) this.loading = false;
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
    const dot = (state, color) => state === "ok" ? div().size(7).rounded(4).flex_none().bg(color ?? t.done)
      : state === "ko" ? div().size(7).rounded(4).flex_none().bg(color ?? t.ansi1)
      : state === "idle" ? div().size(7).rounded(4).flex_none().border_1().border_color(color ?? t.dim)
      : div().size(7).rounded(4).flex_none().border_1().border_color(t.working).loop("opacity", { from: 0.3, to: 1, period: 1200 });
    const chip = (text, color) => div().px(6).py(1).rounded(4).border_1().border_color(color).text_size(10.5).text_color(color).child(text);
    const button = (id, text, onClick, primary) => div().id(id).h(28).px(12).flex().items_center().rounded(7).cursor_pointer().text_size(12)
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground).hover((s) => s.opacity(0.85))
      .on_click((_e, cx) => onClick(cx)).child(text);
    const section = (title) => div().pt(10).pb(4).text_size(10.5).font_semibold().text_color(t.dim).child(title.toUpperCase());

    const state = pr && (pr.isDraft ? ["Brouillon", t.muted] : pr.state === "MERGED" ? ["Mergée", t.ansi5] : pr.state === "CLOSED" ? ["Fermée", t.ansi1] : ["Ouverte", t.done]);
    const review = pr && ({ APPROVED: ["Approuvée", t.done], CHANGES_REQUESTED: ["Changements demandés", t.blocked], REVIEW_REQUIRED: ["Revue attendue", t.muted] }[pr.reviewDecision]);
    // An unreachable build shows no result: its check stays in the list.
    const list = pr ? otherChecks(checks(pr.statusCheckRollup), b && !b.unreachable ? b : null) : [], sum = summary(list);
    const running = b && !b.unreachable && b.status !== "completed";
    const link = (id, url) => h_flex().id(id).min_w(0).cursor_pointer().text_color(t.accent).hover((s) => s.opacity(0.8))
      .on_click(() => exec("open", [url])).child(div().flex_1().min_w(0).truncate().child(url.replace(/^https?:\/\//, "")));
    // A table row: its label on the left, its lines on the right; no rule above the first one.
    const table = (rows) => v_flex().mt(12).rounded(8).border_1().border_color(t.border).overflow_hidden().text_size(12)
      .children(rows.filter(Boolean).map(([label, value], i) => h_flex().gap(8).px(10).py(8).items_start()
        .when(i > 0, (e) => e.border_t(1).border_color(t.border))
        .child(div().w(64).flex_none().pt(1).text_size(11).text_color(t.dim).child(label))
        .child(v_flex().flex_1().min_w(0).gap(3).child(value))));
    const deployedRow = ["Déployée", this.deployed.length === 0 ? div().text_color(t.dim).child(this.loading ? "…" : "nulle part")
      : v_flex().gap(3).children(this.deployed.map((url, i) => link(`deployed-${i}`, url)))];
    // A small glyph button inside a clickable line: its own click must not reach the line.
    const icon = (id, glyph, tip, onClick) => h_flex().id(id).w(20).h(20).flex_none().items_center().justify_center().rounded(4)
      .text_size(11).cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(glyph);
    const buildRow = b && ["Build", b.unreachable ? div().text_color(t.dim).child("Jenkins injoignable (VPN ?)")
      : v_flex().gap(3)
        .child(h_flex().id("build-link").gap(8).items_center()
          .when(Boolean(b.url), (r) => r.cursor_pointer().hover((s) => s.opacity(0.8)).tooltip("Ouvrir le build Jenkins").on_click(() => exec("open", [b.url])))
          .child(dot(running ? "running" : b.result === "SUCCESS" ? "ok" : "ko"))
          .child(div().flex_1().min_w(0).truncate().child(`#${b.number} ${running ? "en cours" : ({ SUCCESS: "réussi", FAILURE: "échec", UNSTABLE: "instable", ABORTED: "annulé" }[b.result] ?? (b.result ?? "").toLowerCase())}`))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(running
            ? `${minutes(Date.now() - Date.parse(b.startTime))} / ~${minutes(b.estimatedDurationMs)}`
            : minutes(b.durationMs)))
          .when(Boolean(b.url), (r) => r.child(icon("pr-jenkins", "📜", "Log Jenkins", () => exec("open", [`${b.url}console`]))))
          .when(!running && b.result !== "SUCCESS", (r) => r.child(icon("pr-rerun", "🔁", "Relancer",
            (cx) => this.act(cx, "Relance", ["jk", "run", "rerun", b.jobPath, String(b.number)], { timeout: 30000 })))))
        .when(Boolean(b.tests?.total), (e) => e.child(div().text_size(11).text_color(b.tests.failed ? t.ansi1 : t.muted)
          .child(`${b.tests.total} tests · ${b.tests.failed} en échec · ${b.tests.skipped} ignorés`)))];
    const checksRow = sum && ["Checks", v_flex().gap(3)
      .child(h_flex().id("checks-toggle").gap(8).items_center().cursor_pointer().hover((s) => s.opacity(0.8))
        .on_click((_e, cx) => { this.checksOpen = !this.checksOpen; cx.notify(); })
        .child(dot(sum.state)).child(div().flex_1().min_w(0).truncate().child(sum.text))
        .child(div().flex_none().text_color(t.dim).child(this.checksOpen ? "⌄" : "›")))
      .when(this.checksOpen, (e) => e.children(list.map((c, i) =>
        h_flex().id(`check-${i}`).gap(8).items_center().rounded(4).text_size(11)
          .when(Boolean(c.url), (r) => r.cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => exec("open", [c.url])))
          .child(dot(c.state)).child(div().flex_1().min_w(0).truncate().child(c.name)))))];

    // Armed merge: status-jc (mods/status-jc/merge.js, ARMED) merges it once every check is green; the panel only arms and disarms.
    const armedAll = shared("pr-merge") ?? {};
    const mergeRepo = pr && /github\.com\/([^/]+\/[^/]+)\/pull\//.exec(pr.url)?.[1];
    const mergeKey = mergeRepo && `${mergeRepo}#${pr.number}`, armed = mergeKey && armedAll[mergeKey];
    const disarm = () => { const { [mergeKey]: _, ...rest } = shared("pr-merge") ?? {}; setShared("pr-merge", rest); };
    const mergeRow = armed && ["Merge", v_flex().gap(3)
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().child(armed.refused ? "merge refusé" : `armé${armed.why ? ` · ${armed.why}` : ""}`))
        .child(icon("pr-disarm", "✕", armed.refused ? "Effacer" : "Désarmer", disarm)))
      .when(Boolean(armed.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(armed.error)))];
    // Squash: status-jc (mods/status-jc/squasher.js) folds the fixup! commits on a click; its watch does it alone once approved.
    // The regex is watch.js's FIXUP: Herdr refuses imports from another mod's folder.
    const fixes = (pr?.commits ?? []).filter((c) => /^(fixup|amend|squash)! /.test(c.messageHeadline ?? "")).length;
    // The watch squashes alone only my ready PRs, Surveillance on; the row cannot tell mine, so the hint skips drafts and off.
    const approved = pr?.reviewDecision === "APPROVED", auto = !pr?.isDraft && Boolean(shared("pr-watch")?.on);
    const squash = mergeKey && (shared("pr-squash") ?? {})[mergeKey], squashing = squash && squash.state !== "error";
    const squashRow = mergeKey && pr.state === "OPEN" && ["Squash", v_flex().gap(3)
      .child(h_flex().gap(8).items_center()
        .child(dot(squashing ? "running" : !fixes ? "ok" : approved ? "ko" : "idle", fixes && approved && !squashing ? t.blocked : null))
        .child(div().flex_1().min_w(0).truncate().child(squashing ? "squash en cours…" : !fixes ? "rien à squasher"
          : `${fixes} commit${fixes > 1 ? "s" : ""} fixup! à squasher${!approved && auto ? " · auto après approbation" : ""}`))
        .when(fixes > 0 && !squashing, (r) => r.child(icon("pr-squash", "⤵", "Squasher et pousser (push forcé)",
          () => setShared("pr-squash", { ...(shared("pr-squash") ?? {}), [mergeKey]: { state: "asked", at: Date.now() } })))))
      .when(Boolean(squash?.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(squash.error)))];
    const canArm = Boolean(mergeKey) && pr.state === "OPEN" && !pr.isDraft && !armed;
    const reviewers = (pr?.reviewRequests ?? []).map((r) => r.login ?? r.name ?? r.slug);
    const body = !where.branch ? div().text_color(t.dim).child("Pas de branche git ici.")
      : this.error ? div().text_color(t.ansi1).child(this.error)
      : !pr ? v_flex().child(div().text_color(t.dim).child(this.loading ? "Recherche de la PR…" : `Pas de PR pour ${where.branch}.`))
        .when(this.deployed.length > 0, (e) => e.child(table([deployedRow])))
        .when(!this.loading, (e) => e.child(h_flex().pt(12).child(button("pr-create", "Créer la PR", (cx) => this.act(cx, "Création", ["gh", "pr", "create", "--web"], { cwd: where.cwd, on: where.on })))))
      : v_flex()
        .child(div().id("pr-open").text_size(14).font_semibold().cursor_pointer().hover((s) => s.opacity(0.8))
          .tooltip("Ouvrir la PR sur GitHub").on_click(() => exec("open", [pr.url])).child(pr.title))
        .child(h_flex().gap(6).items_center().flex_wrap().pt(6)
          .child(div().text_color(t.muted).child(`#${pr.number}`))
          .child(chip(...state)).when(Boolean(review), (e) => e.child(chip(...review)))
          .child(div().text_size(11).text_color(t.ansi2).child(`+${pr.additions}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${pr.deletions}`)))
        .child(table([buildRow, deployedRow, checksRow, squashRow, mergeRow]))
        .when(canArm, (e) => e.child(h_flex().pt(12).child(button("pr-arm", "Merger quand tout est vert",
          () => setShared("pr-merge", { ...(shared("pr-merge") ?? {}), [mergeKey]: { head: pr.headRefOid, at: Date.now(), why: null, error: null } })))))
        .child(div().pt(8).text_size(11).text_color(t.dim)
          .child(`${pr.headRefName} → ${pr.baseRefName}${reviewers.length ? ` · revue demandée à ${reviewers.join(", ")}` : ""}`));

    // The PR watch (status-jc writes it): all PRs, so it shows even without one in this space.
    const reg = shared("pr-watch") ?? null, entries = Object.entries(reg?.prs ?? {});
    // Each label's color, dot and rank: what needs me first, finished PRs last.
    const looks = { "à toi": [t.blocked, "ko"], erreur: [t.ansi1, "ko"], "pas de clone local": [t.blocked, "ko"],
      "agent en cours": [t.working, "running"], "en attente": [t.muted, "idle"], brouillon: [t.dim, "idle"], "en pause": [t.dim, "idle"], ok: [t.done, "ok"] };
    const look = (l) => looks[l] ?? [t.dim, "idle"];
    // A label this table lacks (renamed in status-jc, which the panel cannot import) goes last.
    const rank = (l) => { const i = Object.keys(looks).indexOf(l); return i < 0 ? Infinity : i; };
    const open = (entry) => {
      const agent = entry.launched && agents().find((a) => a.tab_name === entry.launched.tab);
      const terminal = agent && panes().find((p) => p.pane === agent.pane)?.terminal;
      if (terminal) run("agent.focus", { terminal }); else exec("open", [entry.url]);
    };
    // status-jc launches nothing on a paused PR; it only reads the list, the panel writes it.
    const paused = reg?.paused ?? [];
    const pause = (k) => h_flex().id(`pause-${k}`).w(18).h(18).flex_none().items_center().justify_center().rounded(4)
      .text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(paused.includes(k) ? "Reprendre" : "Mettre en pause")
      .on_click((_e, cx) => {
        cx.stop_propagation(); // the row's own click opens the PR or its agent
        // A pause touched by hand is the user's now: the opening no longer lifts it on close.
        if (shared("pr-open")?.[k]?.state === "held") { const { [k]: _, ...rest } = shared("pr-open"); setShared("pr-open", rest); }
        setShared("pr-watch", { on: false, prs: {}, error: null, at: 0, ...reg,
          paused: paused.includes(k) ? paused.filter((p) => p !== k) : [...paused, k] });
      })
      .child(paused.includes(k) ? "▶" : "⏸");
    // "Travailler dessus": status-jc opens a space in the PR's worktree (opener.js), the panel only asks.
    const opens = shared("pr-open") ?? {};
    const pending = (k) => ["asked", "opening"].includes(opens[k]?.state);
    const work = (k) => h_flex().id(`work-${k}`).w(18).h(18).flex_none().items_center().justify_center().rounded(4)
      .text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip("Travailler dessus")
      .on_click((_e, cx) => {
        cx.stop_propagation(); // the row's own click opens the PR or its agent
        // held is kept: the opening still owns the PR's pause, reopening its space must not make it the user's.
        if (!pending(k)) setShared("pr-open", { ...(shared("pr-open") ?? {}), [k]: { state: "asked", at: Date.now(), held: opens[k]?.state === "held", folders: opens[k]?.folders } });
      })
      .child("⌨");
    const row = ([k, entry]) => {
      const [color, state] = look(entry.label), [repo, number] = k.split("#");
      return h_flex().id(`watch-${k}`).gap(10).items_start().rounded(8).px(8).py(7).cursor_pointer().hover((s) => s.bg(t.hover))
        .tooltip(entry.launched ? "Aller à l'agent" : "Ouvrir la PR").on_click(() => open(entry))
        .child(div().pt(5).flex_none().child(dot(state, color)))
        .child(v_flex().flex_1().min_w(0).gap(2)
          .child(h_flex().gap(6).items_center()
            .child(div().text_size(12).font_semibold().child(repo.split("/").pop()))
            .child(div().text_size(12).text_color(t.dim).child(`#${number}`))
            .child(div().flex_1()).child(work(k)).child(pause(k)).child(chip(entry.label ?? "", color)))
          .when(Boolean(entry.title), (e) => e.child(div().text_size(12).text_color(t.muted).truncate().child(entry.title)))
          .when(Boolean(entry.why), (e) => e.child(div().text_size(11).text_color(t.dim).child(entry.why)))
          .when(Boolean(entry.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(entry.error)))
          .when(pending(k), (e) => e.child(div().text_size(11).text_color(t.dim).child("ouverture…")))
          .when(Boolean(opens[k]?.error) && !pending(k), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(opens[k].error))));
    };
    const sorted = [...entries].sort(([, a], [, b]) => rank(a.label) - rank(b.label)); // stable: registry order within a label
    const watch = v_flex().gap(2)
      .child(section("Surveillance"))
      .child(h_flex().id("watch-switch").h(24).gap(8).items_center().rounded(6).px(4).text_size(12).cursor_pointer().hover((s) => s.bg(t.hover))
        .on_click(() => setShared("pr-watch", { on: false, prs: {}, error: null, at: 0, ...reg, on: !reg?.on }))
        .child(dot(reg?.on ? "ok" : "ko")).child(div().child(reg?.on ? "Surveillance active" : "Surveillance coupée"))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.dim)
          .child(reg?.at ? `dernier tour il y a ${minutes(Date.now() - reg.at)}` : "pas encore de tour")))
      .when(Boolean(reg?.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(reg.error)))
      .child(v_flex().gap(1).pt(4).children(sorted.map(row)));

    return v_flex().id("pr").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Pull request")).child(div().flex_1())
        .when(this.loading, (e) => e.child(div().text_size(11).text_color(t.dim).child("…")))
        .child(div().id("pr-refresh").text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => { this.refresh(cx, true); cx.notify(); }).child("Rafraîchir")))
      .child(v_flex().id("pr-body").flex_1().min_h(0).overflow_y_scroll().p(14).child(body).child(watch))
      .when(Boolean(this.note), (e) => e.child(div().px(14).pb(10).text_size(11).text_color(t.muted).child(this.note)));
  }
}
