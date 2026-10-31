# v0.3.0 release preparation

Status: preparation only. Release date is pending owner authorization.
Main integration, tagging, publication and the return PR to develop remain owner-controlled.

## Scope and compatibility

Accepted application source: `c9966661aa3fdc06976cd493bd4f51ae551643aa`.
Accepted tree: `d13b29f34271f1352a1e782a07681fc30ce85fa7`.
This batch adds emoji, bundled glyphs, initials and current/draft PNG viewing.
Image uploads remain available. Every source saves normalized PNG bytes through
the existing storage contract. Existing assignments are intended to remain intact.

Emoji appearance and complex sequences depend on local fonts and browser support
before saving. Initials accept one or two grapheme clusters and depend on local
font coverage and shaping. Glyphs use a small locally bundled Feather catalog.
Inspect the exact PNG preview before Save; saved artwork is shared across clients.
See the README and THIRD_PARTY_NOTICES.md for limits and licensing.

## Verification

Release acceptance is pending the isolated BB 0.48.1 runtime matrix and local/CI
checks. Previous 0.2.0 and issue #7 results are reference evidence only.
No release date, tag, publication or live installation update is asserted.

Local `npm run check` passed typecheck, build and 197 tests after
`npm ci --ignore-scripts`; native installation scripts were not exercised locally.
Normal Ubuntu CI passed on `e8cc5b48a5c1aecb9071a48c518c4c3ed5e05557`
([run 41153391838](https://github.com/fogrew/bb-plugin-project-icons/actions/runs/41153391838)).
The final preparation head must receive its own CI result.

The previous release was squash-integrated into main. An additive signed merge
connects that main ancestry while retaining the entire accepted develop plus
preparation tree: `e8cc5b4` has exactly the same tree as its first parent.
This resolves release PR conflicts without changing application source.

## Isolated runtime result: partial acceptance

Installed official BB 0.48.1, Node 24.21.0 and native headless Chrome exercised
accepted application source `c9966661aa3fdc06976cd493bd4f51ae551643aa`.
The installed snapshot retained its accepted-source package version 0.2.0;
the release-only 0.3.0 metadata was checked locally and in CI, not installed
in this runtime. This is not published Git/tag upgrade-resolution evidence.

Exact v0.2.0 baseline `40becd9eb24895c85fad2759954bd9fca2448196` retained
the project assignment, revision and all 303 HTTP PNG bytes after candidate
path installation. Real Settings displayed the preserved icon.

All four sources passed draft/current modal viewing with Enter/Space,
Tab/Shift+Tab focus containment, Escape/Close and trigger focus restoration.
Each passed a deliberately intercepted and aborted Save request before network
dispatch, followed by an explicit retry through the real backend. Preview bytes
equaled the successful Save payload and HTTP PNG. Both independent browser
contexts reached the server-confirmed revision. Remove/Undo restored exact bytes
in both contexts. Transport abortion was test instrumentation; other SDK/RPC,
storage, browser rendering and realtime boundaries were real.

Five directed replacements passed Cancel preservation and Save/realtime:
Image to Emoji/Glyph/Initials, and Emoji to Image/Glyph.
The ten-minute runtime budget then stopped the driver before its next draft.
The remaining seven directed replacements, reset-specific checks and six
light/dark 320/375/1440 px captures are unverified. Acceptance remains incomplete.
No native sidebar data was manufactured. Native sidebar headings, physical
devices, screen readers, OS dialogs/clipboard and other browsers remain gaps.

The final owned data directory was `%TEMP%/i9-58583f-u`, new host
`host_7ek999dq5j`, server `http://127.0.0.1:48973`, daemon port 48974.
Inherited BB variables were stripped. Canonical directory, URL, listener
loopback/owned-process ancestry and daemon identity were checked before
mutations. Finally closed owned browser/server/daemon trees; a separate listener
check confirmed both ports closed. No cleanup deletion was attempted.
Automatic official provider catalog prewarm occurred; no authentication,
provider turns or agent sessions were requested. The live installation was untouched.

Evidence is retained in ignored `dist/issue9-qa`: driver, manifest, structured
results and logs. Earlier guard-stop and realtime-wait failures remain separate.
The first guard incorrectly required the launcher PID itself; installed source
confirmed its child process, and subsequent guards verified CIM ancestry.
The first realtime wait sampled a potentially stale local URL; the final run
waited for the confirmed server revision on both clients. It did not replay
the earlier dispatched mutation.

Project attachment: `issue9-bb0481-upgrade-1793408746197-h3rmki.png`.
This preparation PR remains draft until root accepts the remaining evidence.
