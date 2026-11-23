// projects: pick a repo at the root of ~/dev and open a space on it, or go to the one already open.
// Design: ~/.config/herdr-app/docs/2026-11-23-projects-picker-design.md

import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, ScrollHandle } from "gpui-base";
import { props, closeOverlay, theme, spaces, panes, exec, home, run, checking } from "herdr";
import { parseRepos, parseCommits, stamp, markOpened, order, filter, spaceRepo, openSpaceFor } from "./lib.js";

// localStorage: "recent" is { "<repo name>": <ms it was opened> }, "open" the repos open at the last look.
function load(key, empty) {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? empty; } catch { return empty; }
}
function save(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default class Projects extends View {
  init(_props, cx) {
    this.root = `${home()}/dev`;
    this.roots = [this.root];
    this.names = null; // null: loading
    this.error = "";
    this.recent = load("recent", {});
    this.commits = {};
    this.sel = null; // the chosen repo's name: the list reorders when the commit dates arrive, an index would point elsewhere
    this.input = InputState.new({ placeholder: "Projet de ~/dev" });
    this.input.on("change", (_e, cx) => { this.sel = null; this.scroll.scroll_to_item(0); cx.notify(); });
    this.input.on("submit", (_e, cx) => { const rows = this.rows(); this.open(rows[this.at(rows)]); });
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.handle.focus();
    cx.timer.after(100, () => this.input.focus());
    if (checking()) return;
    cx.spawn(async (cx) => this.load(cx));
  }

  async load(cx) {
    const real = await exec("realpath", [this.root]).catch(() => null);
    if (real?.code === 0 && real.stdout.trim() !== this.root) this.roots.push(real.stdout.trim());
    const found = await exec("find", [`${this.root}/`, "-mindepth", "2", "-maxdepth", "2", "-name", ".git", "-type", "d"], { timeout: 10000 }).catch((e) => ({ code: -1, stderr: e?.message ?? String(e) }));
    // find exits non-zero on one unreadable folder too: only an empty answer is a failure.
    this.names = parseRepos(found.stdout ?? "");
    if (!this.names.length && found.code !== 0) this.error = `Impossible de lire ~/dev : ${(found.stderr ?? "").trim() || `code ${found.code}`}`;
    // A repo open now that was not open at the last look was opened since: it moves to the top.
    const known = new Set(this.names);
    const open = [...new Set(spaces().filter((s) => !s.machine).map((s) => spaceRepo(s, panes(), this.roots, known)).filter(Boolean))];
    this.recent = markOpened(load("recent", {}), load("open", []), open, Date.now());
    save("recent", this.recent);
    save("open", open);
    cx.notify();
    const script = 'for d in "$1"/*/.git; do [ -d "$d" ] || continue; n=${d%/.git}; printf "%s %s\\n" "${n##*/}" "$(git -C "$n" log -1 --format=%ct 2>/dev/null)"; done';
    const dates = await exec("sh", ["-c", script, "sh", this.root], { timeout: 30000 }).catch(() => null);
    if (dates) { this.commits = parseCommits(dates.stdout); cx.notify(); }
  }

  rows() {
    return filter(order(this.names ?? [], this.recent, this.commits), this.input.value());
  }

  at(rows) {
    return Math.max(0, rows.indexOf(this.sel));
  }

  open(name) {
    if (!name) return;
    const id = openSpaceFor(name, this.roots, panes(), spaces());
    save("recent", stamp(load("recent", {}), [name], Date.now()));
    closeOverlay(props().overlay);
    if (id) run("space.select", { id });
    else run("space.new", { folder: `${this.root}/${name}` });
  }

  key(e, cx) {
    if (e.key === "escape") return closeOverlay(props().overlay);
    const rows = this.rows(), n = rows.length;
    if ((e.key === "down" || e.key === "up") && n) {
      const i = (this.at(rows) + (e.key === "down" ? 1 : n - 1)) % n;
      this.sel = rows[i];
      this.scroll.scroll_to_item(i);
      cx.stop_propagation();
      cx.notify();
    }
  }

  render() {
    const t = theme(), rows = this.rows(), at = this.at(rows), sp = spaces(), ps = panes();
    const row = (name, i) => h_flex().id(`p-${name}`).h(28).px(10).gap(8).items_center().rounded(6).cursor_pointer()
      .when(i === at, (el) => el.bg(t.selected))
      .when(i !== at, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => this.open(name))
      .child(div().flex_1().truncate().child(name))
      .when(Boolean(openSpaceFor(name, this.roots, ps, sp)), (el) => el.child(div().text_size(11).text_color(t.accent).child("ouvert")));
    return v_flex().id("projects").track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .size_full().p(16).gap(10).bg(t.popover).text_size(13).text_color(t.foreground)
      .child(div().font_semibold().child("Ouvrir un projet"))
      .child(Input.new(this.input).h(32).px(10).items_center().rounded(6).border(1).border_color(t.input).bg(t.background).text_color(t.foreground))
      .child(div().relative().flex_1().min_h(0)
        .child(v_flex().id("projects-list").size_full().overflow_y_scroll().track_scroll(this.scroll).children(rows.map(row))
          .when(!rows.length, (el) => el.child(div().p(10).text_color(t.dim).child(this.error || (this.names ? "Aucun projet" : "Chargement…")))))
        .child(Scrollbar.vertical("projects-list").absolute().inset_0()))
      .child(h_flex().justify_end().text_size(11).text_color(t.dim).child("↑↓ choisir · ↵ ouvrir · esc fermer"));
  }
}
