# Contributing to Project Icons

Read [AGENTS.md](AGENTS.md), the issue, its dependencies and the current Git
state before starting. Track status in the [GitHub Project](https://github.com/users/fogrew/projects/8).
Use one focused BB session, one assigned worktree, one issue branch and one
reviewable PR. Start only after dependencies are accepted, unless the user
explicitly authorizes an exception. Split expanding scope into follow-up issues.

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

Each merge, including synchronization PRs, requires a fresh explicit user
command naming that particular PR. Preserve signed commits, use signed merge
commits and verify their signatures. Do not squash, rebase, amend or otherwise
rewrite signed commits; add a signed follow-up commit instead. Never enable
auto-merge or force-push. Opening a PR is not merge authorization. Release work
does not authorize tags, publishing, marketplace submission, or changes to
branch protection/default branch; obtain explicit authorization for those actions.

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
`vX.Y.Z` tag consistent. Create and verify a GPG-signed release tag only after
explicit release authorization. Date entries accurately when preparing the
release; never infer a release date from the package version alone.
The current `0.1.0` package version has no tagged release at this workflow's
introduction, so no historical release date is asserted.

## Verification and PRs

These are contributor rules. Automated PR enforcement is tracked separately in
[issue #2](https://github.com/fogrew/bb-plugin-project-icons/issues/2).
This documentation does not configure CI, required checks, hooks or protection.

For documentation-only changes, check Markdown structure, links, the diff,
branch/tag facts where relevant and commit signatures. An application build is
not required. For application changes, follow the development commands in
[README.md](README.md); `npm run check` currently typechecks, builds and runs
backend tests. Before build/browser runs, check available machine resources
and applicable BB instructions. Report local checks, runtime/live evidence and
untested platforms separately; a build is not live validation.

Target the base in the branch table. Use a Conventional Commit style PR title.
Describe the problem, final behavior, changed files, changelog impact, relevant
checks and limitations. Reference `Related #<issue>` while acceptance is pending;
do not use automatic closing keywords before acceptance.
Keep the issue In Progress through review. Do not close it or mark Done until
acceptance criteria pass and the specifically authorized merge is complete.

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
Next unblocked issue (after acceptance; do not start it implicitly):
```

Report blockers promptly. Keep one owner per issue and use separate worktrees
for concurrent sessions. Do not edit another session's planning artifacts
without agreement. A PR awaiting review is a handoff, not a completed merge.
