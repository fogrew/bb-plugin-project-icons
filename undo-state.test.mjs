import test from "node:test";
import assert from "node:assert/strict";
import { createSettingsState } from "./settings-state.ts";
import { createDraft } from "./lib/image-draft.ts";

const a = { id: "proj_aaaaaaaaaa", name: "A", revision: 1 };
const b = { id: "proj_bbbbbbbbbb", name: "B", revision: null };
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

for (const failure of ["save", "prepare"]) {
  for (const staleOutcome of ["success", "failure"]) {
    test(`${failure} failure settles an invalidated refresh before its late ${staleOutcome}`, async t => {
      const pending = deferred();
      let reads = 0, saves = 0, failSave = true;
      const { state } = await setup(t, {
        list: () => ++reads === 2 ? pending.promise : Promise.resolve({ projects: [a, b] }),
        save: async () => { saves++; if (failSave) throw new Error("save failed"); },
      });
      const draft = createDraft(a.id, () => state.getSnapshot().selected);
      const image = { close() {} };
      await draft.load(async () => image);
      t.after(draft.cancel);
      const refreshing = state.refresh();
      assert.equal(state.getSnapshot().refreshing, true);
      await state.mutate("save", async () => {
        if (failure === "prepare") throw new Error("encode failed");
        return "png";
      }, a.id);
      const failed = state.getSnapshot();
      assert.equal(failed.refreshing, false);
      assert.equal(failed.operation, null);
      assert.equal(failed.selected, a.id);
      assert.equal(failed.notice.kind, "error");
      assert.equal(draft.current(), image);
      assert.equal(saves, failure === "save" ? 1 : 0);
      if (staleOutcome === "success") pending.resolve({ projects: [b] });
      else pending.reject(new Error("stale list error"));
      await refreshing;
      assert.deepEqual(state.getSnapshot(), failed);
      failSave = false;
      await state.mutate("save", async () => { assert.equal(draft.current(), image); return "retry png"; }, a.id);
      assert.equal(saves, failure === "save" ? 2 : 1);
      assert.equal(state.getSnapshot().notice.text, "Icon saved.");
    });
  }
}

test("save failure leaves a newer refresh running until that request settles", async t => {
  const saved = deferred(), listed = deferred();
  let reads = 0;
  const { state } = await setup(t, {
    list: () => ++reads === 1 ? Promise.resolve({ projects: [a, b] }) : listed.promise,
    save: () => saved.promise,
  });
  const saving = state.mutate("save", async () => "png", a.id);
  await Promise.resolve();
  const refreshing = state.refresh();
  saved.reject(new Error("save failed"));
  await saving;
  assert.equal(state.getSnapshot().refreshing, true);
  listed.resolve({ projects: [{ ...a, revision: 42 }, b] });
  await refreshing;
  assert.equal(state.getSnapshot().refreshing, false);
  assert.equal(state.getSnapshot().projects[0].revision, 42);
  assert.equal(state.getSnapshot().notice.kind, "error");
});
async function setup(t, overrides = {}) {
  let rows = [a, b];
  const calls = [];
  const offer = { token: "deletion-token", expiresAt: Date.now() + 15000 };
  const state = createSettingsState({
    list: async () => ({ projects: rows }),
    save: async input => { calls.push(input); rows = [{ ...a, revision: 3 }, b]; },
    remove: async input => { calls.push(input); rows = [{ ...a, revision: null }, b]; return { removed: true, undo: offer }; },
    restore: async input => { calls.push(input); rows = [{ ...a, revision: 2 }, b]; return { status: "restored", revision: 2 }; },
    ...overrides,
  }, () => calls.push("changed"));
  t.after(state.cancel);
  await state.refresh();
  return { state, offer, calls, setRows: value => { rows = value; } };
}

test("Undo restores the fixed removal owner and consumes the offer", async t => {
  const { state, calls, offer } = await setup(t);
  await state.mutate("remove");
  assert.equal(state.getSnapshot().undo.token, offer.token);
  await state.undo();
  assert.deepEqual(calls.filter(c => c !== "changed"), [{ projectId: a.id }, { projectId: a.id, token: offer.token }]);
  assert.equal(state.getSnapshot().undo, null);
  assert.equal(state.getSnapshot().notice.text, "Icon restored.");
  await state.undo();
  assert.equal(calls.length, 4);
});

test("expiry clears the offer with feedback and no server call", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  const { state, calls } = await setup(t);
  await state.mutate("remove");
  t.mock.timers.tick(15000);
  assert.equal(state.getSnapshot().undo, null);
  assert.match(state.getSnapshot().notice.text, /expired/i);
  await state.undo();
  assert.equal(calls.length, 2);
});

test("selection away-and-back hides late removal offers", async t => {
  const result = deferred();
  const { state, offer } = await setup(t, { remove: () => result.promise });
  const removal = state.mutate("remove");
  state.select(b.id); state.select(a.id);
  result.resolve({ removed: true, undo: offer });
  await removal;
  assert.equal(state.getSnapshot().undo, null);
  assert.equal(state.getSnapshot().notice, null);
});

test("realtime newer revision clears Undo without changing newer data", async t => {
  const s = await setup(t); await s.state.mutate("remove");
  s.setRows([{ ...a, revision: 99 }, b]);
  await s.state.refresh();
  assert.equal(s.state.getSnapshot().undo, null);
  assert.equal(s.state.getSnapshot().projects[0].revision, 99);
  assert.match(s.state.getSnapshot().notice.text, /changed/i);
});

for (const status of ["expired", "conflict", "error"]) {
  test(`server ${status} is accessible feedback and cannot reuse an offer`, async t => {
    const s = await setup(t, { restore: async () => { if (status === "error") throw new Error("offline"); return { status }; } });
    await s.state.mutate("remove"); await s.state.undo();
    assert.equal(s.state.getSnapshot().undo, null);
    assert.equal(s.state.getSnapshot().notice.kind, "error");
    assert.match(s.state.getSnapshot().notice.text, status === "expired" ? /expired/i : status === "conflict" ? /changed/i : /could not/i);
  });
}

test("cancel suppresses late mutation feedback, refresh and timers", async t => {
  const result = deferred(); let reads = 0;
  const s = await setup(t, { list: async () => { reads++; return { projects: [a,b] }; }, remove: () => result.promise });
  const removal = s.state.mutate("remove");
  s.state.cancel();
  result.resolve({ removed: true, undo: s.offer });
  await removal;
  assert.equal(s.state.getSnapshot().undo, null);
  assert.equal(s.state.getSnapshot().notice, null);
  assert.equal(reads, 1);
  assert.deepEqual(s.calls, []);
});

for (const reject of [false, true]) {
  test(`late restore ${reject ? "failure" : "success"} never follows a project switch`, async t => {
    const result = deferred();
    const s = await setup(t, { restore: () => result.promise });
    await s.state.mutate("remove");
    const restoration = s.state.undo();
    assert.equal(s.state.getSnapshot().operation.projectId, a.id);
    s.state.select(b.id); s.state.select(a.id);
    if (reject) result.reject(new Error("offline")); else result.resolve({ status: "restored" });
    await restoration;
    assert.equal(s.state.getSnapshot().notice, null);
    assert.equal(s.state.getSnapshot().undo, null);
    assert.equal(s.state.getSnapshot().operation, null);
  });
}

test("a newer save clears Undo and duplicate restore clicks stay bounded", async t => {
  const result = deferred(); let restores = 0;
  const s = await setup(t, { restore: async () => { restores++; return result.promise; } });
  await s.state.mutate("remove");
  const restoration = s.state.undo();
  await s.state.undo(); await s.state.mutate("remove");
  assert.equal(restores, 1);
  result.resolve({ status: "restored" }); await restoration;
  await s.state.mutate("remove");
  await s.state.mutate("save", async () => "png", a.id);
  assert.equal(s.state.getSnapshot().undo, null);
  await s.state.undo();
  assert.equal(restores, 1);
});

test("cancelled image preparation cannot submit a new server mutation", async t => {
  const image = deferred();
  const s = await setup(t);
  const saving = s.state.mutate("save", () => image.promise, a.id);
  s.state.cancel(); image.resolve("png"); await saving;
  assert.deepEqual(s.calls, []);
});

test("failed removal has no Undo offer and refreshes authoritative state", async t => {
  let reads = 0;
  const s = await setup(t, { list: async () => { reads++; return { projects: [a,b] }; }, remove: async () => { throw new Error("disk full"); } });
  await s.state.mutate("remove");
  assert.equal(reads, 2);
  assert.equal(s.state.getSnapshot().undo, null);
  assert.match(s.state.getSnapshot().notice.text, /could not remove/i);
});

test("late removal response cannot extend its original server deadline", async t => {
  t.mock.timers.enable({ apis: ["Date", "setTimeout"], now: 1000 });
  const result = deferred();
  const s = await setup(t, { remove: () => result.promise, list: async () => ({ projects: [{ ...a, revision: null }, b] }) });
  const removal = s.state.mutate("remove");
  t.mock.timers.tick(16000);
  result.resolve({ removed: true, undo: s.offer }); await removal;
  await s.state.undo();
  assert.equal(s.state.getSnapshot().undo, null);
  assert.match(s.state.getSnapshot().notice.text, /expired/i);
});
