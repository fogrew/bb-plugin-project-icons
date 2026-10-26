import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
function checkEvent(t, pr) {
  const dir = mkdtempSync(join(tmpdir(), "project-icons-event-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const path = join(dir, "event.json");
  writeFileSync(path, JSON.stringify({ pull_request: pr }));
  return spawnSync(process.execPath, ["scripts/check-quality.mjs"], {
    cwd: root, encoding: "utf8",
    env: { ...process.env, GITHUB_EVENT_NAME: "pull_request", GITHUB_EVENT_PATH: path },
  });
}
test("PR checker rejects malformed event SHAs before invoking Git", (t) => {
  const result = checkEvent(t, { base: { sha: "--help" }, head: { sha: "invalid", ref: "ci/2-pr-quality-gates" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /invalid pull request base\/head SHA/);
});
test("PR checker rejects invalid branches even when Git history exists", (t) => {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const result = checkEvent(t, { base: { sha }, head: { sha, ref: "ci/missing-issue" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Invalid branch/);
});
test("PR checker refuses an empty range instead of silently skipping commits", (t) => {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const result = checkEvent(t, { base: { sha }, head: { sha, ref: "ci/2-pr-quality-gates" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /No PR commits found/);
});
