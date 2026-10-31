# v0.3.0 release preparation

Status: preparation only. Release date is pending owner authorization.
Main integration, tagging, publication and the return PR to develop remain owner-controlled.

## Current candidate after automatic fallback integration

Accepted #46 source `87c8ee7cd220d911e7a3c33b393761943ce8f186` was integrated
through personally signed additive merge `15f0d4fdc8b0822ba5588f434ee793ac8a34571b`.
Package and lockfile versions remain 0.3.0. Unassigned projects now show
automatic initials, including after removal; assigned PNGs retain priority.
See the README for local font and automatic-color limitations.

Local npm run check passed 197 tests, typecheck and build after integration.
Normal Ubuntu CI passed on the merge head
([run 41215518615](https://github.com/fogrew/bb-plugin-project-icons/actions/runs/41215518615)).
Earlier runtime results below remain evidence only for their recorded sources.
They do not establish runtime acceptance of the automatic fallback addition.

Two fresh isolated startup attempts stopped before any project/plugin mutation:
the mandatory Windows listener observations returned no matching listener.
This does not establish a startup hang: the full logs contain Server listening
before built-in plugin loading, including thread-list. The earlier interpretation
of the tail-only logs was incorrect.
Both owned process trees were closed; independent checks found ports 48973/48974
closed. Evidence is retained in ignored dist/issue9-final-a, including the first
startup-stop result. No accepted release snapshot was installed in these attempts.
The remaining seven replacements, reset, viewport/theme captures, fallback runtime
matrix and metadata 0.3.0 upgrade remain pending. The prepared second scenario
was not started. Further runtime attempts await coordinator direction.

### Server-only measurement calibration

A separately authorized server-only attempt used a fresh data directory,
no daemon enrollment and no project/plugin operations. Async requests had a
two-second timeout and startup had a 180-second limit inside the ten-minute cap.
The run stopped on disagreement and cleaned up in 5.4 seconds.

At 2026-10-31T15:41:12.329Z, `/health` returned HTTP 200,
Content-Type application/json and `{"ok":true}`. The response socket recorded
remote 127.0.0.1:48973 and local 127.0.0.1:65012. A concurrent `/api/health`
request returned text/html and the BB app shell: it is not the health endpoint.
Concurrent Windows Get-NetTCPConnection (both exact and filtered queries) and
.NET GetActiveTcpListeners returned no target listeners. The owned launcher
PID 56588 had null exit/signal fields during measurement; CIM also identified
owned child node PID 56916. The launcher exited only after owned cleanup.
Both listener APIs reported closed target ports after cleanup.

Installed launcher flags propagate through environment to the child server.
The registered `/health` route precedes HTTP listen; plugins start asynchronously
after listen. Finishing plugin loading awaits artifact GC, not initial listen.
The evidence establishes an HTTP-versus-Windows-observation discrepancy, not its
underlying cause. Full identity guards remain unchanged; runtime acceptance is
pending coordinator review. Evidence: ignored dist/issue9-calibration, including
socket/body/timestamp measurements, process ancestry, exit details and logs.

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
