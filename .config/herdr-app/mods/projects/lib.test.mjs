import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRepos, parseCommits, parseIcons, repoOfFolder, stamp, markOpened, order, filter, spaceRepo, openSpaceFor } from "./lib.js";

const roots = ["/Users/jc/dev", "/Volumes/sourcecode"];

test("parseRepos keeps repo names, sorted, without agents-worktree", () => {
  assert.deepEqual(parseRepos("/Users/jc/dev/b/.git\n/Users/jc/dev/a/.git\n/Users/jc/dev/agents-worktree/.git\n"), ["a", "b"]);
});

test("parseCommits turns seconds into ms and skips lines without a date", () => {
  assert.deepEqual(parseCommits("arthur 1700000000\nempty \n"), { arthur: 1700000000000 });
  assert.deepEqual(parseCommits("my repo 1700000000\n"), { "my repo": 1700000000000 });
});

test("parseIcons maps each repo to its copied icons, light for dark when there is no dark one", () => {
  assert.deepEqual(parseIcons("arthur\tarthur.svg\tarthur.dark.svg\nmy repo\tmy repo.png\t\n\n", "mods/projects/.icons"), {
    arthur: { light: "mods/projects/.icons/arthur.svg", dark: "mods/projects/.icons/arthur.dark.svg" },
    "my repo": { light: "mods/projects/.icons/my repo.png", dark: "mods/projects/.icons/my repo.png" },
  });
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
  assert.deepEqual(order(["b", "QA_x", "a"], {}, {}), ["a", "b", "QA_x"]);
});

test("filter is case-insensitive, prefix matches first", () => {
  const l = ["xarthur", "arthur", "blaise"];
  assert.deepEqual(filter(l, "ART"), ["arthur", "xarthur"]);
  assert.deepEqual(filter(l, ""), l);
  assert.deepEqual(filter(l, "zzz"), []);
  assert.deepEqual(filter(["arthur-jobs", "arthur"], "Arthur"), ["arthur", "arthur-jobs"]);
});

test("stamp copies the map with the names set to now", () => {
  const before = { a: 1 };
  assert.deepEqual(stamp(before, ["b"], 7), { a: 1, b: 7 });
  assert.deepEqual(before, { a: 1 });
});

test("markOpened stamps only the repos open now and not open last time", () => {
  const before = { a: 1, b: 2 };
  assert.deepEqual(markOpened(before, ["a"], ["a", "b", "c"], 9), { a: 1, b: 9, c: 9 });
  assert.deepEqual(before, { a: 1, b: 2 });
  assert.deepEqual(markOpened({ a: 1 }, ["a"], ["a"], 9), { a: 1 });
});

test("spaceRepo is the repo of the space's first terminal", () => {
  const names = new Set(["arthur", "blaise"]);
  const space = { id: "s", tabs: [{ id: "t1" }, { id: "t2" }] };
  const panes = [{ tab: "t2", cwd: "/Volumes/sourcecode/blaise" }, { tab: "t1", cwd: "/Users/jc/dev/arthur/core" }, { tab: "t1", cwd: "/Volumes/sourcecode/blaise" }];
  assert.equal(spaceRepo(space, panes, roots, names), "arthur");
  assert.equal(spaceRepo(space, [{ tab: "t1", cwd: "/Users/jc" }], roots, names), null);
});

test("openSpaceFor finds a local space with a pane in the repo", () => {
  const panes = [{ tab: "t2", cwd: "/Volumes/sourcecode/arthur/core" }];
  const spaces = [{ id: "s1", tabs: [{ id: "t1" }] }, { id: "s2", tabs: [{ id: "t2" }] }];
  assert.equal(openSpaceFor("arthur", roots, panes, spaces), "s2");
  assert.equal(openSpaceFor("arthur", roots, panes, [spaces[0], { ...spaces[1], machine: "vps" }]), null);
  assert.equal(openSpaceFor("arthur", roots, [{ tab: "t2", cwd: "/Volumes/sourcecode/arthur-prisca" }], spaces), null);
  // A second pane cd'd into another repo does not make the space that repo's.
  assert.equal(openSpaceFor("blaise", roots, [...panes, { tab: "t2", cwd: "/Volumes/sourcecode/blaise" }], spaces), null);
});
