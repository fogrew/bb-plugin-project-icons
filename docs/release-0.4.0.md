# v0.4.0 release candidate: contextual setup

Status: prepared on `release/0.4.0`. Merge to `main`, signed tag, publication and
the return PR to `develop` await the owner. The changelog date is the preparation
date and must be corrected if the release is published on another day.

## Scope

- Contextual editor reachable from the homepage, the thread actions menu and the
  open thread header (#10, #58 centered dialog).
- Repository icon discovery with broader patterns, size ranking and `.ico`
  support (#11, #56, #64).
- Automatic adoption of artwork from installed plugins until the first manual
  change, plus colours for initials from Project Themes and Threadspace
  (#25, #55, #60, #61). Removing an icon resets a project to automatic (#68).

See [CHANGELOG.md](../CHANGELOG.md) and the README Compatibility section for
details and known incompatibilities.

## Versions and requirements

- `package.json` and `package-lock.json` are at 0.4.0.
- `engines.bbPluginSdk` stays `>=0.6.104` and `engines.bb` stays `>=0.46`; the
  code uses no API newer than SDK 0.6.104.
- No stored-data migration: records and icons from 0.3.0 remain valid. Projects
  whose icon was removed before this version become eligible for automatic
  adoption (see the changelog for the opt-out).

## Evidence

| Area | Evidence | Kind |
| --- | --- | --- |
| `npm run check` (quality, typecheck, build, unit tests) | Passed on the release branch | Local build/unit |
| Pull request quality gates | Passed on every merged PR | CI |
| Contextual editor dialog, repository discovery (incl. Launcher `.ico`), Project Themes colours, reset to automatic | Confirmed by the owner in live BB on `develop` e61238d | Live (owner) |
| Automatic adoption from Cursor Sidebar, Nest, Homepage, Chat Sidebar | Fakes and browser fixtures only; not exercised against real peers | Mocked |
| BB Sidebar and Threadspace adoption | Fakes only; neither plugin installed on the test machine | Mocked |
| Upgrade from 0.3.0 with existing assignments | Unit tests; no isolated runtime upgrade run | Not live |

## Untested

Native project-row menus (BB offers no plugin slot for them), physical devices,
screen readers, OS clipboard and file dialogs, browsers other than Chromium,
adoption without an open BB window (#62), and published Git/tag upgrade
resolution.

## Open follow-ups

#10, #11, #25 and #55 stay open until real-peer evidence exists. Follow-ups:
#50, #52, #53, #62, #67.
