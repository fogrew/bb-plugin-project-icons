import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validateBranch, validateCommit, validateManifest } from "./quality-policy.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
try {
  validateManifest(JSON.parse(readFileSync("package.json", "utf8")), JSON.parse(readFileSync("package-lock.json", "utf8")));
  if (process.env.GITHUB_EVENT_NAME === "pull_request") {
    const { pull_request: pr } = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, "utf8"));
    if (!pr || ![pr.base.sha, pr.head.sha].every((sha) => /^[a-f0-9]{40}$/.test(sha))) {
      throw new Error("Missing or invalid pull request base/head SHA in the event payload.");
    }
    validateBranch(pr.head.ref);
    const commits = git("rev-list", "--reverse", `${pr.base.sha}..${pr.head.sha}`).split("\n").filter(Boolean);
    if (!commits.length) throw new Error("No PR commits found; checkout must include the full base and head history.");
    for (const sha of commits) {
      try {
        const raw = git("cat-file", "commit", sha);
        const header = raw.split("\n\n", 1)[0];
        validateCommit({
          subject: git("show", "-s", "--format=%s", sha),
          parents: git("show", "-s", "--format=%P", sha).split(" ").filter(Boolean).length,
          signed: /^gpgsig -----BEGIN PGP SIGNATURE-----$/m.test(header),
        });
      } catch (error) {
        throw new Error(`Commit ${sha}: ${error.message}`);
      }
    }
    console.log(`Branch and ${commits.length} PR commit(s) passed; synthetic GitHub test merges are excluded.`);
  } else if (process.env.GITHUB_EVENT_NAME) {
    throw new Error("This policy check expects a pull_request event.");
  } else {
    validateBranch(git("branch", "--show-current"));
    console.log("Local branch and manifest passed. PR commit-range checks run with the GitHub pull_request event.");
  }
} catch (error) {
  console.error(`Quality gate failed: ${error.message}`);
  process.exitCode = 1;
}
