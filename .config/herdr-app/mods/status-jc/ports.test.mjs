// node --test ~/.config/herdr-app/mods/status-jc/ports.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseListeners, parseParents, parseCwds, spaceOf, health, stillMapped, healthPlan, REMAP_MS, RECHECK_MS } from "./ports.js";

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

test("stillMapped reuses ps and lsof while no listener is new, for a minute", () => {
  const mapped = { at: 1000, pids: new Set([1, 2]) };
  assert.equal(stillMapped(new Set([1]), mapped, 2000), true);
  assert.equal(stillMapped(new Set([1, 3]), mapped, 2000), false);
  assert.equal(stillMapped(new Set([1]), mapped, 1000 + REMAP_MS), false);
  assert.equal(stillMapped(new Set([1]), null, 2000), false);
});

test("healthPlan asks only the shown space, and an up port every 30 s", () => {
  const previous = new Map([["1:8080", { state: "up", at: 1000 }], ["2:3000", { state: "starting", at: 1000 }]]);
  const found = [{ pid: 1, port: 8080, space: "a" }, { pid: 2, port: 3000, space: "a" }, { pid: 3, port: 5000, space: "b" }];
  const plan = (now) => healthPlan(found, previous, "a", now).map((f) => [f.port, f.ask, f.state]);
  assert.deepEqual(plan(2000), [[8080, false, "up"], [3000, true, "starting"], [5000, false, "starting"]]);
  assert.deepEqual(plan(1000 + RECHECK_MS)[0], [8080, true, "up"]);
  // A new pid on the same port is asked again.
  assert.equal(healthPlan([{ pid: 9, port: 8080, space: "a" }], previous, "a", 2000)[0].ask, true);
});
