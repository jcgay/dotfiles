import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, home, layout, run, theme, watchFolder } from "herdr";
import { PAGE, JOURNAL_FILE, parseTail, when } from "./model.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const found = find(child, id); if (found) return found; }
  return null;
}
// A hidden copy reads nothing: only while the panel shows this block.
function visible() {
  const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
  return Boolean(panel && !panel.hidden && body?.active === "journal");
}

const two = (n) => String(n).padStart(2, "0");
const today = () => { const d = new Date(); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };

// What status-jc's watch and armed merge did: the end of ~/Library/Logs/herdr-watch.log.
export default class Journal extends View {
  init(_props, cx) {
    this.file = `${home()}/${JOURNAL_FILE}`;
    this.count = PAGE; this.entries = []; this.more = false; this.stale = true; this.error = null;
    const dir = this.file.replace(/\/[^/]+$/, "");
    cx.spawn(async (cx) => {
      for (;;) {
        const changed = await watchFolder(dir).catch(() => [dir]);
        if (!changed.some((p) => p === this.file || p === dir)) continue;
        if (visible()) this.read(cx); else this.stale = true;
      }
    });
    // A watch can be reclaimed by Herdr: read again now and then while shown.
    cx.timer.every(60000, (cx) => { if (visible()) this.read(cx); });
  }

  read(cx) {
    this.stale = false;
    cx.spawn(async (cx) => {
      const r = await exec("tail", ["-n", String(this.count), this.file], { timeout: 5000 }).catch((e) => ({ code: -1, stderr: e.message }));
      // No file yet: nothing happened since the journal exists.
      const absent = r.code !== 0 && /No such file/.test(r.stderr ?? "");
      this.error = r.code === 0 || absent ? null : (r.stderr ?? "").trim() || "lecture impossible";
      if (r.code === 0 || absent) {
        this.entries = parseTail(r.code === 0 ? r.stdout : "");
        this.more = this.entries.length >= this.count;
      }
      cx.notify();
    });
  }

  render(cx) {
    const shown = visible();
    if (shown && (!this.shown || this.stale)) this.read(cx);
    this.shown = shown;
    const t = theme(), day = today();
    const button = (id, text, onClick) => div().id(id).h(26).px(10).flex().items_center().rounded(7).cursor_pointer().text_size(12)
      .bg(t.raised).text_color(t.foreground).hover((s) => s.opacity(0.85)).on_click((_e, cx) => onClick(cx)).child(text);
    const row = (e, i) => h_flex().id(`entry-${i}`).gap(8).px(4).py(3).items_start().rounded(6).text_size(12)
      .when(Boolean(e.url), (r) => r.cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Ouvrir la PR").on_click(() => exec("open", [e.url])))
      .child(div().flex_none().text_size(11).pt(1).text_color(t.dim).child(when(e, day)))
      .when(Boolean(e.key), (r) => r.child(div().flex_none().font_semibold().child(`${e.repo.split("/").pop()}#${e.number}`)))
      .child(div().flex_1().min_w(0).text_color(t.muted).child(e.text));
    const body = v_flex().gap(1)
      .when(Boolean(this.error), (b) => b.child(div().text_size(11).text_color(t.ansi1).child(this.error)))
      .when(this.entries.length === 0 && !this.error, (b) => b.child(div().text_size(12).text_color(t.dim).child("Rien pour l'instant")))
      .children(this.entries.map(row))
      .child(h_flex().pt(10).gap(8).justify_center()
        .when(this.more, (r) => r.child(button("journal-more", "Plus", (cx) => { this.count += PAGE; this.read(cx); })))
        .child(button("journal-all", "Tout le journal", () => run("tab.new", { name: "Journal", argv: ["less", "+G", this.file] }))));

    return v_flex().id("journal").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Journal")).child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child("surveillance et merge")))
      .child(v_flex().id("journal-body").flex_1().min_h(0).overflow_y_scroll().p(14).child(body));
  }
}
