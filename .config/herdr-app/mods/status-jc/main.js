import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, agents, panes, terminals, theme, run, window, keys, exec, home, shared, setShared } from "herdr";
import { parseListeners, parseParents, parseCwds, spaceOf, health } from "./ports.js";
import { round } from "./watcher.js";

const WATCH = "pr-watch";
const FRESH = { on: false, prs: {}, error: null, at: 0 }; // the PR panel's switch turns it on

// workspace-status, plus the ports the shown space's programs listen on.
export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.ports = []; // [{ port, space, state: "up" | "starting" }]
    cx.timer.every(5000, (cx) => this.refresh(cx));
    this.refresh(cx);
    // The PR watch lives here: this bar is always shown, the PR panel is not.
    cx.timer.after(60000, (cx) => this.watch(cx));
    cx.timer.every(300000, (cx) => this.watch(cx));
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
      // null: another copy's round holds the lease. The panel's switch may have flipped during the round: keep it.
      if (next) setShared(WATCH, { ...next, on: shared(WATCH)?.on ?? next.on });
    });
  }

  // lsof finds the listeners, their parents or folder name the space, curl says if they answer.
  refresh(cx) {
    if (this.busy) return;
    this.busy = true;
    cx.spawn(async (cx) => {
      try {
        const listen = await exec("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN", "-Fpn"], { timeout: 4000 });
        const byPid = parseListeners(listen.stdout);
        if (byPid.size === 0) { this.ports = []; return; }
        const [ps, cwd] = await Promise.all([
          exec("ps", ["-axo", "pid=,ppid="], { timeout: 4000 }),
          exec("lsof", ["-a", "-d", "cwd", "-Fn", "-p", [...byPid.keys()].join(",")], { timeout: 4000 }),
        ]);
        const shells = new Map();
        for (const t of terminals()) if (t.pid && t.labels?.["herdr.space"]) shells.set(t.pid, t.labels["herdr.space"]);
        const roots = [];
        for (const s of spaces()) {
          if (s.machine) continue; // lsof only sees this computer
          const tabs = new Set(s.tabs.map((t) => t.id));
          for (const p of panes()) if (tabs.has(p.tab) && p.cwd && p.cwd !== home()) roots.push({ folder: p.cwd, space: s.id });
        }
        const ctx = { parents: parseParents(ps.stdout), shells, cwds: parseCwds(cwd.stdout), roots };
        const found = [];
        for (const [pid, ports] of byPid) {
          const space = spaceOf(pid, ctx);
          if (space) for (const port of ports) found.push({ port, space });
        }
        found.sort((a, b) => a.port - b.port);
        this.ports = await Promise.all(found.map(async (f) => {
          const r = await exec("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "-m", "2", `http://127.0.0.1:${f.port}/`], { timeout: 4000 }).catch(() => null);
          return { ...f, state: r ? health(r.stdout.trim(), r.code) : "starting" };
        }));
      } catch (e) {
        console.log("ports:", e?.message ?? e);
      } finally {
        this.busy = false;
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
    return key ? `${key}  commands` : "commands";
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const list = agents();
    const needs = list.filter(a => a.status === "blocked").length;
    const shown = this.ports.filter((p) => p.space === space?.id);
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    const port = (p) => h_flex().id(`port-${p.port}`).gap(5).items_center().hover((s) => s.text_color(t.foreground))
      .on_click(() => exec("open", [`http://localhost:${p.port}/`]))
      .child(`:${p.port}`)
      .child(p.state === "up"
        ? div().size(6).rounded(3).bg(t.done)
        : div().size(6).rounded(3).border_1().border_color(t.working).loop("opacity", { from: 0.3, to: 1, period: 1200 }));
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(h_flex().gap(6).items_center().child(div().size(6).rounded(3).bg(t.dim)).child(`${list.length} agents`)
        .when(needs > 0, el => el.child(div().text_color(t.blocked).child(`· ${needs} needs you`))))
      .child(div().flex_1())
      .when(shown.length > 0, el => el.child(h_flex().gap(12).items_center().children(shown.map(port))))
      .child(div().id("palette").text_color(t.dim).on_click(() => run("app.palette")).child(this.hint(t)));
  }
}
