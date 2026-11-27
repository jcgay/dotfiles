import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { spaces, panes, agents, focused, exec, theme, layout, run, shared, setShared, props, appHome, readTextFile, home, settings } from "herdr";
import { Ci } from "./ci.js";
import { parseConfig } from "./ci-model.js";
import { moveSel, jenkinsBuild, checks, otherChecks, summary, minutes, deploymentsFor, parseContainers, watchBranch, remember, clockText, workLook, rowActions, bandStates, nextRound, isDraft, hiddenDraft, sessionOf, watchSections, spaceShowing, realFolder, parseIcons, repoLetter, matchesFilter, chipLabel } from "./model.js";

// How many spaces, checkouts and Jenkins builds the caches keep.
const KEEP = 30;

// The pull request of the shown space's branch (gh), and its Jenkins build (jk).
const FIELDS = "number,title,state,isDraft,headRefOid,reviewDecision,reviewRequests,url,headRefName,baseRefName,additions,deletions,statusCheckRollup,commits";

// Contextual help: what each step of the watch's band does (status-jc's watch.js decide()), what each state and label means.
const STEP_HELP = {
  git: "à jour avec la base, sans conflit ; en conflit, un agent rebase (2 essais)",
  jenk: "la CI (Jenkins, ou les checks GitHub) ; en échec, un agent la corrige (2 essais), une fois le quality gate Sonar corrigé s'il échoue aussi",
  sonar: "l'analyse Sonar ; en échec, un agent la corrige (2 essais)",
  rev: "/pr-review --fix --copilot : un agent demande une revue Copilot, relit la PR, poste sa revue et corrige en répondant aux commentaires de Copilot (sans elle si Copilot n'a pas répondu en 5 min)",
  qa: "un agent qa teste la PR pour y trouver des bugs (si le skill qa est dans le clone)",
  demo: "/pr-demo : une démo postée sur la PR (si AGENTS.md ou CLAUDE.md a une section ## Demo)",
  risk: "/pr-risk : le risque de la PR et s'il faut une revue humaine",
  appr: "l'approbation d'un relecteur sur GitHub (inutile quand pr-risk demande 0 revue humaine sur ce code), puis le squash des fixup!",
  merge: "le merge armé (« Merger quand tout est vert ») : rebase and merge dès que tout est vert",
};
const STATE_HELP = {
  ok: "fait", run: "en cours : un agent, la CI ou le merge armé", wait: "attend une approbation humaine",
  ko: "en échec, la surveillance le corrige", me: "à toi : la surveillance a abandonné, ou un qa ou pr-demo attend dans son onglet", todo: "à venir",
  skip: "jamais fait dans ce dépôt",
};
const LABEL_HELP = {
  "à toi": "la surveillance a besoin de toi : la raison est sous la ligne ; un clic ouvre le log Jenkins ou l'analyse Sonar en cause, ou l'onglet d'un qa ou pr-demo ouvert depuis trop longtemps",
  erreur: "GitHub n'a pas pu lire la PR",
  "pas de clone local": "aucun clone du dépôt sur ce Mac : aucun agent ne peut être lancé",
  "agent en cours": "un agent travaille sur la PR ; clic pour aller à son onglet",
  "en attente": "rien à lancer pour l'instant : CI en cours, GitHub qui calcule, agents tous pris…",
  brouillon: "brouillon : seuls git, la CI et Sonar sont surveillés, pas de revue ; un brouillon qu'aucun space ne montre n'est pas surveillé",
  "en pause": "en pause : rien n'est lancé (le bouton lecture reprend)",
  ok: "la surveillance a tout fait",
  "attend relecture": "la surveillance a tout fait ; un relecteur doit approuver la PR sur GitHub",
  "prête à merger": "approuvée (ou pr-risk : 0 revue humaine), CI verte : reste le merge (« Merger quand tout est vert » l'arme)",
  "squash à venir": "approuvée : la surveillance squashe ses fixup! au prochain tour, puis elle sera prête à merger",
  "merge armé": "le merge part dès que tous les checks sont verts",
};

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const cwd = pane?.cwd || f?.cwd || space?.folder || null, branch = pane?.branch ?? space?.branch ?? null;
  const detached = branch ? null : watchBranch(cwd);
  return { cwd, branch: branch ?? detached, detached: Boolean(detached), on: space?.machine ?? null };
}
const key = () => JSON.stringify(location());

// A hidden copy keeps its timers: ask gh and jk only while the panel shows this block (pr or watch, the layout's block id).
function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const found = find(child, id); if (found) return found; }
  return null;
}
function visible(view) {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  return Boolean(panel && !panel.hidden && body?.active === view);
}

// Two panels from one mod (layout prop `view`): "pr", the PR of the shown branch, and "watch", every PR status-jc follows.
export default class PullRequest extends View {
  init(_props, cx) {
    // Herdr gives a block's layout props through props(), not init's argument.
    this.view = ["watch", "ci"].includes(props()?.view) ? props().view : "pr";
    // The CI panel is its own file; this copy only hands it the timer and the render.
    if (this.view === "ci") {
      this.ci = new Ci();
      cx.timer.every(60000, (cx) => { if (visible("ci")) this.ci.refresh(cx); });
      return;
    }
    // The watch list's keyboard: ⌘⇧U (tabs-jc writes shared("watch-focus")) or a click in the panel gives it the keys.
    this.handle = cx.focus_handle(); this.sel = null; this.focusAsked = null;
    // The watch list scrolls the picked row into view (its rows are the body's direct children) and filters on what is
    // typed in its field: repo, title, space or #N. "/" from the list goes to the field, Escape back to the list.
    this.scroll = ScrollHandle.new();
    this.query = InputState.new({ placeholder: "Filtrer : dépôt, titre, space, #N  ( / )" });
    this.queryFocused = false;
    this.query.on("change", (_e, cx) => { this.sel = null; this.scroll.scroll_to_item(0); cx.notify(); });
    this.query.on("focus", (_e, cx) => { this.queryFocused = true; cx.notify(); });
    this.query.on("blur", (_e, cx) => { this.queryFocused = false; cx.notify(); });
    // Enter in the field: the first match, as a click on its row.
    this.query.on("submit", () => { const k = this.keys?.[0]; if (k) this.openKey?.(k); });
    this.context = null; this.pr = null; this.build = null; this.error = null; this.loading = false; this.note = null; this.checksOpen = false;
    this.confirms = {}; // action id -> time of its first click (squash pushes with --force: a second click confirms)
    this.deployed = []; this.scan = { at: 0, list: null, pending: null };
    // Last state of each space or pane seen, shown at once when it comes back while a refresh runs;
    // finished Jenkins builds, which never change; the repo name of each checkout.
    this.seen = new Map(); this.builds = new Map(); this.remotes = new Map(); this.turns = new Map();
    // The watch view only reads shared(): no gh or jk.
    cx.timer.every(60000, (cx) => { if (this.view === "pr" && visible("pr")) this.refresh(cx); });
    // config.json: the owners in the watch's help, dockerQa for the containers. Re-read every minute: `yadm alt` applies without a restart.
    this.config = null;
    // ~/dev is a symlink: git (a draft's worktree) prints the resolved form, Herdr may show a space in the other.
    this.devReal = null;
    exec("realpath", [`${home()}/dev`]).then((r) => { if (r.code === 0) this.devReal = r.stdout.trim(); }).catch(() => {});
    const read = () => readTextFile(`${appHome()}/config.json`).catch(() => null)
      .then((text) => { this.config = parseConfig(text).config ?? null; });
    // containers() waits for the first read: before it, the work machine would get no deployments for a minute.
    this.configReady = read();
    cx.spawn(async (cx) => { await this.configReady; cx.notify(); });
    cx.timer.every(60000, (cx) => cx.spawn(async (cx) => { await read(); cx.notify(); }));
    // The watch's repo icons: each ~/dev repo's .idea/icon.svg (else icon.png) and icon_dark.svg, as the spaces and
    // projects panels show them, copied under appHome for image(). Hidden folder: Herdr reloads a mod when a visible
    // file of its folder changes. Only what changed is written; read again every 10 min (an icon added shows then).
    this.icons = {};
    if (this.view === "watch") {
      const copyIcons = (cx) => cx.spawn(async (cx) => {
        const dir = "mods/pr/.icons";
        const script = 'cd "$1" || exit 0; mkdir -p "$2" || exit; for d in */.idea; do n=${d%/.idea}; l=; for e in svg png; do [ -f "$d/icon.$e" ] && l=$e && break; done; [ -n "$l" ] || continue; cmp -s "$d/icon.$l" "$2/$n.$l" || cp "$d/icon.$l" "$2/$n.$l"; k=; if [ -f "$d/icon_dark.svg" ]; then cmp -s "$d/icon_dark.svg" "$2/$n.dark.svg" || cp "$d/icon_dark.svg" "$2/$n.dark.svg"; k="$n.dark.svg"; fi; printf "%s\\t%s\\t%s\\n" "$n" "$n.$l" "$k"; done';
        const r = await exec("sh", ["-c", script, "sh", `${home()}/dev/`, `${appHome()}/${dir}`], { timeout: 30000 }).catch(() => null);
        if (r?.code === 0) { this.icons = parseIcons(r.stdout, dir); cx.notify(); } // cosmetic: a letter on failure
      });
      copyIcons(cx);
      cx.timer.every(600000, copyIcons);
    }
  }

  // Every container of the shared Docker hosts, through the wrappers in ~/.local/bin. One scan
  // serves every space for 5 minutes: it inspects some 270 containers. Concurrent callers share it.
  async containers(force) {
    await this.configReady;
    if (!this.config?.dockerQa) return []; // the QA Docker hosts are Vidal's: off unless config.json says so
    if (!force && this.scan.list && Date.now() - this.scan.at < 300000) return this.scan.list;
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

  act(cx, label, args, opts, done) {
    this.note = `${label}…`;
    cx.spawn(async (cx) => {
      const r = await exec(args[0], args.slice(1), opts).catch((e) => ({ code: 1, stderr: String(e) }));
      this.note = r.code === 0 ? null : `${label} : ${(r.stderr || r.stdout).trim().split("\n")[0]}`;
      if (r.code === 0) done?.();
      // The watch copy never asks gh, jk or Docker: its rows come from status-jc.
      if (this.view === "pr") this.refresh(cx);
      cx.notify();
    });
    cx.notify();
  }

  render(cx) {
    // Opening the panel, or another space or pane while it is open, asks again.
    const shown = visible(this.view);
    if (this.view === "ci") {
      if (shown && !this.shown) this.ci.refresh(cx);
      this.shown = shown;
      return this.ci.render(cx, theme());
    }
    if (this.view === "pr" && shown && (!this.shown || key() !== this.context)) this.refresh(cx);
    this.shown = shown;
    const t = theme(), pr = this.pr, b = this.build, where = location();
    const dot = (state, color) => state === "ok" ? div().size(7).rounded(4).flex_none().bg(color ?? t.done)
      : state === "ko" ? div().size(7).rounded(4).flex_none().bg(color ?? t.ansi1)
      : state === "idle" ? div().size(7).rounded(4).flex_none().border_1().border_color(color ?? t.dim)
      : div().size(7).rounded(4).flex_none().border_1().border_color(t.working).loop("opacity", { from: 0.3, to: 1, period: 1200 });
    // Type roles, shared with the Journal panel: 15 PR title, 13 panel title and base, 12 rows, 11 metadata and labels, 10 band cells.
    const chip = (text, color) => div().px(6).py(1).rounded(4).border_1().border_color(color).text_size(11).text_color(color).child(text);
    // Asks status-jc for a watch round now (the header's ↻).
    const askRound = () => setShared("pr-watch-now", { at: Date.now() });
    const button = (id, text, onClick, primary) => div().id(id).h(28).px(12).flex().items_center().rounded(7).cursor_pointer().text_size(12)
      .bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground).hover((s) => s.opacity(0.85))
      .on_click((_e, cx) => onClick(cx)).child(text);
    // A repo's icon, else its letter on a raised square, as a space's avatar in the spaces panel.
    const repoMark = (repo) => {
      const icon = this.icons?.[repo.split("/").pop()];
      return icon ? image(icon[settings().dark ? "dark" : "light"]).size(14).flex_none().rounded(3)
        : h_flex().size(14).flex_none().rounded(3).bg(t.raised).items_center().justify_center().text_size(9).font_bold().text_color(t.muted).child(repoLetter(repo));
    };
    const section = (title) => div().pt(10).pb(4).text_size(11).font_semibold().text_color(t.dim).child(title.toUpperCase());

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
      .text_size(11).cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(tip).accessibility_label(tip)
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); }).child(glyph);
    // An action named by its verb, shown only where it applies; its click must not reach a clickable line.
    // A 20 px box with a hover fill: bare 11 px text left a 14 px target, and a low click opened the row instead.
    const action = (id, text, onClick, color) => h_flex().id(id).flex_none().h(20).px(4).items_center().rounded(4).text_size(11)
      .text_color(color ?? t.accent).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); cx.notify(); }).child(text);
    // A force push asks a second click within 4 s; a stale "Confirmer" only arms it again.
    const CONFIRM_MS = 4000;
    const guarded = (id, text, confirm, onConfirm) => Date.now() - (this.confirms[id] ?? 0) < CONFIRM_MS
      ? action(id, confirm, (cx) => { delete this.confirms[id]; onConfirm(cx); }, t.blocked)
      // The repaint at the end of the window puts the label back, or a stale "Confirmer" would only arm it again.
      : action(id, text, (cx) => { this.confirms[id] = Date.now(); cx.timer.after(CONFIRM_MS + 50, (cx) => cx.notify()); });
    const buildRow = b && ["Build", b.unreachable ? div().text_color(t.dim).child("Jenkins injoignable (VPN ?)")
      : v_flex().gap(3)
        .child(h_flex().id("build-link").gap(8).items_center()
          .when(Boolean(b.url), (r) => r.cursor_pointer().hover((s) => s.opacity(0.8)).tooltip("Ouvrir le build Jenkins").on_click(() => exec("open", [b.url])))
          .child(dot(running ? "running" : b.result === "SUCCESS" ? "ok" : "ko"))
          .child(div().flex_1().min_w(0).truncate().child(`#${b.number} ${running ? "en cours" : ({ SUCCESS: "réussi", FAILURE: "échec", UNSTABLE: "instable", ABORTED: "annulé" }[b.result] ?? (b.result ?? "").toLowerCase())}`))
          .child(div().flex_none().text_size(11).text_color(t.dim).child(running
            ? `${minutes(Date.now() - Date.parse(b.startTime))} / ~${minutes(b.estimatedDurationMs)}`
            : minutes(b.durationMs)))
          .when(Boolean(b.url), (r) => r.child(icon("pr-jenkins", svg("mods/workspace-chrome/file-text.svg").size(13), "Log Jenkins", () => exec("open", [`${b.url}console`]))))
          .when(!running && b.result !== "SUCCESS", (r) => r.child(icon("pr-rerun", svg("mods/pr/rerun.svg").size(13), "Relancer le build",
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
        .child(action("pr-disarm", armed.refused ? "Effacer" : "Désarmer", disarm)))
      .when(Boolean(armed.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(armed.error)))];
    // A pr-squash request under way: asked (status-jc has not claimed it), running, or a conflict's agent, whose line goes to its tab.
    const squashLine = (s, id) => {
      if (s.state !== "agent") return div().child(s.state === "asked" ? "squash demandé…" : "squash en cours…");
      const goAgent = (_e, cx) => {
        cx.stop_propagation();
        const terminal = panes().find((p) => p.pane === agents().find((a) => a.tab_name === s.tab)?.pane)?.terminal;
        if (terminal) run("agent.focus", { terminal });
      };
      return div().id(id).cursor_pointer().hover((x) => x.text_color(t.accent)).tooltip("Aller à l'agent").on_click(goAgent)
        .child("conflit : un agent squash le résout…");
    };
    // Squash: status-jc (mods/status-jc/squasher.js) folds the fixup! commits on a click; its watch does it alone once approved.
    // The regex is watch.js's FIXUP: Herdr refuses imports from another mod's folder.
    const fixes = (pr?.commits ?? []).filter((c) => /^(fixup|amend|squash)! /.test(c.messageHeadline ?? "")).length;
    // The watch squashes alone only my ready PRs, Surveillance on; the row cannot tell mine, so the hint skips drafts and off.
    const approved = pr?.reviewDecision === "APPROVED", auto = !pr?.isDraft && Boolean(shared("pr-watch")?.on);
    const squash = mergeKey && (shared("pr-squash") ?? {})[mergeKey], squashing = squash && squash.state !== "error";
    const squashRow = mergeKey && pr.state === "OPEN" && ["Squash", v_flex().gap(3)
      .child(h_flex().gap(8).items_center()
        .child(dot(squashing ? "running" : !fixes ? "ok" : approved ? "ko" : "idle", fixes && approved && !squashing ? t.blocked : null))
        .child(div().flex_1().min_w(0).truncate().child(squashing ? squashLine(squash, "squash-line") : !fixes ? "rien à squasher"
          // The merge button waits for the squash (canArm): say it here, or it just looks missing.
          : `${fixes} commit${fixes > 1 ? "s" : ""} fixup! à squasher${!approved && auto ? " · auto après approbation" : ""}${!pr.isDraft && !armed ? " · merge après le squash" : ""}`))
        .when(fixes > 0 && !squashing, (r) => r.child(guarded("pr-squash", "Squasher", "Confirmer le push forcé",
          () => setShared("pr-squash", { ...(shared("pr-squash") ?? {}), [mergeKey]: { state: "asked", at: Date.now() } })))))
      .when(Boolean(squash?.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(squash.error)))];
    // status-jc disarms a merge armed over fixup! commits at once (merge.js): squash first, as the watch row does.
    const canArm = Boolean(mergeKey) && pr.state === "OPEN" && !pr.isDraft && !armed && fixes === 0;
    const reviewers = (pr?.reviewRequests ?? []).map((r) => r.login ?? r.name ?? r.slug);
    const body = !where.branch ? div().text_color(t.dim).child("Pas de branche git ici.")
      : this.error ? div().text_color(t.ansi1).child(this.error)
      : !pr ? v_flex().child(div().text_color(t.dim).child(this.loading ? "Recherche de la PR…" : `Pas de PR pour ${where.branch}.`))
        .when(this.deployed.length > 0, (e) => e.child(table([deployedRow])))
        .when(!this.loading, (e) => e.child(h_flex().pt(12).child(button("pr-create", "Créer la PR", (cx) => this.act(cx, "Création", ["gh", "pr", "create", "--web"], { cwd: where.cwd, on: where.on })))))
      : v_flex()
        .child(div().id("pr-open").text_size(15).font_semibold().cursor_pointer().hover((s) => s.opacity(0.8))
          .tooltip("Ouvrir la PR sur GitHub").on_click(() => exec("open", [pr.url])).child(pr.title))
        .child(h_flex().gap(6).items_center().flex_wrap().pt(6)
          .child(div().text_color(t.muted).child(`#${pr.number}`))
          .child(chip(...state)).when(Boolean(review), (e) => e.child(chip(...review)))
          .child(div().text_size(11).text_color(t.ansi2).child(`+${pr.additions}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${pr.deletions}`)))
        .child(table([buildRow, deployedRow, checksRow, squashRow, mergeRow]))
        .when(pr.state === "OPEN" && pr.isDraft, (e) => e.child(h_flex().pt(12).child(button("pr-ready", "Prête pour review",
          (cx) => this.act(cx, "Passage en revue", ["gh", "pr", "ready", pr.url], { timeout: 30000 }, askRound)))))
        .when(canArm, (e) => e.child(h_flex().pt(12).child(button("pr-arm", "Merger quand tout est vert",
          () => setShared("pr-merge", { ...(shared("pr-merge") ?? {}), [mergeKey]: { head: pr.headRefOid, at: Date.now(), why: null, error: null } })))))
        .child(div().pt(8).text_size(11).text_color(t.dim)
          .child(`${pr.headRefName} → ${pr.baseRefName}${reviewers.length ? ` · revue demandée à ${reviewers.join(", ")}` : ""}`));

    // ⌘⇧U opened the watch (tabs-jc stamps shared("watch-focus")): take the keys, once per stamp and only while fresh.
    const asked = shared("watch-focus") ?? null;
    // Consumed only once the panel shows: a render before the layout switches to watch must not use it up.
    if (this.view === "watch" && shown && asked !== this.focusAsked) {
      this.focusAsked = asked;
      if (asked && Date.now() - asked < 3000) cx.timer.after(30, () => this.handle.focus());
    }
    const keyboard = this.view === "watch" && shown && (this.handle.is_focused() || this.queryFocused);
    // Closed while it held the keys (⌘⇧U again, the tab button): give them back to the terminal, as Escape does.
    if (this.view === "watch" && !shown && this.handle.is_focused()) {
      this.sel = null;
      cx.timer.after(0, () => { const f = focused(); if (f?.pane) run("pane.focus", { pane: f.pane }); });
    }
    // The PR watch (status-jc writes it): all PRs, so it shows even without one in this space.
    const reg = shared("pr-watch") ?? null, entries = Object.entries(reg?.prs ?? {});
    // Each label's color, dot and rank: what needs me first, finished PRs last.
    const looks = { "à toi": [t.blocked, "ko"], erreur: [t.ansi1, "ko"], "pas de clone local": [t.blocked, "ko"],
      "agent en cours": [t.working, "running"], "en attente": [t.muted, "idle"], brouillon: [t.dim, "idle"], "en pause": [t.dim, "idle"], ok: [t.done, "ok"],
      // The chips of an ok PR (model.js chipLabel): who acts next. Orange as the band's wait cell: a human must act.
      "attend relecture": [t.working, "idle"], "prête à merger": [t.done, "ok"], "squash à venir": [t.muted, "idle"], "merge armé": [t.done, "ok"] };
    const look = (l) => looks[l] ?? [t.dim, "idle"];
    // A label this table lacks (renamed in status-jc, which the panel cannot import) goes last.
    const rank = (l) => { const i = Object.keys(looks).indexOf(l); return i < 0 ? Infinity : i; };
    // A « à toi » PR whose check the watch gave up on opens what blocks it (status-jc's entry.blocker): the Jenkins
    // console or the Sonar analysis. Otherwise its agent's tab, else the PR.
    const blocked = (entry) => entry.label === "à toi" && entry.blocker?.url ? entry.blocker : null;
    const BLOCKER_VERB = { jenkins: "Ouvrir le log Jenkins", sonar: "Ouvrir l'analyse Sonar" };
    const open = (entry) => {
      if (blocked(entry)) return exec("open", [entry.blocker.url]);
      const agent = entry.launched && agents().find((a) => a.tab_name === entry.launched.tab);
      const terminal = agent && panes().find((p) => p.pane === agent.pane)?.terminal;
      if (terminal) run("agent.focus", { terminal }); else exec("open", [entry.url]);
    };
    // status-jc launches nothing on a paused PR; it only reads the list, the panel writes it.
    const paused = reg?.paused ?? [];
    // A row's small button; its click must not reach the row, whose own click opens the PR or its agent.
    const rowButton = (id, tip, onClick) => h_flex().id(id).min_w(24).h(24).px(3).gap(2).flex_none().items_center().justify_center().rounded(5)
      // t.muted at rest: t.dim fell under 3:1 for a control on the dark theme at 1x.
      .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .tooltip(tip).accessibility_label(tip).on_click((_e, cx) => { cx.stop_propagation(); onClick(cx); });
    const togglePause = (k) => {
      // A pause touched by hand is the user's now: the opening no longer lifts it on close.
      if (shared("pr-open")?.[k]?.state === "held") { const { [k]: _, ...rest } = shared("pr-open"); setShared("pr-open", rest); }
      setShared("pr-watch", { on: false, prs: {}, error: null, at: 0, ...reg,
        paused: paused.includes(k) ? paused.filter((p) => p !== k) : [...paused, k] });
    };
    const pause = (k) => rowButton(`pause-${k}`, paused.includes(k) ? "Reprendre la surveillance de cette PR (p)" : "Mettre cette PR en pause (p)", () => togglePause(k))
      .child(svg(paused.includes(k) ? "mods/pr/play.svg" : "mods/pr/pause.svg").size(13));
    // "Travailler dessus": status-jc opens a space in the PR's worktree (opener.js), the panel only asks.
    const opens = shared("pr-open") ?? {};
    const pending = (k) => ["asked", "opening"].includes(opens[k]?.state);
    // ⌨ tells what its click does from the folder status-jc found (entry.work): missing, there, or shown by a local space.
    const localSpaces = spaces().filter((s) => !s.machine).map((s) => {
      const tabs = new Set(s.tabs.map((x) => x.id));
      const folders = [s.folder, ...panes().filter((p) => tabs.has(p.tab)).map((p) => p.cwd)].filter(Boolean);
      // Both forms: a draft's worktree comes from git (resolved), a ready PR's -watch folder is built under ~/dev.
      const dev = `${home()}/dev`;
      return { name: s.name, folders: [...new Set(folders.flatMap((f) => [f, realFolder(f, dev, this.devReal), this.devReal ? realFolder(f, this.devReal, dev) : f]))] };
    });
    const local = localSpaces.flatMap((s) => s.folders);
    // held is kept: the opening still owns the PR's pause, reopening its space must not make it the user's.
    const askWork = (k) => { if (!pending(k)) setShared("pr-open", { ...(shared("pr-open") ?? {}), [k]: { state: "asked", at: Date.now(), held: opens[k]?.state === "held", folders: opens[k]?.folders } }); };
    const work = (k, w) => {
      const { tip, missing, shown } = workLook(w, local);
      return rowButton(`work-${k}`, `${tip} (t)`, () => askWork(k))
        .when(missing, (e) => e.opacity(0.4))
        .when(shown, (e) => e.text_color(t.foreground))
        // ⌨ has no glyph in the panel's font: workspace-chrome's terminal icon instead.
        .child(svg("mods/workspace-chrome/terminal.svg").size(14).text_color(shown ? t.foreground : t.muted)).when(shown, (e) => e.child(div().size(4).rounded(2).bg(t.done)));
    };
    // The row's actions, as verbs under it when they apply: the same requests as the Pull request panel; status-jc does the squash and the merge.
    // Ready for review: the round it asks starts the reviews without waiting.
    const merges = shared("pr-merge") ?? {}, squashes = shared("pr-squash") ?? {};
    const actionsOf = (k, entry) => {
      const can = rowActions(entry, merges[k], squashes[k]);
      const disarm = () => { const { [k]: _, ...rest } = shared("pr-merge") ?? {}; setShared("pr-merge", rest); };
      return [
        blocked(entry) && action(`blocker-${k}`, BLOCKER_VERB[entry.blocker.step] ?? "Ouvrir le check en échec", () => exec("open", [entry.blocker.url])),
        isDraft(entry) && action(`ready-${k}`, "Passer prête pour review",
          (cx) => this.act(cx, "Passage en revue", ["gh", "pr", "ready", entry.url], { timeout: 30000 }, askRound)),
        can.squash && guarded(`squash-${k}`, `Squasher ${entry.fixups} fixup!`, "Confirmer le push forcé",
          () => setShared("pr-squash", { ...(shared("pr-squash") ?? {}), [k]: { state: "asked", at: Date.now() } })),
        can.arm === "arm" && action(`arm-${k}`, "Merger quand tout est vert",
          () => setShared("pr-merge", { ...(shared("pr-merge") ?? {}), [k]: { head: entry.head, at: Date.now(), why: null, error: null } })),
        can.arm === "disarm" && action(`arm-${k}`, "Désarmer le merge", disarm),
        can.arm === "refused" && action(`arm-${k}`, `Effacer le refus du merge`, disarm, t.ansi1),
      ].filter(Boolean);
    };
    // The step band status-jc computed (pipeline.js STEPS): nine slots, a draft fills three.
    const STEPS = ["git", "jenk", "sonar", "rev", "qa", "demo", "risk", "appr", "merge"];
    const fills = { ok: t.done, run: t.working, ko: t.ansi1, me: t.ansi5 }; // me: violet, t.blocked reads red in some themes
    // A cell with a Claude session behind it reopens it: its tab while the agent runs, else a new tab resuming it in its folder.
    const resume = (number, s) => {
      // A ↺ tab already resuming it: two claude --resume on one session would mix its transcript.
      const name = `↺ #${number} ${s.step}`, argv = ["claude", "--resume", s.id];
      const agent = agents().find((a) => [`⟳ #${number} ${s.step}`, name].includes(a.tab_name));
      const terminal = agent && panes().find((p) => p.pane === agent.pane)?.terminal;
      if (terminal) return run("agent.focus", { terminal });
      const space = spaces().find((x) => !x.machine && x.folder === s.folder);
      if (space) run("tab.new", { space: space.id, folder: s.folder, name, argv });
      else run("space.new", { folder: s.folder, tab: name, argv });
    };
    // Each state has a shape besides its color, readable without the pulse and when two hues look alike:
    // filled (ok, ko), filled and pulsing (run), outlined (wait), filled with a bright ring (me), faint (todo), dashed (skip).
    // quiet (a paused PR): colored states keep their hue as an outline, so done steps still read ahead of upcoming ones
    // (a global opacity made done cells darker than upcoming ones) and nothing pulses.
    // thin: a 6 px bar without its step name, for a row that is neither « à toi » nor picked: the title is how a PR is
    // found, the band only says how far it went. Same cells, colors and clicks; the step and state go in the tooltip.
    const cellOf = (k, entry, label, state, quiet = false, thin = false) => {
      const cell = div().id(`cell-${k}-${label}`).flex_1().min_w(0).h(thin ? 6 : 17).rounded(thin ? 2 : 3).flex().items_center().justify_center().text_size(10);
      if (!state) return cell;
      const s = sessionOf(entry.sessions, label);
      const tip = [`${label} : ${STATE_HELP[state] ?? state}`, s && `clic : rouvrir la session Claude de ${s.step}`].filter(Boolean).join(" · ");
      return cell.when(!thin, (e) => e.child(label)).when(thin, (e) => e.tooltip(tip))
        .when(Boolean(s), (e) => e.cursor_pointer().hover((x) => x.opacity(0.8)).when(!thin, (x) => x.tooltip(`Rouvrir la session Claude de ${s.step}`))
          .on_click((_e, cx) => { cx.stop_propagation(); resume(k.split("#")[1], s); }))
        .when(Boolean(fills[state]) && !quiet, (e) => e.bg(fills[state]).text_color(t.background))
        .when(Boolean(fills[state]) && quiet, (e) => e.border_1().border_color(fills[state]).text_color(t.muted))
        .when(state === "me" && !quiet && !thin, (e) => e.border(2).border_color(t.foreground).font_bold())
        .when(state === "wait", (e) => e.border_1().border_color(t.working).text_color(t.working))
        .when(state === "todo", (e) => e.bg(t.raised).text_color(quiet ? t.dim : t.muted))
        .when(state === "skip", (e) => e.border_1().border_dashed().border_color(t.border).text_color(t.dim))
        .when(state === "run" && !quiet, (e) => e.loop("opacity", { from: 0.5, to: 1, period: 1200 }));
    };
    const band = (k, entry, thin) => h_flex().gap(2).py(thin ? 2 : 3)
      .children(bandStates(entry.band, merges[k]).map((state, i) => cellOf(k, entry, STEPS[i], state, paused.includes(k), thin)));
    // showRepo: in « À toi », PRs of several repos; in a repo's group its header names it.
    const row = ([k, entry], showRepo) => {
      const [repo, number] = k.split("#"), label = chipLabel(entry, merges[k]);
      // The chip carries the status; "dépend de toi" would only repeat « à toi ».
      const why = [entry.clock?.yours ? null : clockText(entry.clock, Date.now()), entry.why].filter(Boolean).join(" · ");
      const actions = actionsOf(k, entry), shownIn = spaceShowing(entry.work, localSpaces);
      // An ok PR folds its why: its title stays, the PR is found by it; the why comes back as soon as its label changes.
      // A refused merge puts the PR in « À toi »: its row must not fold as a finished one.
      const folded = entry.label === "ok" && !entry.error && !merges[k]?.refused && !pending(k) && !opens[k]?.error;
      const picked = keyboard && k === this.sel;
      return v_flex().id(`watch-${k}`).gap(2).rounded(8).px(8).py(7).cursor_pointer().hover((s) => s.bg(t.hover).border_color(picked ? t.accent : t.hover))
        .border_1().border_color(picked ? t.accent : t.background).when(picked, (e) => e.bg(t.hover))
        .tooltip(blocked(entry) ? BLOCKER_VERB[entry.blocker.step] ?? "Ouvrir le check en échec" : entry.launched ? "Aller à l'agent" : "Ouvrir la PR")
        .on_click(() => open(entry))
        .child(h_flex().gap(6).items_center()
          .when(showRepo, (e) => e.child(repoMark(repo)).child(div().text_size(12).font_semibold().child(repo.split("/").pop())))
          // The number always opens the PR, also on a row whose click opens its blocker.
          .child(h_flex().id(`num-${k}`).h(20).px(4).items_center().rounded(4).text_size(12).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.accent))
            .tooltip("Ouvrir la PR").accessibility_label(`Ouvrir la PR ${repo.split("/").pop()} #${number}`)
            .on_click((_e, cx) => { cx.stop_propagation(); exec("open", [entry.url]); }).child(`#${number}`))
          // Goes to that space, as ⌨ does: a label that names a space must not open the PR.
          .when(Boolean(shownIn), (e) => e.child(h_flex().id(`space-${k}`).min_w(0).h(20).px(4).items_center().rounded(4).truncate().text_size(11).text_color(t.dim)
            .cursor_pointer().hover((x) => x.bg(t.hover).text_color(t.accent)).tooltip("Aller au space").accessibility_label(`Aller au space ${shownIn}`)
            .on_click((_e, cx) => { cx.stop_propagation(); askWork(k); }).child(`space ${shownIn}`)))
          .child(div().flex_1())
          .child(work(k, entry.work)).child(pause(k)).child(chip(label, look(label)[0]).tooltip(LABEL_HELP[label] ?? "")))
        // The title is how a PR is found: foreground, its whole text in the tooltip when truncated.
        .when(Boolean(entry.title), (e) => e.child(div().id(`title-${k}`).text_size(13).text_color(t.foreground).truncate().tooltip(entry.title).child(entry.title)))
        // The full band with step names on « À toi » rows and the picked one; a thin bar elsewhere.
        .when(Array.isArray(entry.band), (e) => e.child(band(k, entry, !(showRepo || picked))))
        .when(Boolean(why) && !folded, (e) => e.child(div().text_size(11).text_color(t.dim).child(why)))
        .when(actions.length > 0, (e) => e.child(h_flex().gap(12).flex_wrap().pt(2).children(actions)))
        .when(Boolean(merges[k]?.refused && merges[k]?.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`merge refusé : ${merges[k].error}`)))
        .when(Boolean(entry.error), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(entry.error)))
        .when(pending(k), (e) => e.child(div().text_size(11).text_color(t.dim).child("ouverture…")))
        .when(Boolean(squashes[k]) && squashes[k].state !== "error", (e) => e.child(squashLine(squashes[k], `squash-line-${k}`)))
        .when(squashes[k]?.state === "error", (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`squash refusé : ${squashes[k].error}`)))
        .when(Boolean(opens[k]?.error) && !pending(k), (e) => e.child(div().text_size(11).text_color(t.ansi1).child(opens[k].error)));
    };
    // The view's own registry: status-jc rewrites pr-watch every round and would drop it.
    const hideDrafts = Boolean(shared("pr-watch-view")?.hideDrafts);
    const maxAgents = reg?.maxAgents ?? 3;
    // From the live value: two clicks before a redraw must count twice.
    const addMax = (d) => {
      const cur = shared("pr-watch") ?? {}, n = (cur.maxAgents ?? 3) + d;
      if (n >= 1 && n <= 9) setShared("pr-watch", { on: false, prs: {}, error: null, at: 0, ...cur, maxAgents: n });
    };
    const drafts = entries.filter(([, e]) => isDraft(e)).length;
    // « À toi » first, then one group per repo (model.js watchSections), the repos folded under « Rien d'autre pour
    // toi » unless opened (kept in pr-watch-view) or a filter is typed. The keys follow the shown order.
    const query = this.query?.value().trim() ?? "";
    const sections = watchSections(entries.filter(([k, e]) => !hiddenDraft(e, hideDrafts)
      && (!query || matchesFilter(k, e, spaceShowing(e.work, localSpaces), query))), merges, rank);
    const mine = sections.find((x) => x.repo === null), rest = sections.filter((x) => x.repo !== null);
    const restCount = rest.reduce((n, x) => n + x.rows.length, 0);
    const restOpen = Boolean(query) || Boolean(shared("pr-watch-view")?.restOpen);
    const sorted = [...(mine?.rows ?? []), ...(restOpen ? rest.flatMap((x) => x.rows) : [])];
    this.keys = sorted.map(([k]) => k); this.byKey = Object.fromEntries(sorted);
    this.openKey = (k) => { const entry = this.byKey?.[k]; if (entry) open(entry); };
    // Nothing is picked until an arrow key picks it: a click that gave the list the keys must not arm p, t or Enter on a row.
    if (this.sel && !this.keys.includes(this.sel)) this.sel = null;
    const strip = h_flex().gap(10).items_center().flex_wrap().text_size(11).text_color(t.muted)
        .child(h_flex().id("watch-switch").h(24).gap(8).items_center().rounded(6).px(4).text_size(12).text_color(t.foreground).cursor_pointer().hover((s) => s.bg(t.hover))
          .on_click(() => setShared("pr-watch", { on: false, prs: {}, error: null, at: 0, ...reg, on: !reg?.on }))
          .child(dot(reg?.on ? "ok" : "ko")).child(div().child(reg?.on ? "Surveillance active" : "Surveillance coupée")))
        // The ceiling of watch agents at once: status-jc reads pr-watch.maxAgents live, its default (3) until set here.
        .child(h_flex().gap(2).items_center()
          .child(rowButton("agents-less", maxAgents <= 1 ? "Minimum : 1 agent de surveillance"
            : `Un agent de surveillance de moins (${maxAgents} au plus ; ceux en cours continuent)`, () => addMax(-1)).when(maxAgents <= 1, (e) => e.opacity(0.4)).child("−"))
          .child(div().child(`Agents ${reg?.agents?.busy ?? 0}/${maxAgents}`))
          .child(rowButton("agents-more", maxAgents >= 9 ? "Maximum : 9 agents de surveillance"
            : `Un agent de surveillance de plus (${maxAgents} au plus)`, () => addMax(1)).when(maxAgents >= 9, (e) => e.opacity(0.4)).child("+")))
        .when(Boolean(reg?.agents), (e) => e.child(div().child(reg.karadoc ? `karadoc pris (${reg.karadoc.replace(/^⟳ /, "")})` : "karadoc libre")))
        .when(drafts > 0, (e) => e.child(h_flex().id("watch-drafts").h(22).px(8).items_center().rounded(11).border_1().border_color(t.border).cursor_pointer()
          .hover((s) => s.bg(t.hover)).tooltip(hideDrafts ? "Afficher les brouillons" : "Masquer les brouillons")
          .on_click(() => setShared("pr-watch-view", { ...(shared("pr-watch-view") ?? {}), hideDrafts: !hideDrafts }))
          .when(hideDrafts, (c) => c.text_color(t.dim))
          .child(hideDrafts ? `Brouillons masqués (${drafts})` : `Brouillons (${drafts})`)));
    // The panel's own mouse down takes the keyboard for the list (track_focus below): a click in the field must stop
    // there, or the list takes the keyboard back right after the field got it and nothing can be typed.
    const filterField = h_flex().id("watch-filter").gap(6).items_center().mt(8).h(28).px(8).rounded(6).border_1().border_color(this.queryFocused ? t.accent : t.border)
      .on_mouse_down("left", (_e, cx) => { cx.stop_propagation(); this.query.focus(); })
      .child(svg("mods/workspace-chrome/search.svg").size(12).flex_none().text_color(t.dim))
      .child(Input.new(this.query).flex_1().min_w(0).text_size(12).text_color(t.foreground));
    // The fold of the PRs that wait on nobody but the watch, a colleague or the CI; a typed filter opens it.
    const toggleRest = () => setShared("pr-watch-view", { ...(shared("pr-watch-view") ?? {}), restOpen: !shared("pr-watch-view")?.restOpen });
    const restHeader = h_flex().id("watch-rest").gap(6).items_center().px(8).pt(12).pb(4).text_size(11).font_semibold().text_color(t.dim)
      .when(!query, (e) => e.cursor_pointer().hover((x) => x.text_color(t.foreground)).on_click(toggleRest)
        .tooltip(restOpen ? "Replier" : "Déplier").accessibility_label(restOpen ? "Replier les autres PR" : "Déplier les autres PR"))
      .child(svg(`mods/workspace-chrome/chevron-${restOpen ? "down" : "right"}.svg`).size(12).flex_none())
      .child(`RIEN D'AUTRE POUR TOI (${restCount})`);
    // Each header and row is a direct child of the scroll area: scroll_to_item reaches the picked row.
    // « À toi » as a section; a repo keeps its case, as on the rows, GitHub and the spaces.
    // px(8): the rows' own padding, so headers, icons and the rows' text share one left edge.
    const items = [
      ...(mine ? [section(`${mine.title} (${mine.rows.length})`).px(8).text_color(t.blocked), ...mine.rows.map((r) => row(r, true))] : []),
      ...(restCount ? [restHeader] : []),
      ...(restOpen ? rest.flatMap((x) => [
        h_flex().gap(6).items_center().px(8).pt(10).pb(4).text_size(12).font_semibold().text_color(t.dim).child(repoMark(x.repo)).child(x.title),
        ...x.rows.map((r) => row(r, false)),
      ]) : []),
      ...(query && !sections.length ? [div().px(8).pt(12).text_size(12).text_color(t.dim).child(`Aucune PR ne correspond à « ${query} »`)] : []),
    ];
    const watch = [strip, filterField, reg?.error ? div().pt(6).text_size(11).text_color(t.ansi1).child(reg.error) : null, div().h(4), ...items].filter(Boolean);
    // The picked row's index among the body's children (the help, when open, comes first).
    const itemKeys = [
      ...(mine ? [null, ...mine.rows.map(([k]) => k)] : []), ...(restCount ? [null] : []),
      ...(restOpen ? rest.flatMap((x) => [null, ...x.rows.map(([k]) => k)]) : []), ...(query && !sections.length ? [null] : []),
    ];
    // Read when the key is handled: an arrow key folds the help first, so it is no longer a child then.
    const rowIndex = (k) => { const i = itemKeys.indexOf(k); return i < 0 ? null : (this.helpOpen ? 1 : 0) + watch.length - items.length + i; };

    // The "?" help: the watch's workflow, its colors and the buttons; the details sit in each tooltip.
    const legend = (items) => v_flex().gap(4).children(items.map(([mark, text]) => h_flex().gap(8).items_start()
      .child(div().w(44).flex_none().child(mark)).child(div().flex_1().min_w(0).text_color(t.muted).child(text))));
    const help = v_flex().gap(4).mb(10).p(10).rounded(8).bg(t.raised).text_size(11)
      .child(div().text_color(t.muted).child(`Tes PR ouvertes de ${this.config?.owners.join(", ") ?? "tes organisations (config.json absent ou invalide : lance yadm alt)"} touchées depuis 7 jours (un brouillon seulement si un space montre sa branche), `
        + "qu'un tour (toutes les 2 min, le bouton rafraîchir de l'en-tête pour tout de suite) fait avancer en lançant un agent pour l'étape suivante. La PR de la branche affichée a son propre panneau, Pull request."))
      .child(section("Étapes, dans l'ordre"))
      .child(legend(STEPS.map((s) => [cellOf("help", {}, s, "todo"), STEP_HELP[s]])))
      .child(section("Couleurs"))
      .child(legend(["ok", "run", "wait", "ko", "me", "todo", "skip"].map((s) => [cellOf(`help-${s}`, {}, "rev", s), STATE_HELP[s]])))
      .child(section("Boutons"))
      .child(legend([
        ["− +", "règle combien d'agents de surveillance tournent à la fois (1 à 9, 3 par défaut) ; en baisser le nombre n'arrête pas ceux en cours"],
        ["actions", "sous une PR quand elles servent : passer prête pour review (et lancer un tour), squasher les fixup! (push forcé : un second clic confirme), merger quand tout est vert (rebase and merge dès que tous les checks passent) ou désarmer"],
        [svg("mods/workspace-chrome/terminal.svg").size(14).text_color(t.dim), "ouvre un space Claude dans le worktree de la PR (une PR prête est mise en pause tant qu'il est ouvert)"],
        [h_flex().gap(4).child(svg("mods/pr/pause.svg").size(13).text_color(t.dim)).child(svg("mods/pr/play.svg").size(13).text_color(t.dim)), "met en pause ou reprend : rien n'est lancé sur une PR en pause"],
        ["clic", "sur une ligne : le log Jenkins ou l'analyse Sonar d'une PR « à toi », sinon l'agent qui y travaille, sinon la PR ; sur le numéro : la PR ; sur une case d'agent : rouvre sa dernière session Claude"],
      ]))
      .child(section("Clavier"))
      .child(legend([
        ["⌘⇧U", "ouvre la Surveillance et lui donne le clavier (un clic dans le panneau aussi)"],
        ["↑ ↓", "choisit une PR (la liste défile jusqu'à elle)"],
        ["/", "va au filtre : dépôt, titre, space ou #N, chaque mot doit y être ; Entrée ouvre la première PR, Échap vide le filtre puis revient à la liste"],
        ["Entrée", "comme un clic sur la ligne : le blocage d'une PR « à toi », sinon l'agent, sinon la PR"],
        ["p", "met la PR en pause ou la reprend"],
        ["t", "ouvre son worktree, comme le bouton terminal"],
        ["Échap", "rend le clavier au terminal"],
      ]))
      .child(div().pt(4).text_color(t.dim).child("Survole un statut ou un bouton pour son détail."));

    // One refresh per panel: Rafraîchir asks gh again for the shown branch, ↻ asks status-jc for a watch round.
    const header = this.view === "pr"
      ? h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Pull request")).child(div().flex_1())
        .when(this.loading, (e) => e.child(div().text_size(11).text_color(t.dim).child("…")))
        .child(div().id("pr-refresh").text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.text_color(t.foreground)).on_click((_e, cx) => { this.refresh(cx, true); cx.notify(); }).child("Rafraîchir"))
      : h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Surveillance des PR")).child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child(nextRound(reg, Boolean(shared("pr-watch-now")), Date.now())))
        .child(h_flex().id("watch-now").w(24).h(24).items_center().justify_center().rounded(5).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
          .tooltip("Faire un tour maintenant").accessibility_label("Faire un tour maintenant").on_click(askRound).child(svg("mods/pr/refresh.svg").size(13)))
        .child(h_flex().id("pr-help").w(20).h(20).items_center().justify_center().rounded(10).border_1().border_color(t.border).text_size(11).cursor_pointer()
          .text_color(this.helpOpen ? t.foreground : t.dim).hover((s) => s.bg(t.hover)).tooltip(this.helpOpen ? "Masquer l'aide" : "Aide").accessibility_label(this.helpOpen ? "Masquer l'aide" : "Aide")
          .on_click((_e, cx) => { this.helpOpen = !this.helpOpen; cx.notify(); }).child("?"));
    const content = this.view === "pr" ? [body] : [this.helpOpen ? help : null, ...watch].filter(Boolean);
    // ↑/↓ pick a row, Enter goes to its agent or PR, p pauses or resumes it, t opens its worktree, Escape gives the keys back.
    const onKey = (e, cx) => {
      const k = e.keystroke, sel = this.sel, entry = sel && this.byKey?.[sel];
      // Typing in the filter field: its own keys, except Escape (clears it, then back to the list) and ↓ (to the list).
      if (this.queryFocused) {
        if (k === "escape" && this.query.value()) this.query.set_value("");
        else if (k === "escape" || k === "down") { this.handle.focus(); if (k === "down") { this.sel = moveSel(this.keys ?? [], null, 1); const i = rowIndex(this.sel); if (i !== null) this.scroll.scroll_to_item(i); } }
        else return;
        cx.stop_propagation(); cx.notify(); return;
      }
      // The help sits above the list: an arrow key folds it so the picked row stays in view.
      if (k === "up" || k === "down") {
        this.sel = moveSel(this.keys ?? [], sel, k === "up" ? -1 : 1); this.helpOpen = false;
        const i = rowIndex(this.sel); if (i !== null) this.scroll.scroll_to_item(i);
      }
      else if (k === "/") this.query.focus();
      else if (k === "enter" && entry) open(entry);
      else if (k === "p" && entry) togglePause(sel);
      else if (k === "t" && entry) askWork(sel);
      // Back to the focused terminal; release() would free the handle that track_focus still uses.
      else if (k === "escape") { const f = focused(); if (f?.pane) run("pane.focus", { pane: f.pane }); }
      else return;
      cx.stop_propagation(); cx.notify();
    };
    // The accent border says the watch holds the keyboard, picked row or not (an empty list has none).
    return v_flex().id(this.view).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(keyboard ? t.accent : t.border).text_color(t.foreground).text_size(13)
      .when(this.view === "watch", (e) => e.track_focus(this.handle).on_key_down(onKey).on_mouse_down("left", () => this.handle.focus()))
      .child(header)
      .child(v_flex().id(`${this.view}-body`).flex_1().min_h(0).overflow_y_scroll().when(this.view === "watch", (e) => e.track_scroll(this.scroll)).p(14).children(content))
      .when(Boolean(this.note), (e) => e.child(div().px(14).pb(10).text_size(11).text_color(t.muted).child(this.note)));
  }
}
