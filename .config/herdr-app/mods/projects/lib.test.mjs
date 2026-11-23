import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepos, parseCommits, parseRecent, repoOfFolder, stamp, order, filter, openSpaceFor } from "./lib.js";

const roots = ["/Users/jc/dev", "/Volumes/sourcecode"];

test("parseRepos keeps repo names, sorted, without agents-worktree", () => {
  assert.deepEqual(parseRepos("/Users/jc/dev/b/.git\n/Users/jc/dev/a/.git\n/Users/jc/dev/agents-worktree/.git\n"), ["a", "b"]);
});

test("parseCommits turns seconds into ms and skips lines without a date", () => {
  assert.deepEqual(parseCommits("arthur 1700000000\nempty \n"), { arthur: 1700000000000 });
});

test("parseRecent reads the folders of view.json, empty when unreadable", () => {
  assert.deepEqual(parseRecent('{"recent":[{"name":"","folder":"/Volumes/sourcecode/arthur"}]}'), ["/Volumes/sourcecode/arthur"]);
  assert.deepEqual(parseRecent(""), []);
  assert.deepEqual(parseRecent("{"), []);
});

test("repoOfFolder matches under either root, never a longer name", () => {
  const names = new Set(["arthur", "arthur-prisca"]);
  assert.equal(repoOfFolder("/Volumes/sourcecode/arthur", roots, names), "arthur");
  assert.equal(repoOfFolder("/Users/jc/dev/arthur/core", roots, names), "arthur");
  assert.equal(repoOfFolder("/Volumes/sourcecode/arthur-prisca", roots, names), "arthur-prisca");
  assert.equal(repoOfFolder("/Volumes/sourcecode/other", roots, names), null);
  assert.equal(repoOfFolder("/Users/jc", roots, names), null);
});

test("order puts recent first, then by last commit, then by name", () => {
  assert.deepEqual(order(["a", "b", "c", "d"], { c: 2, a: 1 }, { b: 5, d: 9 }), ["c", "a", "d", "b"]);
  assert.deepEqual(order(["z", "y", "x"], {}, { x: 1 }), ["x", "y", "z"]);
});

test("filter is case-insensitive, prefix matches first", () => {
  const l = ["xarthur", "arthur", "blaise"];
  assert.deepEqual(filter(l, "ART"), ["arthur", "xarthur"]);
  assert.deepEqual(filter(l, ""), l);
  assert.deepEqual(filter(l, "zzz"), []);
});

test("stamp copies the map with the names set to now", () => {
  const before = { a: 1 };
  assert.deepEqual(stamp(before, ["b"], 7), { a: 1, b: 7 });
  assert.deepEqual(before, { a: 1 });
});

test("openSpaceFor finds a local space with a pane in the repo", () => {
  const panes = [{ tab: "t2", cwd: "/Volumes/sourcecode/arthur/core" }];
  const spaces = [{ id: "s1", tabs: [{ id: "t1" }] }, { id: "s2", tabs: [{ id: "t2" }] }];
  assert.equal(openSpaceFor("arthur", roots, panes, spaces), "s2");
  assert.equal(openSpaceFor("arthur", roots, panes, [spaces[0], { ...spaces[1], machine: "vps" }]), null);
  assert.equal(openSpaceFor("arthur", roots, [{ tab: "t2", cwd: "/Volumes/sourcecode/arthur-prisca" }], spaces), null);
});
