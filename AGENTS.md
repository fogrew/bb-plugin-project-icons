# Repository instructions for agents

Read [CONTRIBUTING.md](CONTRIBUTING.md) before changing files. It defines Git
Flow, Conventional Commits, changelog/version policy and the handoff template.

## Scope and coordination

- Read the assigned issue, dependencies and current Git status first.
- One issue, one focused BB session, one assigned managed worktree, one branch
  and one reviewable PR. Do not touch another session's branches or worktrees.
- Start ordinary independent work at current `origin/develop` and target `develop`.
  Follow CONTRIBUTING for release/hotfix bases and return PRs.
- The coordinator has ongoing authorization; no per-issue kickoff approval is
  required. Independent development may proceed in parallel isolated worktrees.
- Real code dependencies may use clearly disclosed stacked branches/PRs. Name
  the dependency issue/PR and actual base, inherited commits and validation
  limits. Retarget to `develop` only after the dependency merges, then revalidate
  the diff and checks without rewriting signed history.
- Distinguish development readiness from integration/release readiness, which
  requires accepted dependencies, acceptance criteria and relevant checks.
  Every merge still requires fresh explicit approval for that PR. Report
  blockers to the parent coordinator; split scope growth into follow-up issues.
- Respect available user instructions, including RTK, communication preferences,
  Git signing and code-comment rules. Do not invent missing include files.
- GitHub Issues carry requirements, acceptance criteria and dependencies;
  the GitHub Project and milestones carry priority, order and status.
  Do not maintain duplicate task indexes in the repository. Architecture and
  decision documents are appropriate when they explain design rather than
  replicate task statuses.

## Public content language

Across projects, all authored natural-language content published to the Internet
must be English, including public files, UI text, code comments, commit messages,
GitHub issue/PR text and release notes. Private conversation may stay Russian.
Unicode and emoji are allowed; preserve non-English test fixtures explicitly
necessary to test Unicode behavior. This is not an ASCII-only restriction.
Only explicit user instructions may authorize narrow exceptions for specified
content or audiences; record their scope without extending them to other content.

## Mandatory GPG signing and review

- Every commit on the user's behalf must be validly GPG-signed. Never bypass
  signing or fall back to unsigned commits.
- The user enters the signing-key password interactively. The initial prompt
  is expected; later commits may use the long-lived agent cache.
- If the password prompt times out or input does not arrive in time, stop the
  commit workflow. Report the blocker and wait for the user to explicitly ask
  to repeat; never retry automatically.
- After every commit, run `git verify-commit <sha>`. Stop before pushing if
  verification fails; provide the full SHA and signature evidence on handoff.
- Preserve signed history: no squash, rebase, amend, force-push or auto-merge.
  Add signed follow-up commits for corrections.
- Every merge requires a fresh explicit user command for that specific PR,
  including release/hotfix synchronization; merge commits must also be signed
  and verified. A request to implement or open a PR does not authorize merging.
- Do not tag, publish, submit to marketplace or change protection/default branch
  without explicit authorization for the action.

## Checks and completion

Use relevant documentation checks for docs-only work; application builds are
not required. For code changes, follow [README.md](README.md) and check machine
resources before build/browser runs. Distinguish local build/unit checks,
runtime/live evidence and untested environments.

Add notable changes to [CHANGELOG.md](CHANGELOG.md) under Unreleased in the same
PR. Version bumps belong to release tasks; follow the explicit 0.x policy in
CONTRIBUTING. Do not invent release dates or claim planned contracts are stable.

These rules do not install automated enforcement; CI is separate work in
[issue #2](https://github.com/fogrew/bb-plugin-project-icons/issues/2).
Keep issue status current, link issue/PR in Focus Board and pin key artifacts
using the available BB skills. Use Related issue references while acceptance
is pending. Do not close the issue or mark Done before acceptance and an
explicitly approved merge. Return the CONTRIBUTING handoff template to the
parent coordinator.
