import { isDeepStrictEqual } from "node:util";

const issueBranch = /^(feature|fix|chore|ci|docs|test|refactor|hotfix)\/[1-9]\d*-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const releaseBranch = /^release\/(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const conventional = /^(feat|fix|docs|chore|ci|test|refactor|perf|build|style)(\([^()\r\n]+\))?!?: \S[^\r\n]*$/;
const generatedMerge = /^Merge (?:pull request #[1-9]\d* from \S+|(?:branch|remote-tracking branch) '[^'\r\n]+'(?: into \S+)?)$/;

export function validateBranch(branch) {
  if (!["main", "develop"].includes(branch) && !issueBranch.test(branch) && !releaseBranch.test(branch)) {
    throw new Error(`Invalid branch "${branch}": use type/<issue>-<lowercase-kebab-slug>, release/X.Y.Z, main or develop.`);
  }
}

export function validateCommit({ subject, parents, signed }) {
  if (parents > 1) {
    if (!signed) throw new Error("Merge commits must contain a GPG signature; create and verify a signed merge locally.");
    if (conventional.test(subject) || generatedMerge.test(subject)) return;
    throw new Error("Signed merge subject must be Conventional Commits or a standard Git/GitHub merge subject.");
  }
  if (!conventional.test(subject)) throw new Error(`Invalid commit subject "${subject}": expected type(scope): description (scope optional).`);
}

export function validateManifest(pkg, lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages?.[""]) throw new Error("Expected a version 3 package-lock.json with a root package.");
  const root = lock.packages[""];
  for (const key of ["name", "version"]) {
    if (!pkg[key] || pkg[key] !== lock[key] || pkg[key] !== root[key]) throw new Error(`Manifest/lockfile ${key} mismatch; regenerate with npm install --package-lock-only.`);
  }
  for (const key of ["dependencies", "devDependencies", "optionalDependencies", "engines"]) {
    if (!isDeepStrictEqual(pkg[key] ?? {}, root[key] ?? {})) throw new Error(`Manifest/lockfile ${key} mismatch; regenerate with npm install --package-lock-only.`);
  }
  if (!pkg.bb?.server || !pkg.bb?.app || !pkg.engines?.bb || !pkg.engines?.bbPluginSdk) {
    throw new Error("Project Icons must declare bb.server, bb.app and BB/SDK engine ranges.");
  }
}
