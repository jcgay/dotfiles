// node --test ~/.config/herdr-app/mods/status-jc/ports.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListeners, parseParents, parseCwds, spaceOf, health } from "./ports.js";

test("listeners dedupe IPv4/IPv6 and drop ephemeral ports", () => {
  const m = parseListeners("p10\nf5\nn*:8108\nf6\nn[::1]:8108\np11\nf3\nn127.0.0.1:52698\n");
  assert.deepEqual([...m.get(10)], [8108]);
  assert.equal(m.has(11), false);
});

test("a descendant of a space's shell belongs to it", () => {
  const parents = parseParents("  30    20\n  20    10\n  10     1\n");
  const shells = new Map([[10, "s1"]]);
  assert.equal(spaceOf(30, { parents, shells, cwds: new Map(), roots: [] }), "s1");
});

test("otherwise the deepest folder holding its cwd wins", () => {
  const cwds = parseCwds("p40\nfcwd\nn/src/arthur/.claude/worktrees/a/karadoc\n");
  const roots = [{ folder: "/src/arthur", space: "main" }, { folder: "/src/arthur/.claude/worktrees/a", space: "agent" }];
  assert.equal(spaceOf(40, { parents: new Map(), shells: new Map(), cwds, roots }), "agent");
  assert.equal(spaceOf(40, { parents: new Map(), shells: new Map(), cwds: new Map([[40, "/src/arthurx"]]), roots }), null);
});

test("health", () => {
  assert.equal(health("200", 0), "up");
  assert.equal(health("404", 0), "up");
  assert.equal(health("503", 0), "starting");
  assert.equal(health("000", 28), "starting");
  assert.equal(health("000", 52), "up");
});
