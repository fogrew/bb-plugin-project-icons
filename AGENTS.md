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
  the diff and checks without rewriting signed history. Synchronize existing
  stacks via an additive GPG-signed merge from `develop` into their own
  unprotected branch, then retarget and rerun checks.
- Distinguish development readiness from integration/release readiness, which
  requires accepted dependencies, acceptance criteria and relevant checks.
  Ordinary autonomous merges follow the gates below. Report blockers to the
  parent coordinator; split scope growth into follow-up issues.
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
- Add signed follow-up commits for corrections; do not rebase, amend or
  force-push signed branch history. Do not enable auto-merge.
- Under ongoing backlog authorization, an agent may merge its own ordinary PR
  into `develop` when acceptance/dependencies are satisfied, its branch is up
  to date and all required checks are green. No per-PR owner approval is needed.
- Require independent reviews by risk: untrusted input, three; other code, one;
  docs/config, zero. Fix findings or file follow-ups; resolve blocking findings
  before acceptance. File out-of-scope discoveries instead of scope drift.
- Use `gh pr merge <PR> --squash --match-head-commit <validated-head-SHA>` only
  after all gates pass. Verified GitHub squash integration is permitted;
  source commits retain personal GPG signatures, while GitHub signs the squash
  with its own distinct GPG key. Immediately verify the result's GPG signature
  and verification status, recording immutable SHA and actual signer/fingerprint.
  If verification fails or is unavailable, stop further merges and report it.
  No unsigned fallback, signing-setting changes or source history rewrites.
  See CONTRIBUTING for authoritative sources and verification details.
- Never write directly to or merge locally into protected branches. The owner
  handles releases, tags, publishing, marketplace submission and repo settings.
  Release/hotfix integration and return PRs are outside ordinary autonomous
  merge authorization. See CONTRIBUTING for the full merge gates.

## Checks and completion

Use relevant documentation checks for docs-only work; application builds are
not required. For code changes, follow [README.md](README.md) and check machine
resources before build/browser runs. Distinguish local build/unit checks,
runtime/live evidence and untested environments. For application PRs run
`npm run check`; run `npm run build` before direct Playwright runs. Use these
actual npm scripts rather than the generic global pnpm examples.

Add notable changes to [CHANGELOG.md](CHANGELOG.md) under Unreleased in the same
PR. Version bumps belong to release tasks; follow the explicit 0.x policy in
CONTRIBUTING. Do not invent release dates or claim planned contracts are stable.

These rules do not install automated enforcement; CI is separate work in
[issue #2](https://github.com/fogrew/bb-plugin-project-icons/issues/2).
Keep issue status current, link issue/PR in Focus Board and pin key artifacts
using the available BB skills. Use `Closes #N` once acceptance can be met by the
PR, otherwise `Related #N`. Do not close the issue or mark Done before acceptance
and a policy-compliant merge. Return the CONTRIBUTING handoff template to the
parent coordinator.
