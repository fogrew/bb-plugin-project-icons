import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsState, filterProjects } from "./settings-state.ts";

const a = { id: "proj_aaaaaaaaaa", name: "Same", revision: null };
const b = { id: "proj_bbbbbbbbbb", name: "Same", revision: 1 };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup(overrides = {}) {
  const calls = [];
  const state = createSettingsState({
    list: async () => ({ projects: [a, b] }),
    save: async (input) => { calls.push(input); },
    remove: async (input) => { calls.push(input); },
    ...overrides,
  }, () => calls.push("changed"));
  return { state, calls };
}

test("search matches names and safe IDs, ignoring whitespace and case", () => {
  assert.deepEqual(filterProjects([a, b], " SAME "), [a, b]);
  assert.deepEqual(filterProjects([a, b], "BBBB"), [b]);
  assert.deepEqual(filterProjects([a, b], "missing"), []);
});

test("refresh retains selection through reorder, rename and revision changes", async () => {
  let rows = [a, b];
  const { state } = setup({ list: async () => ({ projects: rows }) });
  await state.refresh();
  state.select(b.id);
  rows = [{ ...b, name: "Renamed", revision: 2 }, a];
  await state.refresh();
  assert.equal(state.getSnapshot().selected, b.id);
  assert.equal(state.getSnapshot().projects[0].revision, 2);
  rows = [a];
  await state.refresh();
  assert.equal(state.getSnapshot().selected, a.id);
  rows = [];
  await state.refresh();
  assert.equal(state.getSnapshot().selected, "");
});

test("older successes and failures cannot replace the latest list or error", async () => {
  const first = deferred(), second = deferred(), third = deferred(), fourth = deferred();
  const requests = [first, second, third, fourth];
  const { state } = setup({ list: () => requests.shift().promise });
  const one = state.refresh(), two = state.refresh();
  second.resolve({ projects: [b] });
  await two;
  first.resolve({ projects: [a] });
  await one;
  assert.deepEqual(state.getSnapshot().projects, [b]);
  const three = state.refresh(), four = state.refresh();
  fourth.reject(new Error("latest failure"));
  await four;
  third.resolve({ projects: [a] });
  await three;
  assert.equal(state.getSnapshot().loadError, "Could not load projects. Try again.");
  assert.deepEqual(state.getSnapshot().projects, [b]);
});

test("a stale failure cannot hide a newer successful refresh", async () => {
  const first = deferred(), second = deferred();
  const requests = [first, second];
  const { state } = setup({ list: () => requests.shift().promise });
  const one = state.refresh(), two = state.refresh();
  second.resolve({ projects: [b] });
  await two;
  first.reject(new Error("stale failure"));
  await one;
  assert.equal(state.getSnapshot().loadError, "");
  assert.deepEqual(state.getSnapshot().projects, [b]);
});

test("failed refresh keeps existing selection and retry clears the error", async () => {
  let fail = false;
  const { state } = setup({ list: async () => {
    if (fail) throw new Error("private machine path");
    return { projects: [a, b] };
  } });
  await state.refresh();
  state.select(b.id);
  fail = true;
  await state.refresh();
  assert.equal(state.getSnapshot().selected, b.id);
  assert.ok(state.getSnapshot().loadError);
  fail = false;
  await state.refresh();
  assert.equal(state.getSnapshot().loadError, "");
  assert.equal(state.getSnapshot().loading, false);
});

test("upload captures its project before normalization and blocks duplicate operations", async () => {
  const image = deferred(), save = deferred();
  const { state, calls } = setup({ save: async (input) => {
    calls.push(input);
    await save.promise;
  } });
  await state.refresh();
  const upload = state.mutate("save", () => image.promise);
  state.select(b.id);
  await state.mutate("remove");
  image.resolve("png");
  await Promise.resolve();
  assert.deepEqual(calls, [{ projectId: a.id, base64: "png" }]);
  save.resolve();
  await upload;
  assert.equal(state.getSnapshot().selected, b.id);
  assert.equal(state.getSnapshot().notice, null);
  assert.equal(state.getSnapshot().operation, null);
  assert.ok(calls.includes("changed"));
});

test("mutation errors stay with the initiating selection, including away-and-back", async () => {
  const removal = deferred();
  const { state } = setup({ remove: () => removal.promise });
  await state.refresh();
  state.select(b.id);
  const pending = state.mutate("remove");
  state.select(a.id);
  state.select(b.id);
  removal.reject(new Error("private machine path"));
  await pending;
  assert.equal(state.getSnapshot().notice, null);
  assert.equal(state.getSnapshot().operation, null);
});

test("normalization failure never saves and a subsequent operation can succeed", async () => {
  const { state, calls } = setup();
  await state.refresh();
  await state.mutate("save", async () => { throw new Error("bad image"); });
  assert.equal(calls.length, 0);
  assert.equal(state.getSnapshot().notice?.kind, "error");
  await state.mutate("remove");
  assert.deepEqual(calls[0], { projectId: a.id });
  assert.equal(state.getSnapshot().notice?.text, "Icon removed.");
});

test("cancelled refresh cannot update a remounted settings view", async () => {
  const pending = deferred();
  const { state } = setup({ list: () => pending.promise });
  const refresh = state.refresh();
  state.cancel();
  pending.resolve({ projects: [a] });
  await refresh;
  assert.deepEqual(state.getSnapshot().projects, []);
});
