# Pull request quality gates

Related #2. Workflow conventions in pending #1 / PR #20 are an integration
dependency. This file documents CI without taking ownership of those documents.

## Trigger and check name

CI runs for every pull request targeting `develop`, `main`, or `release/**`,
including draft PRs. There are no path filters. It uses Node 24 on
`ubuntu-latest`, a read-only token, pinned action revisions, no saved checkout
credentials and a 15-minute timeout. It neither publishes nor merges.

The proposed required status check is **PR quality gates** (workflow **CI**).
Confirm its exact displayed name and a successful run before configuring branch
protection separately. This PR does not change branch protection.

The job checks branch/commit conventions and manifest consistency, runs
`npm ci`, then `npm run check` (policy, typecheck, build, backend and validator
tests). Finally it checks that installation did not change either package file.
The default checkout builds GitHub's proposed merge result; commit conventions
use the event's actual base/head SHAs, excluding the synthetic test merge.

## Branches and commit subjects

Work branches use
`feature|fix|chore|ci|docs|test|refactor|hotfix/<issue>-<lowercase-kebab-slug>`.
Issue numbers are positive without leading zeros. Release branches use
`release/X.Y.Z` without a `v` prefix. `main` and `develop` are allowed as
integration/return PR heads.

Non-merge commits must have a Conventional Commits subject:
`type(scope): description`, with optional scope and `!`.
Supported types are `feat`, `fix`, `docs`, `chore`, `ci`, `test`,
`refactor`, `perf`, `build` and `style`. Unicode descriptions are supported.
This is a subject check, not a complete body/footer parser; breaking changes
still require the migration footer from the contribution policy.

Every PR commit must contain an OpenPGP signature header. Real merge commits
must also have either a conventional subject or a standard Git/GitHub subject such as
`Merge branch 'develop' into ci/2-pr-quality-gates` or
`Merge pull request #20 from fogrew/chore/1-workflow-conventions`.
A one-parent commit cannot use the merge exemption.

For both ordinary and merge commits, CI checks signature-envelope presence only: it has no trusted public-key
keyring and does not certify signer identity or cryptographic validity.
Every real commit and merge still requires local GPG signing and successful
`git verify-commit <sha>` before pushing. Preserve signed history; use additive
commits, no amend/rebase/squash/force-push. Merge approval remains a separate gate.

## Reproducible standalone build

The SDK `@get-bb/plugin-sdk@0.6.49` supplies runtime/types/testing exports, not a
build executable. The official standalone build package is
[`bb-app`](https://github.com/get-bb/bb/tree/main/packages/bb-app), pinned here to
`0.46.1` to match the host baseline. Do not install the unrelated npm package
named `bb`.

`scripts/build.mjs` resolves the installed package's CLI directly and removes
`BB_CLI`, which can otherwise redirect to a desktop installation. It needs no
running BB server. The script verifies the exact local toolchain versions used
by the published package: esbuild `0.28.1`, and Tailwind node/oxide/css `4.3.0`.
These match the official
[toolchain resolver](https://github.com/get-bb/bb/blob/5e1acd765039e874643f34c4d35409e58484e408/packages/plugin-build/src/toolchain.ts).
It prefers matching local packages; pinning them avoids its cold-cache download
through bundled npm and also locks the toolchain's transitive dependencies.
Missing or mismatched pins fail before launching the CLI.

The build package is development tooling only. Its published tarball contains
2,539 files and is about 92.7 MB unpacked, plus its dependencies and the pinned
toolchain. It includes native modules; normal `npm ci` may compile those if no
prebuilt binary is supplied. GitHub's Ubuntu image has build tools. On Windows,
a missing VC++ toolset can prevent a normal install even on Node 24. An
`--ignore-scripts` local check is separate evidence and does not replace the
normal Actions install.

## Audit limits

At implementation time, `npm audit` reports 10 vulnerable dependency entries:
1 critical, 8 high and 1 moderate. All reported paths are additions under
`bb-app` or its bundled `npm`; this is not a clean dependency audit.
The critical entry is `npm/node_modules/tar`. BB's fallback toolchain download
uses bundled npm, so it would expose archive parsing on a cold build.
The pinned local toolchain avoids that build-time download path; it does **not** patch tar
or erase the advisory. Do not use this build dependency to install untrusted
packages or start an application/server from CI. The job isolates BB data under
the runner's temporary directory.

Installation has a conditional residual path: npm hoists the bundled npm CLI
into the local bin directory, and esbuild's install script can invoke npm to
fetch a platform package if its optional native binary is missing. Normal
platform-binary installation avoids that fallback, but the toolchain pins do
not eliminate it. Do not describe tar as unreachable throughout installation.

Other reported entries are `bb-app`, `npm`, `brace-expansion`,
`http-cache-semantics`, `ip-address`, `pacote`, `postcss-selector-parser`,
`undici`, and the package's nested `zod@4.6.5`. npm-related paths remain bundled
even when that CLI is not invoked; Zod remains part of the build CLI's manifest
processing. Building PR code is inherently untrusted execution: keep this job
on disposable hosted runners with no secrets or write permissions.
A supported upstream build-package update and renewed audit are integration
follow-up work, not an automatic forced upgrade here.

## Local checks

Run `npm ci` followed by `npm run check`. `npm test` needs an existing build.
Local `npm run check:quality` validates the current branch and manifest.
The full PR range requires the GitHub `pull_request` event payload and complete
Git history. Invalid input or missing history fails with a diagnostic.

Build/backend tests verify the bundle and SDK fake-host behavior. They do not
verify live sidebar rendering, upload interaction, host authentication or
multi-plugin compatibility.
