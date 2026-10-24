import test from "node:test";
import assert from "node:assert/strict";
import { validateBranch, validateCommit, validateManifest } from "./quality-policy.mjs";

test("accepts work, release and integration branches", () => {
  for (const branch of ["ci/2-pr-quality-gates", "feature/12-image-editor", "hotfix/9-storage", "release/0.2.0", "main", "develop"]) {
    assert.doesNotThrow(() => validateBranch(branch));
  }
});
test("rejects missing issue, malformed slug and release versions", () => {
  for (const branch of ["ci/quality", "ci/02-check", "feat/2-check", "fix/2-Bad", "fix/2-bad--slug", "fix/2-bad\n", "release/v0.2.0", "release/00.2.0"]) {
    assert.throws(() => validateBranch(branch), /Invalid branch/);
  }
});
test("accepts conventional subjects with scopes, breaking marker and Unicode", () => {
  for (const subject of ["ci: add quality gates", "feat(editor)!: support café images", "fix: preserve 猫.png"]) {
    assert.doesNotThrow(() => validateCommit({ subject, parents: 1, signed: true }));
  }
});
test("rejects malformed conventional subjects and fake merge subjects", () => {
  for (const subject of ["update", "Feat: add", "fix:no space", "fix: ", "Merge branch 'develop'"]) {
    assert.throws(() => validateCommit({ subject, parents: 1, signed: true }), /Invalid commit subject/);
  }
});
test("allows standard signed merges and conventional signed merges", () => {
  for (const subject of ["Merge branch 'develop' into ci/2-pr-quality-gates", "Merge pull request #20 from fogrew/chore/1-workflow-conventions", "chore: integrate develop"]) {
    assert.doesNotThrow(() => validateCommit({ subject, parents: 2, signed: true }));
    assert.throws(() => validateCommit({ subject, parents: 2, signed: false }), /GPG signature/);
  }
  assert.throws(() => validateCommit({ subject: "merge whatever", parents: 2, signed: true }), /Signed merge subject/);
});
const pkg = {
  name: "fixture", version: "0.1.0", dependencies: { zod: "^4.6.5" },
  devDependencies: { typescript: "^5.7.0" },
  engines: { bb: ">=0.46", bbPluginSdk: ">=0.6.49" },
  bb: { server: "./server.ts", app: "./app.tsx" },
};
const lock = () => ({ name: pkg.name, version: pkg.version, lockfileVersion: 3, packages: { "": structuredClone(pkg) } });
test("accepts consistent manifests regardless of object key order", () => {
  assert.doesNotThrow(() => validateManifest(pkg, lock()));
});
test("rejects root and top-level version drift, dependency drift and missing manifest fields", () => {
  for (const mutate of [
    (value) => { value.version = "0.2.0"; },
    (value) => { value.packages[""].version = "0.2.0"; },
    (value) => { value.packages[""].devDependencies.typescript = "*"; },
    (value) => { value.packages[""].engines.bb = "*"; },
    (value) => { value.lockfileVersion = 2; },
  ]) {
    const value = lock();
    mutate(value);
    assert.throws(() => validateManifest(pkg, value), /mismatch|version 3/);
  }
  assert.throws(() => validateManifest({ ...pkg, bb: {} }, lock()), /must declare/);
});
