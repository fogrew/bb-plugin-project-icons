# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with the explicit pre-1.0 policy in [CONTRIBUTING.md](CONTRIBUTING.md).

## Unreleased

### Added

- Pull request checks for branch and commit conventions, lockfile consistency,
  typechecking, plugin builds, and backend tests
  ([#2](https://github.com/fogrew/bb-plugin-project-icons/issues/2)).
- Contributor and agent workflow documentation covering Git Flow, signed
  commits, review gates, version policy and session handoffs
  ([#1](https://github.com/fogrew/bb-plugin-project-icons/issues/1)).

### Changed

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
