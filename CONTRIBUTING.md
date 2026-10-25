# Contributing to Project Icons

Read [AGENTS.md](AGENTS.md), the issue, its dependencies and the current Git
state before starting. Track status in the [GitHub Project](https://github.com/users/fogrew/projects/8).
Use one focused BB session, one assigned worktree, one issue branch and one
reviewable PR. The coordinator has ongoing authorization to organize development;
no separate per-issue kickoff approval is required. Split expanding scope into
follow-up issues.

## Public content language

Across projects, all authored natural-language content published to the Internet
must be English. This includes public repository files, UI text, code comments,
commit messages, GitHub issues/PRs and release notes. Private conversation may
remain Russian. This is a publishing-language rule, not an ASCII-only rule:
Unicode and emoji are allowed, as are non-English test fixtures explicitly
needed to test Unicode behavior. Do not translate such fixtures merely to enforce
English prose. A user may explicitly authorize a narrow exception for specified
content or a particular audience; record its scope and do not generalize it to
other public content.

## Git Flow

| Branch | Start from | PR base and return path |
| --- | --- | --- |
| `main` | Released history | Receives approved release and hotfix PRs |
| `develop` | Integration history | Accepted work and return PRs |
| `feature/<issue>-<slug>` | Latest `origin/develop` | `develop` |
| `fix/<issue>-<slug>` | Latest `origin/develop` | `develop` |
| `chore/<issue>-<slug>` | Latest `origin/develop` | `develop` |
| `ci/<issue>-<slug>` | Latest `origin/develop` | `develop` |
| `docs/<issue>-<slug>` | Latest `origin/develop` | `develop` |
| `test/<issue>-<slug>` | Latest `origin/develop` | `develop` |
| `refactor/<issue>-<slug>` | Latest `origin/develop` | `develop` |
| `release/<version>` | `origin/develop` | `main`, then return PR |
| `hotfix/<issue>-<slug>` | `origin/main` | `main`, then return PR |

After release or hotfix integration into `main`, synchronize the release
changes or hotfix back into `develop` through a separate return PR.

Use a numeric issue and lowercase kebab-case slug, for example
`chore/1-workflow-conventions`; release versions omit the tag's `v` prefix,
for example `release/0.2.0`. Work only in your assigned managed worktree.
Fetch before branching; do not switch, reset or clean another session's worktree.
Do not work directly on `main` or `develop`.

### Parallel development and stacked PRs

Development readiness is separate from integration/release readiness. Independent
work may proceed in parallel isolated worktrees before other issues are merged.
Ordinary independent branches start from current `origin/develop` and target
`develop` as shown above.

For a real code dependency, a stacked branch/PR may start from and target the
dependency's branch. Clearly disclose the dependency issue/PR, actual branch
base, inherited commits and validation limits in the PR and handoff. A stacked
PR is a documented exception to the ordinary `develop` base, not permission to
merge out of dependency order. Retarget it to `develop` only after its dependency
has merged, then revalidate its diff and relevant checks against the new base.
Synchronize existing stacks with an additive GPG-signed merge from `develop`
into their own unprotected branch, retarget and rerun relevant checks. Do not
rebase, amend or force-push signed branch history. Integration/release readiness
requires accepted dependencies, acceptance criteria and relevant checks.

### Autonomous ordinary PR merges

Under the user's ongoing backlog authorization, an agent may merge its own
ordinary PR into `develop` without per-PR owner approval only when:

- Acceptance criteria and dependencies are satisfied, the branch is up to date
  with its actual base, and every required check is green.
- Risk-appropriate independent review is complete: three independent reviews
  for untrusted-input changes, one for other code, none required for docs/config.
  Fix findings or file follow-up issues; blocking findings must be resolved
  before acceptance. File out-of-scope discoveries rather than expanding the PR.
- The merge method satisfies the mandatory valid GPG-signature requirement for
  every resulting commit as well as the global workflow constraints below.

Use `gh pr merge <PR> --squash --match-head-commit <validated-head-SHA>` after
all gates pass. This repository explicitly permits verified GitHub squash
integration: source commits require the user's personal GPG signatures; GitHub
signs the final squash commit with its own distinct GPG key, not the user's key.
This narrows the global signing file's blanket warning; rebase is not permitted.
See GitHub's [signed-commit merge rules](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-signed-commits)
and [signature verification documentation](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification).

Immediately retrieve the resulting commit's verification and signature; require
valid GPG verification and record its immutable SHA and actual signer/fingerprint.
Verify the signature against GitHub's published signing key, not merely a PR
success message. If verification fails or cannot be established, stop further
merges and report the concrete failure. Never fall back to unsigned commits,
local merges into protected branches or direct protected-branch pushes.
Do not change signing settings. Squash integration does not permit rewriting
source branch history.

Do not enable auto-merge. Releases, tags, publishing, marketplace submission and
repository settings are handled by the owner. Release/hotfix integration and
return PRs are outside ordinary autonomous merge authorization.

## Commits and signatures

Follow [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/):
`type(scope): description`, with optional scope and explanatory body.
Use `feat`, `fix`, `docs`, `chore`, `ci`, `test`, `refactor`,
`perf`, `build` or `style` as appropriate. Branch prefixes and commit types
serve different purposes: a chore branch can contain a docs commit.
For breaking changes, use `!` and a `BREAKING CHANGE:` footer describing
the impact and migration. Example: `feat(storage)!: version icon records`.

Every commit made on the user's behalf must have a valid GPG signature.
Never disable signing, suppress it with commit flags, or use an unsigned fallback.
The user enters the signing-key password interactively; the initial prompt is
expected. Later commits can use the long-lived signing-agent cache.
If the prompt times out or the user does not enter the password in time, stop
the commit workflow, report the blocker to the coordinator/user and wait for
an explicit request to repeat. Never retry automatically.

After reviewing the staged diff and running relevant checks:

```sh
git commit -S -m "docs(workflow): document contribution conventions"
git verify-commit HEAD
```

If signature verification fails, stop before pushing and report the failure.
Record the full SHA and successful verification in the handoff.

## Changelog and version policy

Maintain [CHANGELOG.md](CHANGELOG.md) using
[Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/).
Add a concise user-impact entry under `Unreleased` in the same PR as a notable
change. Use the applicable `Added`, `Changed`, `Deprecated`, `Removed`,
`Fixed` and `Security` headings; omit empty headings. Include migration
instructions for incompatible changes. Do not paste the commit log.

Use [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html) with this
explicit project policy during initial development:

- Before 1.0, feature batches advance MINOR (`0.1.0` to `0.2.0`).
  Backward-compatible corrections advance PATCH (`0.2.0` to `0.2.1`).
- Breaking 0.x changes advance MINOR, reset PATCH and require migration notes.
  Initial development permits API changes; it does not excuse silent data loss.
- At 1.0, explicitly declare stable user behavior, RPC/CLI interfaces, stored
  icon data and import/export formats. These are contract categories to audit,
  not a claim that every interface or export feature already exists.
- From 1.0 onward, incompatible changes to stable contracts advance MAJOR,
  compatible functionality advances MINOR and compatible fixes advance PATCH.

Roadmap versions are provisional. Reassess them when compatibility changes.
Change versions in the release task, keeping `package.json`,
`package-lock.json`, the changelog version/date and eventual immutable
`vX.Y.Z` tag consistent. The owner creates and verifies GPG-signed release tags.
Date entries accurately when preparing the release; never infer a release date
from the package version alone.
The current `0.1.0` package version has no tagged release at this workflow's
introduction, so no historical release date is asserted.

## Verification and PRs

These are contributor rules. Automated PR enforcement is tracked separately in
[issue #2](https://github.com/fogrew/bb-plugin-project-icons/issues/2).
This documentation does not configure CI, required checks, hooks or protection.

For documentation-only changes, check Markdown structure, links, the diff,
branch/tag facts where relevant and commit signatures. An application build is
not required. For application changes, follow the development commands in
[README.md](README.md); run `npm run check` before opening an application PR.
It typechecks, builds and runs backend tests. Run `npm run build` before a
direct Playwright run; tests alone also require built output. These are this
repository's npm commands, not the generic global pnpm examples.
Before build/browser runs, check available machine resources
and applicable BB instructions. Report local checks, runtime/live evidence and
untested platforms separately; a build is not live validation.

Target the base in the branch table or disclose the actual stacked dependency
base as described above. Use a Conventional Commit style PR title.
Describe the problem, final behavior, changed files, changelog impact, relevant
checks and limitations. Use `Closes #N` once acceptance can be met by the PR;
use `Related #N` while it cannot. A closing reference is not evidence of acceptance.
Keep the issue In Progress through review. Do not close it or mark Done until
acceptance criteria pass and a policy-compliant merge is complete.

## Session handoff

Return this filled-in template to the coordinator (or user when working alone):

```text
Issue and project status:
Branch and absolute worktree:
Commit SHA(s), GPG fingerprint and git verify-commit evidence:
PR URL and base:
Changed files and changelog impact:
Checks run, commands and results:
Runtime/live evidence and untested environments:
Limitations, blockers and follow-up issues:
Next development-ready issue and separate integration/release dependencies:
```

Report blockers promptly. Keep one owner per issue and use separate worktrees
for concurrent sessions. Do not edit another session's planning artifacts
without agreement. A PR awaiting review is a handoff, not a completed merge.
