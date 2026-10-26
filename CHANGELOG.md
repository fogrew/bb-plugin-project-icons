# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with the explicit pre-1.0 policy in [CONTRIBUTING.md](CONTRIBUTING.md).

## Unreleased

### Added

- Undo project icon removal for up to 15 seconds with an accessible deadline,
  bounded temporary retention and server-side protection against overwriting
  newer changes. Server/plugin reload invalidates pending offers
  ([#24](https://github.com/fogrew/bb-plugin-project-icons/issues/24)).
- Choose project icon images through one accessible picker, drag-and-drop or
  focused paste area, with shared validation, project-owned drafts and clear
  failure/busy feedback
  ([#5](https://github.com/fogrew/bb-plugin-project-icons/issues/5)).
- Preview and crop project images with Fit/Fill, zoom and position controls,
  an actual 20 px sidebar sample, and explicit Save/Cancel that preserves
  existing icons when drafts are discarded
  ([#4](https://github.com/fogrew/bb-plugin-project-icons/issues/4)).
- Pull request checks for branch and commit conventions, lockfile consistency,
  typechecking, plugin builds, and backend tests
  ([#2](https://github.com/fogrew/bb-plugin-project-icons/issues/2)).
- Contributor and agent workflow documentation covering Git Flow, signed
  commits, review gates, version policy and session handoffs
  ([#1](https://github.com/fogrew/bb-plugin-project-icons/issues/1)).

### Changed

- Replaced the project icon settings dropdown with a searchable, keyboard-accessible
  project list, explicit loading/error/empty states, and stable selection during
  realtime updates ([#3](https://github.com/fogrew/bb-plugin-project-icons/issues/3)).
- Clarified English-language publishing across projects, with scoped explicit
  user exceptions and support for Unicode, emoji and necessary test fixtures.
- Separated parallel development readiness from integration/release readiness;
  documented stacked dependency PRs and revalidation while preserving signed
  working history.
- Aligned ordinary autonomous PR merge gates with the global workflow, including
  risk-based independent review and mandatory GPG signatures on merge output;
  verified GitHub squash integration distinguishes personal source signatures
  from GitHub's signer and stops further merges on verification failure.
  Releases and repo settings remain owner responsibilities.

### Fixed

- Preserve legacy icon revision maxima before removal or project cleanup so
  reloads and clock rollback cannot reuse a previously cached icon URL
  ([#24](https://github.com/fogrew/bb-plugin-project-icons/issues/24)).
- Give crop sliders stable, clickable labels and accessible names across
  multiple editors ([#32](https://github.com/fogrew/bb-plugin-project-icons/issues/32)).
- Kept asynchronous icon changes and feedback attached to their initiating
  project when selection changes
  ([#3](https://github.com/fogrew/bb-plugin-project-icons/issues/3)).
