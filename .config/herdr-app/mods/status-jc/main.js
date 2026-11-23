import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, panes, terminals, theme, run, window, keys, exec, home, shared, setShared, setBadge } from "herdr";
import { parseListeners, parseParents, parseCwds, spaceOf, health, stillMapped, healthPlan } from "./ports.js";
import { round } from "./watcher.js";
import { waitingOnMe } from "./watch.js";
import { mergeRound } from "./merger.js";
import { openRound } from "./opener.js";
import { squashRound } from "./squasher.js";

const WATCH = "pr-watch";
const NOW = "pr-watch-now"; // the PR panel's ↻ asks for a round now
const ROUND_MS = 120000;
const FRESH = { on: false, prs: {}, error: null, at: 0, paused: [] }; // the PR panel's switch turns it on

// workspace-status, plus the ports the shown space's programs listen on.
export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.ports = []; // [{ pid, port, space, state: "up" | "starting", at }]
    this.mapped = null; // the last ps and lsof-cwd answers: { at, pids, parents, cwds }
    cx.timer.every(5000, (cx) => this.refresh(cx));
    this.refresh(cx);
    // The PR watch lives here: this bar is always shown, the PR panel is not.
    // nextAt: when the timer runs the next round, for the panel's "tour dans X" (a ↻ round does not move it).
    this.nextAt = Date.now() + 60000;
    cx.timer.after(60000, (cx) => { this.nextAt = Date.now() + 60000; this.watch(cx); });
    cx.timer.every(ROUND_MS, (cx) => { this.nextAt = Date.now() + ROUND_MS; this.watch(cx); });
    // ↻ (PR panel): picked up within 5 s, or once the running round ends (it may have read GitHub before the click).
    cx.timer.every(5000, (cx) => { if (shared(NOW) && !this.watching) { setShared(NOW, null); this.watch(cx); } });
    // Armed merges (PR panel): checked every minute, a merge should follow the end of a build closely.
    cx.timer.every(60000, (cx) => this.merge(cx));
    // "Travailler dessus" (PR panel): picked up within 5 s, the watch round waits 2 min.
    cx.timer.every(5000, (cx) => this.open(cx));
    // Squash button (PR panel): same pace as the openings.
    cx.timer.every(5000, (cx) => this.squash(cx));
  }

  squash(cx) {
    if (this.squashing) return;
    this.squashing = true;
    this.squashId ??= `${Date.now()}-${Math.random()}`;
    cx.spawn(async () => {
      try {
        await squashRound(this.squashId);
      } catch (e) {
        console.log("squash:", e?.message ?? e);
      } finally {
        this.squashing = false;
      }
    });
  }

  open(cx) {
    if (this.opening) return;
    this.opening = true;
    this.openId ??= `${Date.now()}-${Math.random()}`;
    cx.spawn(async () => {
      try {
        await openRound(this.openId);
      } catch (e) {
        console.log("open:", e?.message ?? e);
      } finally {
        this.opening = false;
      }
    });
  }

  merge(cx) {
    if (this.merging) return;
    this.merging = true;
    this.mergeLease ??= `${Date.now()}-${Math.random()}`;
    cx.spawn(async () => {
      try {
        await mergeRound(this.mergeLease);
      } catch (e) {
        console.log("merge:", e?.message ?? e);
      } finally {
        this.merging = false;
      }
    });
  }

  // Rounds run while the watch is off too: the panel stays fresh, decide launches nothing.
  watch(cx) {
    if (this.watching) return;
    this.watching = true;
    cx.spawn(async () => {
      let next;
      try {
        next = await round(shared(WATCH) ?? FRESH, this);
      } catch (e) {
        next = { ...(shared(WATCH) ?? FRESH), error: e?.message ?? String(e), at: Date.now() };
      } finally {
        this.watching = false;
      }
      // null: another copy's round holds the lease. The panel's switch, pauses and agent count may have changed during the round: keep them.
      if (next) {
        // paused is never pruned: the search only sees PRs updated within 7 days, a quiet paused PR would lose its pause.
        const cur = shared(WATCH);
        // running (set by round() once it holds the lease) and next: the panel's header.
        setShared(WATCH, { ...next, on: cur?.on ?? next.on, paused: cur?.paused ?? next.paused ?? [], maxAgents: cur?.maxAgents ?? next.maxAgents, running: false, every: ROUND_MS, next: this.nextAt });
      }
    });
  }

  // lsof finds the listeners, their parents or folder name the space, curl says if they answer.
  refresh(cx) {
    // Asked while a round runs (a space switch): run again after it, or the new space waits for the next tick.
    if (this.busy) { this.again = true; return; }
    this.busy = true; this.again = false;
    cx.spawn(async (cx) => {
      try {
        const listen = await exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], { timeout: 4000 });
        const byPid = parseListeners(listen.stdout);
        if (byPid.size === 0) { this.ports = []; this.mapped = null; return; }
        // The same listeners as last round: their parents and folders have not moved.
        const pids = new Set(byPid.keys());
        if (!stillMapped(pids, this.mapped, Date.now())) {
          const [ps, cwd] = await Promise.all([
            exec("ps", ["-axo", "pid=,ppid="], { timeout: 4000 }),
            exec("lsof", ["-a", "-d", "cwd", "-Fn", "-p", [...pids].join(",")], { timeout: 4000 }),
          ]);
          this.mapped = { at: Date.now(), pids, parents: parseParents(ps.stdout), cwds: parseCwds(cwd.stdout) };
        }
        const shells = new Map();
        for (const t of terminals()) if (t.pid && t.labels?.["herdr.space"]) shells.set(t.pid, t.labels["herdr.space"]);
        const roots = [];
        for (const s of spaces()) {
          if (s.machine) continue; // lsof only sees this computer
          const tabs = new Set(s.tabs.map((t) => t.id));
          for (const p of panes()) if (tabs.has(p.tab) && p.cwd && p.cwd !== home()) roots.push({ folder: p.cwd, space: s.id });
        }
        const ctx = { parents: this.mapped.parents, shells, cwds: this.mapped.cwds, roots };
        const found = [];
        for (const [pid, ports] of byPid) {
          const space = spaceOf(pid, ctx);
          if (space) for (const port of ports) found.push({ pid, port, space });
        }
        found.sort((a, b) => a.port - b.port);
        // curl only what the bar shows; rebuilt from this round's listeners, so a gone one is dropped.
        const previous = new Map(this.ports.map((p) => [`${p.pid}:${p.port}`, p]));
        const shown = spaces().find((s) => s.active)?.id;
        this.ports = await Promise.all(healthPlan(found, previous, shown, Date.now()).map(async ({ ask, ...f }) => {
          if (!ask) return f;
          const r = await exec("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "2", `http://127.0.0.1:${f.port}/`], { timeout: 4000 }).catch(() => null);
          return { ...f, state: r ? health(r.stdout.trim(), r.code) : "starting", at: Date.now() };
        }));
      } catch (e) {
        console.log("ports:", e?.message ?? e);
      } finally {
        this.busy = false;
        if (this.again) this.refresh(cx);
        cx.notify();
      }
    });
  }

  // The palette key as actually bound, not a hardcoded one; without a
  // binding the hint stays useful ("commands") instead of lying.
  hint(t) {
    const mac = window()?.platform === "macos";
    const mod = { cmd: mac ? "⌘" : "Ctrl+", ctrl: mac ? "⌃" : "Ctrl+", shift: mac ? "⇧" : "Shift+", alt: mac ? "⌥" : "Alt+", option: mac ? "⌥" : "Alt+" };
    const b = keys().find((k) => k.section === "global" && k.action === "app.palette");
    const parts = b && b.keys.endsWith("--") ? [...b.keys.slice(0, -2).split("-"), "-"] : b?.keys.split("-");
    const key = parts && parts.map((p) => mod[p.toLowerCase()] ?? p.toUpperCase()).join("");
    return key ? `${key}  commandes` : "commandes";
  }

  render(cx) {
    const t = theme();
    const space = spaces().find(s => s.active);
    // Another space: its ports are curled now, not at the next tick.
    if (cx && space?.id !== this.space) { this.space = space?.id; this.refresh(cx); }
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    // PRs the watch gave up on, or whose armed merge GitHub refused: only the PR panel listed them.
    const mine = waitingOnMe(shared(WATCH)?.prs, shared("pr-merge")).length;
    // The Dock icon shows both counts; setBadge only when it changes (it is not kept across restarts).
    const badge = needs + mine > 0 ? String(needs + mine) : null;
    if (badge !== this.badge) { this.badge = badge; setBadge(badge); }
    const shown = this.ports.filter((p) => p.space === space?.id);
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const port = (p) => h_flex().id(`port-${p.port}`).gap(5).items_center().hover((s) => s.text_color(t.foreground))
      .on_click(() => exec("open", [`http://localhost:${p.port}/`]))
      .child(`:${p.port}`)
      .child(p.state === "up"
        ? div().size(6).rounded(3).bg(t.done)
        : div().size(6).rounded(3).border_1().border_color(t.working).loop("opacity", { from: 0.3, to: 1, period: 1200 }));
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      // This computer is the usual case: only a remote space names its machine.
      .when(Boolean(space?.machine), el => el.child(label("server", space.machine)))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} ${list.length === 1 ? "agent" : "agents"}`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} t'attend${needs > 1 ? "ent" : ""}`))))
      .when(mine > 0, el => el.child(h_flex().id("yours").gap(6).items_center().text_color(t.blocked).cursor_pointer().hover((s) => s.opacity(0.8))
        .tooltip("Ouvrir la surveillance des PR")
        // Same as ⌘⇧U and the tab button (tabs-jc): the watch list takes the keyboard.
        .on_click(() => { run("layout.select", { stack: "panel-body", child: "watch" }); run("layout.show", { id: "panel" }); setShared("watch-focus", Date.now()); })
        .child(div().size(6).rounded(3).bg(t.blocked)).child(`${mine} PR à toi`)))
      .child(div().flex_1())
      .when(shown.length > 0, el => el.child(h_flex().gap(12).items_center().children(shown.map(port))))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
