// projects: pick a repo at the root of ~/dev and open a space on it, or go to the one already open.
// Design: ~/.config/herdr-app/docs/2026-11-23-projects-picker-design.md

import { View, div, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, ScrollHandle } from "gpui-base";
import { props, closeOverlay, theme, spaces, panes, exec, home, appHome, settings, run, checking } from "herdr";
import { parseRepos, parseCommits, parseIcons, stamp, markOpened, order, filter, spaceRepo, openSpaceFor } from "./lib.js";

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
    this.icons = {}; // name -> { light, dark }: the repo's JetBrains icon, copied under appHome for image()
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
    this.copyIcons(cx);
    const script = 'for d in "$1"/*/.git; do [ -d "$d" ] || continue; n=${d%/.git}; printf "%s %s\\n" "${n##*/}" "$(git -C "$n" log -1 --format=%ct 2>/dev/null)"; done';
    const dates = await exec("sh", ["-c", script, "sh", this.root], { timeout: 30000 }).catch(() => null);
    if (dates) { this.commits = parseCommits(dates.stdout); cx.notify(); }
  }

  // .idea/icon.svg (else icon.png) and icon_dark.svg of each repo, as spaces-jc shows them. The folder is
  // hidden: Herdr reloads a mod when a visible file of its folder changes, which would restart the dialog.
  // Only what changed is written.
  copyIcons(cx) {
    const dir = "mods/projects/.icons";
    const script = 'cd "$1" || exit 0; mkdir -p "$2" || exit; for d in */.idea; do n=${d%/.idea}; l=; for e in svg png; do [ -f "$d/icon.$e" ] && l=$e && break; done; [ -n "$l" ] || continue; cmp -s "$d/icon.$l" "$2/$n.$l" || cp "$d/icon.$l" "$2/$n.$l"; k=; if [ -f "$d/icon_dark.svg" ]; then cmp -s "$d/icon_dark.svg" "$2/$n.dark.svg" || cp "$d/icon_dark.svg" "$2/$n.dark.svg"; k="$n.dark.svg"; fi; printf "%s\\t%s\\t%s\\n" "$n" "$n.$l" "$k"; done';
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", script, "sh", `${this.root}/`, `${appHome()}/${dir}`], { timeout: 30000 }).catch(() => null);
      if (r) { this.icons = parseIcons(r.stdout, dir); cx.notify(); } // cosmetic: no icons on failure
    });
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
    else {
      // A new space shows at once: the split goes under its shell, in the same folder.
      run("space.new", { folder: `${this.root}/${name}` });
      run("pane.split", { direction: "down", argv: ["claude"] });
    }
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
    const t = theme(), rows = this.rows(), at = this.at(rows), sp = spaces(), ps = panes(), dark = Boolean(settings().dark);
    const row = (name, i) => h_flex().id(`p-${name}`).h(28).px(10).gap(8).items_center().rounded(6).cursor_pointer()
      .when(i === at, (el) => el.bg(t.selected))
      .when(i !== at, (el) => el.hover((s) => s.bg(t.hover)))
      .on_click(() => this.open(name))
      .child(this.icons[name] ? image(this.icons[name][dark ? "dark" : "light"]).size(16).flex_none().rounded(4) : div().size(16).flex_none())
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
