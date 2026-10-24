# Project Icons development plan

Coordination: [GitHub Project](https://github.com/users/fogrew/projects/8).
GitHub issues and their project fields are the live source for status and dependencies.
This document is a planning snapshot, not a record of completed features.

## Product direction

Make projects recognizable at a glance and let users edit icons in context.
Preserve current uploaded PNG icons and native BB sidebar behavior.
Prefer supported BB SDK integration points; check actual SDK capabilities before
committing to contextual menus, remote file discovery or Project Colors integration.

## Workflow

- One issue per focused BB session, one branch/worktree, one reviewable PR.
- Read repository instructions, the issue, dependencies and current Git state first.
- Use separate worktrees for concurrently running sessions. Start only when dependencies are accepted.
- Git Flow: main holds released code; develop integrates accepted work.
- Branches use lowercase kebab-case with an issue number:
  feature/<issue>-<slug>, fix/<issue>-<slug>, chore/<issue>-<slug>,
  ci/<issue>-<slug>, docs/<issue>-<slug>, test/<issue>-<slug>,
  refactor/<issue>-<slug>. These start at develop and target develop.
- release/<version> starts at develop and targets main. After release, merge the
  release changes back into develop. hotfix/<issue>-<slug> starts at main and
  returns to both main and develop.
- Conventional Commits: type(scope): description. Mark incompatible changes with
  ! and describe them in a BREAKING CHANGE footer.
- Every commit must be GPG signed and its signature verified. Never bypass signing.
  The user enters the signing password interactively. If the prompt times out,
  stop the commit workflow without automatically retrying.
- Every merge requires a fresh explicit user command for that particular PR.
  Preserve signed commits and create signed merge commits; do not automatically
  squash or rebase away verified signatures.
- A release milestone does not authorize tagging, publishing or marketplace submission.

## Changelog and versions

Issue #1 establishes CONTRIBUTING.md, repository-local agent instructions and
CHANGELOG.md; issue #2 implements automated checks. These are planned, not already enforced.

Use Keep a Changelog with Unreleased and the relevant Added, Changed, Deprecated,
Removed, Fixed and Security sections. Write entries for users in the same PR as
the feature or fix. Version and date entries only when a release is actually prepared.
The current package says 0.1.0, but has no published tag at planning time; do not invent
a historical release date.

Feature batches before 1.0 advance MINOR; compatible corrections advance PATCH.
Breaking 0.x changes advance MINOR and include migration notes. At 1.0, declare
the stable user, RPC/CLI, storage and export contracts; incompatible changes to
these contracts then advance MAJOR. Keep package.json, package-lock.json,
CHANGELOG.md and the eventual immutable vX.Y.Z tag consistent.
Versions below are provisional targets, not published releases or deadlines.

## Milestones

### v0.2.0 — Workflow & image editor

Git Flow, signed Conventional Commits, CI and Keep a Changelog; searchable project settings and an image editor with 20 px preview. Release only after checks and explicit approval.

- [#1](https://github.com/fogrew/bb-plugin-project-icons/issues/1) chore(workflow): закрепить Git Flow и правила работы отдельных сессий
- [#2](https://github.com/fogrew/bb-plugin-project-icons/issues/2) ci: проверять сборку и соглашения в pull request
- [#3](https://github.com/fogrew/bb-plugin-project-icons/issues/3) feat(settings): список проектов с поиском и состояниями
- [#4](https://github.com/fogrew/bb-plugin-project-icons/issues/4) feat(editor): кадрирование и предпросмотр иконки в 20 px
- [#5](https://github.com/fogrew/bb-plugin-project-icons/issues/5) feat(upload): drag-and-drop, вставка и отмена удаления
- [#6](https://github.com/fogrew/bb-plugin-project-icons/issues/6) chore(release): проверить и подготовить v0.2.0

### v0.3.0 — Icon chooser

Emoji, built-in glyphs and initials with consistent colors; preserve existing uploaded icons. Release checkpoint and migration verification.

- [#7](https://github.com/fogrew/bb-plugin-project-icons/issues/7) feat(icons): назначать emoji с поиском и недавними
- [#8](https://github.com/fogrew/bb-plugin-project-icons/issues/8) feat(icons): встроенные значки и инициалы с цветом
- [#9](https://github.com/fogrew/bb-plugin-project-icons/issues/9) chore(release): проверить и подготовить v0.3.0

### v0.4.0 — Contextual setup

Check current BB SDK integration first; add contextual icon editing and opt-in repository asset discovery using supported APIs.

- [#10](https://github.com/fogrew/bb-plugin-project-icons/issues/10) feat(sidebar): открыть редактор из контекста проекта через SDK
- [#11](https://github.com/fogrew/bb-plugin-project-icons/issues/11) feat(discovery): предлагать иконки из файлов репозитория
- [#12](https://github.com/fogrew/bb-plugin-project-icons/issues/12) chore(release): проверить и подготовить v0.4.0

### v0.5.0 — Appearance & portability

Light/dark variants, opt-in Project Colors integration and safe import/export with preview.

- [#13](https://github.com/fogrew/bb-plugin-project-icons/issues/13) feat(appearance): варианты тем и совместимость с Project Colors
- [#14](https://github.com/fogrew/bb-plugin-project-icons/issues/14) feat(portability): экспорт и импорт иконок с предпросмотром
- [#15](https://github.com/fogrew/bb-plugin-project-icons/issues/15) chore(release): проверить и подготовить v0.5.0

### v1.0.0 — Stable marketplace release

Compatibility and accessibility audit, stable documented contracts, authentic marketplace materials and a reviewed submission. Marketplace acceptance is external.

- [#16](https://github.com/fogrew/bb-plugin-project-icons/issues/16) test(stability): проверить контракты и готовность к 1.0
- [#17](https://github.com/fogrew/bb-plugin-project-icons/issues/17) docs(marketplace): подготовить описание и настоящие скриншоты
- [#18](https://github.com/fogrew/bb-plugin-project-icons/issues/18) chore(release): выпустить v1.0.0 и подать заявку в маркетплейс

## Dependencies and checkpoints

See each issue for executable acceptance criteria and verification.
After each feature batch, a release issue is the explicit checkpoint for user
review, live evidence, compatibility, version/changelog consistency and release approval.
Issues #10 and #11 can be independent after #9; #13 and #14 can be independent
after #12, provided shared icon contracts are agreed and worktrees are isolated.
Do not start all sessions at once.

## Definition of done and handoff

Acceptance criteria must pass and verification must distinguish unit/build,
runtime/live and untested environments. Each session returns:

- issue, branch and worktree;
- signed commit and signature verification;
- PR URL and intended base;
- changes and relevant changelog entry;
- commands/checks and live evidence;
- limitations, blockers and next unblocked issue.

Keep project status current. Do not mark Done before acceptance and the
explicitly approved merge. Marketplace submission and external acceptance are
different outcomes and must not be reported interchangeably.

## Risks

- BB sidebar DOM can change; prefer SDK surfaces and verify content-script cleanup.
- Async project switching and concurrent clients must not overwrite another icon.
- Repository discovery must use supported host APIs with bounded traversal and
  safe image handling. SVG support is conditional on a defensible pipeline.
- Import/export needs versioned validation, conflict preview and atomic application.
- Current platform support and marketplace rules must be rechecked in their sessions.

## Sources

- [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)
- [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
- [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
- [Git Flow](https://nvie.com/posts/a-successful-git-branching-model/)
