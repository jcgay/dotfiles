// node --test ~/.config/herdr-app/mods/status-jc/open.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { watchPath, holdPause, toRelease, shows } from "./open.js";

test("watchPath names the watch worktree after the repo and branch", () => {
  assert.equal(watchPath("/Users/x", "softwarevidal/arthur", "feat/a"), "/Users/x/dev/agents-worktree/arthur/feat/a-watch");
});

test("holdPause pauses a running PR and says it held it", () => {
  assert.deepEqual(holdPause(["o/r#1"], "o/r#2"), { paused: ["o/r#1", "o/r#2"], held: true });
});

test("holdPause leaves a PR paused by hand to the user", () => {
  assert.deepEqual(holdPause(["o/r#2"], "o/r#2"), { paused: ["o/r#2"], held: false });
});

test("toRelease frees held PRs whose folder has no space left", () => {
  const open = { "o/r#1": { state: "held", folders: ["/a"] }, "o/r#2": { state: "held", folders: ["/b"] }, "o/r#3": { state: "opening", at: 0 } };
  assert.deepEqual(toRelease(open, ["/b"]), ["o/r#1"]);
});

test("holdPause keeps the pause it already held when the PR is opened again", () => {
  assert.deepEqual(holdPause(["o/r#2"], "o/r#2", true), { paused: ["o/r#2"], held: true });
});

test("toRelease keeps a held PR whose space shows a subfolder or the resolved path", () => {
  const open = { "o/r#1": { state: "held", folders: ["/Users/x/dev/a-watch", "/Volumes/s/a-watch"] } };
  assert.deepEqual(toRelease(open, ["/Users/x/dev/a-watch/src"]), []);
  assert.deepEqual(toRelease(open, ["/Volumes/s/a-watch"]), []);
  assert.deepEqual(toRelease(open, ["/Users/x/dev/a-watch2"]), ["o/r#1"]);
});

test("shows matches a folder or anything under it", () => {
  assert.equal(shows(["/a/b"], "/a/b"), true);
  assert.equal(shows(["/a/b"], "/a/b/c"), true);
  assert.equal(shows(["/a/b"], "/a/bc"), false);
});
