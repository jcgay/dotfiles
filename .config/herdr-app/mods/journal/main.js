import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, home, layout, run, theme, shared, setShared } from "herdr";
import { PAGE, JOURNAL_FILE, parseTail, when, unread } from "./model.js";

const READ = "journal-read", LINES = "journal-lines"; // marker set here, line count published by status-jc

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
    this.count = PAGE; this.total = 0; this.entries = []; this.more = false; this.error = null;
    this.seq = 0; // the latest read: an older one finishing last is dropped
  }

  read(cx) {
    const id = ++this.seq;
    // status-jc publishes the line count after each write: render reads again when it changes.
    this.seen = shared(LINES);
    cx.spawn(async (cx) => {
      // One pass, so the count and the lines are the same file: the count first, then the last lines. Exit 3: no file yet.
      const r = await exec("sh", ["-c", '[ -f "$1" ] || exit 3; awk -v n="$2" \'{ a[NR % n] = $0 } END { print NR; for (i = NR > n ? NR - n + 1 : 1; i <= NR; i++) print a[i % n] }\' "$1"',
        "sh", this.file, String(this.count)], { timeout: 5000 })
        .catch((e) => ({ code: -1, stderr: e.message }));
      if (id !== this.seq) return;
      const absent = r.code === 3;
      this.error = r.code === 0 || absent ? null : (r.stderr ?? "").trim() || "lecture impossible";
      if (r.code === 0 || absent) {
        const [count, ...rest] = r.code === 0 ? r.stdout.split("\n") : ["0"];
        this.total = Number(count.trim()) || 0;
        this.entries = parseTail(rest.join("\n"));
        this.more = this.total > this.count;
        // A file written before status-jc published its count: the badge catches up here. Never over status-jc's newer count.
        if (shared(LINES) == null && this.total > 0) setShared(LINES, this.total);
      }
      cx.notify();
    });
  }

  render(cx) {
    const shown = visible();
    if (shown && (!this.shown || shared(LINES) !== this.seen)) this.read(cx);
    this.shown = shown;
    const t = theme(), day = today();
    const button = (id, text, onClick) => div().id(id).h(26).px(10).flex().items_center().rounded(7).cursor_pointer().text_size(12)
      .bg(t.raised).text_color(t.foreground).hover((s) => s.opacity(0.85)).on_click((_e, cx) => onClick(cx)).child(text);
    const fresh = unread(this.total, shared(READ));
    const row = (e, i) => h_flex().id(`entry-${i}`).gap(8).px(4).py(3).items_start().rounded(6).text_size(12)
      .when(Boolean(e.url), (r) => r.cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Ouvrir la PR").on_click(() => exec("open", [e.url])))
      .child(div().flex_none().text_size(11).pt(1).text_color(t.dim).child(when(e, day)))
      .when(Boolean(e.key), (r) => r.child(div().flex_none().font_semibold().child(`${e.repo.split("/").pop()}#${e.number}`)))
      .child(div().flex_1().min_w(0).text_color(i < fresh ? t.foreground : t.dim).child(e.text));
    // Unread lines first, then the marker, then the read ones greyed.
    const marker = h_flex().gap(8).py(4).items_center().text_size(10.5).text_color(t.dim)
      .child(div().flex_1().h(1).bg(t.border)).child("lu").child(div().flex_1().h(1).bg(t.border));
    const rows = this.entries.flatMap((e, i) => (i === fresh ? [marker, row(e, i)] : [row(e, i)]));
    const body = v_flex().gap(1)
      .when(Boolean(this.error), (b) => b.child(div().text_size(11).text_color(t.ansi1).child(this.error)))
      .when(this.entries.length === 0 && !this.error, (b) => b.child(div().text_size(12).text_color(t.dim).child("Rien pour l'instant")))
      .children(rows)
      .child(h_flex().pt(10).gap(8).justify_center()
        .when(this.more, (r) => r.child(button("journal-more", "Plus", (cx) => { this.count += PAGE; this.read(cx); })))
        .child(button("journal-all", "Tout le journal", () => run("tab.new", { name: "Journal", argv: ["less", "+G", this.file] }))));

    return v_flex().id("journal").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Journal")).child(div().flex_1())
        .child(fresh > 0
          ? h_flex().gap(8).items_center().child(div().text_size(11).text_color(t.dim).child(`${fresh} non lue${fresh > 1 ? "s" : ""}`))
            .child(button("journal-read", "Tout lu", () => setShared(READ, this.total)))
          : div().text_size(11).text_color(t.dim).child("surveillance et merge")))
      .child(v_flex().id("journal-body").flex_1().min_h(0).overflow_y_scroll().p(14).child(body));
  }
}
