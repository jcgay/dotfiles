// The watch rows' right-click menu (a popup copy of this mod, layout prop view: "menu"), and the requests it shares with
// the watch list: each writes what status-jc reads (pr-merge, pr-squash, pr-open, pr-watch.paused), read live.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec, theme, shared, setShared, props, closeOverlay, openOverlay, notify } from "herdr";
import { menuItems } from "./model.js";

const CONFIRM_MS = 4000;
const FORCED = new Set(["squash", "rebase"]); // force pushes: a second click confirms // as the row's squash link (main.js guarded)
const blank = { on: false, prs: {}, error: null, at: 0 }; // a registry status-jc has not written yet

// status-jc opens a space in the PR's worktree (opener.js); held: the opening owns the PR's pause.
export function requestWork(k) {
  const opens = shared("pr-open") ?? {};
  if (["asked", "opening"].includes(opens[k]?.state)) return;
  setShared("pr-open", { ...opens, [k]: { state: "asked", at: Date.now(), held: opens[k]?.state === "held", folders: opens[k]?.folders } });
}

export function togglePause(k) {
  // A pause touched by hand is the user's now: the opening no longer lifts it on close.
  if (shared("pr-open")?.[k]?.state === "held") { const { [k]: _, ...rest } = shared("pr-open"); setShared("pr-open", rest); }
  const reg = shared("pr-watch") ?? {}, paused = reg.paused ?? [];
  setShared("pr-watch", { ...blank, ...reg, paused: paused.includes(k) ? paused.filter((p) => p !== k) : [...paused, k] });
}

export const armMerge = (k, head) => setShared("pr-merge", { ...(shared("pr-merge") ?? {}), [k]: { head, at: Date.now(), why: null, error: null } });
export const dropMerge = (k) => { const { [k]: _, ...rest } = shared("pr-merge") ?? {}; setShared("pr-merge", rest); };
export const requestSquash = (k) => setShared("pr-squash", { ...(shared("pr-squash") ?? {}), [k]: { state: "asked", at: Date.now() } });
// A round now: a PR just made ready for review starts its reviews without waiting the 2 min.
export const askRound = () => setShared("pr-watch-now", { at: Date.now() });

// Row k as status-jc wrote it, or the left-aside draft, and its menu items: the popup is sized and drawn from the same.
function rowMenu(k, aside) {
  const reg = shared("pr-watch") ?? {};
  const entry = aside ? (reg.aside ?? []).find((d) => d.key === k) ?? { key: k } : reg.prs?.[k] ?? {};
  const ctx = { aside: Boolean(aside), merge: shared("pr-merge")?.[k] ?? null, squash: shared("pr-squash")?.[k] ?? null, paused: (reg.paused ?? []).includes(k) };
  return { k, entry, items: menuItems(entry, ctx) };
}

// Opens the menu of watch row k at the pointer; aside: a draft status-jc leaves aside (reg.aside).
export function openRowMenu(k, aside) {
  const n = rowMenu(k, aside).items.length;
  openOverlay({ mod: "pr", kind: "popup", width: 250, height: n * 31 + 10, props: { view: "menu", key: k, aside } });
}

export class WatchMenu {
  constructor(cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
    this.at = 0;
    this.confirm = null; // { id, at }: a force push (squash, rebase) asks a second click within CONFIRM_MS, as on the row
    this.busy = null; // "Passage en revue…" while gh pr ready runs
  }

  target() {
    const p = props() ?? {};
    return rowMenu(p.key, p.aside);
  }

  confirming(id) { return this.confirm?.id === id && Date.now() - this.confirm.at < CONFIRM_MS; }

  close() { closeOverlay(props()?.overlay); }

  choose(item, cx) {
    const { k, entry } = this.target();
    if (FORCED.has(item.id) && !this.confirming(item.id)) {
      this.confirm = { id: item.id, at: Date.now() };
      cx.timer.after(CONFIRM_MS + 50, (cx) => cx.notify());
      return cx.notify();
    }
    if (item.id === "ready") return this.run(cx, "Passage en revue…", "Passage en revue impossible", ["pr", "ready", entry.url]);
    if (item.id === "rebase") return this.run(cx, "Rebase sur la base…", "Rebase impossible", ["pr", "update-branch", entry.url, "--rebase"]);
    if (item.id === "open") exec("open", [entry.url]);
    else if (item.id === "blocker") exec("open", [entry.blocker.url]);
    else if (item.id === "work") requestWork(k);
    else if (item.id === "pause" || item.id === "resume") togglePause(k);
    else if (item.id === "arm") armMerge(k, entry.head);
    else if (item.id === "disarm" || item.id === "clear") dropMerge(k);
    else if (item.id === "squash") requestSquash(k);
    this.close();
  }

  // gh, then a round (the watch sees the new state now, not in 2 min): the menu stays open on busy until gh answers,
  // an error is a toast. A rebase gives the PR a new head: status-jc disarms its armed merge, as after any push.
  run(cx, busy, failed, args) {
    if (this.busy) return;
    this.busy = busy;
    cx.notify();
    cx.spawn(async () => {
      const r = await exec("gh", args, { timeout: 30000 }).catch((e) => ({ code: 1, stderr: String(e) }));
      if (r.code === 0) askRound();
      else notify({ title: failed, body: (r.stderr || r.stdout).trim().split("\n")[0], level: "error" });
      this.close();
    });
  }

  render(cx) {
    const t = theme(), { items } = this.target();
    this.at = Math.max(0, Math.min(this.at, items.length - 1)); // a round may drop an item while the menu is open
    return v_flex().id("watch-menu").track_focus(this.handle).w_full().min_h(0).p(5).bg(t.popover).text_size(12.8)
      .on_key_down((e, cx) => {
        if (e.key === "down") this.at = (this.at + 1) % items.length;
        else if (e.key === "up") this.at = (this.at + items.length - 1) % items.length;
        else if (e.key === "enter" && items[this.at]) return this.choose(items[this.at], cx);
        else if (e.key === "escape") return this.close();
        else return;
        cx.notify();
      })
      .when(Boolean(this.busy), (e) => e.child(h_flex().h(31).px(8).items_center().text_color(t.muted).child(this.busy)))
      .when(!this.busy, (e) => e.children(items.map((it, i) => {
        const label = this.confirming(it.id) ? "Confirmer le push forcé" : it.label;
        return h_flex().id(`wm-${it.id}`).h(31).px(8).rounded(7).items_center().cursor_pointer()
          .text_color(this.confirming(it.id) ? t.blocked : t.foreground)
          .when(i === this.at, (el) => el.bg(t.selected)).hover((s) => s.bg(t.hover))
          .on_click((_e, cx) => this.choose(it, cx))
          .child(div().flex_1().child(label));
      })));
  }
}
