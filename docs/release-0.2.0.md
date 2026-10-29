# v0.2.0 release — 2026-10-27

Status: owner-authorized release v0.2.0, dated 2026-10-27.
Release integration, signed tagging and publication are coordinated separately
by the root coordinator; this document records the release scope and evidence.

## Release notes

Project Icons shows projects in a searchable responsive collection, with compact
mobile headers. Headers show assigned/missing status, wrap long names and identify
duplicate names by ID. Explicit activation expands one editor after the selected
desktop row, including a partial last row, or immediately after the header on
mobile, and reveals its file chooser. Repeated activation folds/reopens the
same editor without resetting its draft or Undo deadline; folding requests no
scrolling. Filtering and resize retain drafts and Undo, while editor keys remain
separate from project navigation. The image
editor provides Fit/Fill,
zoom, position controls, an enlarged preview and a 20 px sidebar sample. Save
applies the draft; Cancel preserves the existing icon. Choose an image through
the file picker, file drag-and-drop or focused paste area.

Removing an icon offers Undo for up to 15 seconds. Newer changes, project
switches, bounded retention or a server/plugin reload can end the offer sooner.
Undo never replaces a newer icon. Crop sliders have stable accessible labels,
including when multiple editors are present.

The server rejects malformed or truncated PNG assignments before mutation.
Existing assignments remain in server-side plugin storage; this release does
not intentionally migrate or clear them. Previously stored images remain
subject to the documented [PNG compatibility rules](png-validation.md).
See the [Undo contract](removal-undo.md) for retention and failure limits.

This batch also adds contribution conventions and normal Ubuntu pull request
checks. Emoji and glyph selection belong to a later release.

## Source and compatibility

The accepted source is `1288d88079e20426f2cbdeb81baf369bf0fd7c77`, including
#35 / PR #36, #37 / PR #38 and desktop-row placement/folding from #39 / PR #40.
It was synchronized into the
release branch through an additive personally signed merge.
Release preparation changes package versions and release documentation only;
application source, SDK requirements and dependency resolutions are preserved.
Both manifests identify version `0.2.0`.

Requires BB 0.46 or newer and Plugin SDK 0.6.49 or newer. The native sidebar
enhancement depends on BB's heading DOM and `data-sidebar-project-id` marker.
Other project pickers do not display these images.

## Acceptance boundary

The original fresh/upgrade results below were captured at release head
`286f4788393acc82c3a42523bb1974f416b99fe5`, using accepted source
`171295e9a76c39aecfce32fb34fe84c346fc1038`. They remain evidence for that
original source, not evidence for subsequent collection/inline changes. Later
checks are recorded separately with their tested source.

Build and SDK fake-host tests do not prove installation, upgrade, real Settings
slots, sidebar integration or cross-client realtime. Fresh installation and
upgrade verification uses isolated BB instances with independent data and
configuration. The user's running BB installation is
outside this preparation task's runtime mutation scope.

Local Node 24 verification passed `npm run check` with 187 tests after
`npm ci --ignore-scripts`. Normal local installation failed on both Node 24
and Node 26 because the native SQLite dependency could not find the required
Visual Studio build tools. This local workaround does not establish normal
installation; the final PR's normal Ubuntu CI is separate evidence.

Normal Ubuntu CI also passed `npm ci`, typecheck, build and all 187 tests on
the release PR. Its immutable head and run URL are recorded in the PR.

An isolated official BB 0.47.1 server and host daemon were verified using
independent state inside the assigned worktree. Before writes, direct CLI
status matched that directory, the actual listeners were verified as
`127.0.0.1:48961` and `127.0.0.1:48962`, and daemon status matched the new
isolated host identity and server URL. Every inherited `BB_*` variable was
removed from child environments before setting the isolated values. Enrollment
targeted only the isolated server. No agent sessions were created; the daemon
automatically performed built-in provider catalog discovery/prewarming.

The isolated project was created and the path install built the plugin's
frontend, but activation failed with `ENAMETOOLONG` while BB created a runtime
staging directory under the long managed-worktree path. The install command
returned success with plugin status `error`; this is not a successful fresh
installation. A separately reviewed retry used `path.toNamespacedPath` for
the exact same directory; server startup then failed because `pino-roll`
rejected the Windows namespace prefix in its log filename. No installed host
files or accepted plugin code were patched to bypass either failure.

The coordinator then approved short, unique ordinary temporary directories,
with exact canonical paths recorded in the local artifact manifests. Runtime
staging paths were checked below the Windows path limit before startup.
Fresh and upgrade instances used distinct directories, host identities and
loopback server/daemon port pairs; assertions were repeated before writes.

Fresh installation reached plugin status `running` with the real frontend
loaded. In the actual Settings slot, file-input upload and Save updated another
browser context through realtime. Fill/Zoom followed by Cancel preserved the
exact persisted HTTP PNG bytes. Editing and saving changed bytes and revision;
Remove/Undo restored the edited bytes and updated the second context.

Upgrade verification installed the exact `main` baseline
`ce8c29e7160180989358a466c55fd1278ea81a02` as `0.1.0` in a separate instance.
An icon was seeded through its real RPC and retrieved over HTTP. Updating the
disposable path source to the prepared release and installing that same path
activated `0.2.0`, preserving the project assignment, revision and all 303 PNG
bytes (SHA-256
`835700431e4d9521bb8151402795c76ee9ff218deb53edff848204697f9046d5`).
The actual upgraded Settings slot displayed the preserved icon. This
checks a local path upgrade; published Git/tag update resolution was not tested.

All owned browser, daemon and server process trees were closed; the four test
ports were confirmed closed. The user's running plugin, BB configuration and
data were preserved. Local artifacts include assertion/result JSON, exact
launch drivers, directory manifests and screenshots of the editor draft,
restored icon and upgraded Settings UI. These artifacts remain outside Git
under the assigned worktree's ignored `dist/release-qa` directory.
The draft screenshot shows the visible upper editor; lower controls extend
outside that viewport and are verified by the interaction checks, not that image.

Native sidebar headings were not exercised because the isolated instances had
no agent threads. Read-only inspection found that the installed public create
schema rejects empty input for ordinary threads, the CLI requires a prompt,
and idle forks require an existing provider session. No supported inert first
thread path was established, and no agent sessions were spawned. Native
operating-system file dialogs/clipboard, browser drag/drop, other browsers,
remote devices and other platforms remain untested. The browser checks used
headless installed Chrome with actual file-input selection. The owner authorized
this release with these verification limits recorded; the two Windows host setup
failures remain follow-up evidence.

## Earlier card-grid verification

Issue #35 was accepted before this release synchronization. Targeted grid QA
used signed release source `3fd11fe89b1aa996296b74e5f39afc4da281d706`, whose
application/test/build files exactly match accepted develop
`83fdc470348e2b186aea504892a59c7d7a4b7649`. The actual `npm run check` passed
187 tests. The unchanged PNG validation matrix was not rerun separately.

A new short owned temporary data directory hosted actual BB 0.47.1 server and
daemon instances on checked loopback ports 48965/48966, with a new isolated host
identity. Exact dataDir, host identity, server URL and listener assertions were
repeated before mutations. The fixture used six real core-created projects,
including assigned/missing icons, duplicate names with distinct valid IDs,
and long spaced/unbroken names. The current plugin reached status `running`
with its real frontend and Settings slot. No SDK/RPC or theme CSS mocks were used.

Light/dark checks verified actual host class, computed background/foreground
and theme tokens changed; browser preference alone was not counted as proof.
Desktop 1440 px and narrow 375/320 px passed: all six cards stayed rendered,
long names wrapped, component widths did not overflow and the grid itself had
visible overflow with equal client/scroll heights. The host Settings page
provides natural scrolling. Screenshots cover both schemes and all three widths;
narrow captures use complementary viewport positions because an element capture
alone is clipped by the host Settings viewport.

Selection and away/back draft cancellation retained all six cards and exactly
one editor. Real Save changed a missing card to assigned in two independent
browser contexts. Remove cleared both thumbnails/statuses, and Undo restored
both plus the exact 283 saved PNG bytes retrieved over HTTP. No manual refresh
was used for the second context. Search/no-match/clear and keyboard selection
also passed. The native sidebar heading gap and other limits above remain.

These earlier grid artifacts, exact launch drivers, source/data provenance and
screenshots are separate under ignored `dist/release-qa/grid`; original
fresh/upgrade artifacts retain their original source attribution.
Complementary narrow top/bottom captures confirmed the last card is reachable
through the host page scroll in both schemes and widths. Both grid runs closed
their owned browser/daemon/server trees; ports 48965/48966 were confirmed closed.

## Earlier compact inline verification

After #37 / PR #38 acceptance, actual BB QA used signed release source
`5b3f970033de1b00e13dcf172eb450856c6426ab`, whose application/test/build/SDK
files exactly match accepted develop
`48b31008e657dfa1e1f5005235091f28a56c0aed`. The actual `npm run check` passed
187 tests. Earlier fresh/upgrade and grid results retain their original source
attribution and are not relabeled as current inline evidence.

The reviewed isolated setup used a new short owned data directory, actual
BB 0.47.1 on Node 24, a new host identity and checked loopback ports 48967/48968.
Child `BB_*` sanitization and exact dataDir/URL/host/listener guards were retained.
Six core-created projects included assigned/missing, duplicate and long names.
Onboarding was completed at desktop width before targeted mobile checks.

At 375 and 320 px, the initial overview rendered six compact headers with no
expanded editor. Header heights were 61–124 px; the collection was 538/559 px
high. Activating the first, middle and last headers placed the single editor
immediately after that header, with exactly one editor and file input. Its file
chooser remained fully inside the 812 px viewport in all six cases; the largest
measured bottom coordinate was 761 px.

Native slider ArrowRight/Home/End, file-input Home/End, search Home/End and
header Home/End/ArrowDown/Space behaved correctly without editor-key interception.
The exact draft PNG and the same editor/panel/file nodes survived filtering,
no-match/clear and resize through desktop/mobile widths. An actual RPC change
updated both independent browser contexts through BB realtime while preserving
the draft, focus and nodes. Recorded scrollBy calls stayed empty and all measured
window/host scroll offsets stayed identical; no mock realtime signal was used.

Nine source-tagged screenshots, exact drivers, result assertions and data/source
provenance are retained separately under ignored `dist/release-qa/inline`.
Screenshots were attached to the coordinator thread. The owned browser, daemon
and server trees were closed and ports 48967/48968 confirmed closed. The user's
running checkout/plugin was not modified or reloaded by this verification.
The native sidebar heading and other previously recorded live gaps remain.

## Current desktop-row and folding verification

After #39 / PR #40 acceptance, actual BB QA used personally signed source
`f929aa1bd0cc411876358618f9791b34551f45e6`, whose application/test/build/SDK
files match accepted develop `1288d88079e20426f2cbdeb81baf369bf0fd7c77`.
Actual local `npm run check` passed 187 tests. Earlier evidence above retains
its original source attribution; the unchanged PNG matrix was not rerun separately.

The same reviewed isolation design used a new short owned data directory,
actual BB 0.47.1/Node 24, a new host identity and checked loopback ports
48969/48970, with stripped child `BB_*` environment and exact path/URL/identity
guards. Seven core-created projects covered assigned/missing, duplicate and long
names. Native host styles resolved three desktop columns at 1440 and 1920 px.
Eight first/middle/non-last/last selections preserved all row memberships and
placed the panel after the complete selected row, including the partial final row.

Pointer, Enter and Space fold/reopen cycles preserved the exact draft PNG and
the same editor/panel/file-input nodes. Folding issued no mutating plugin RPC
and no scrollBy request. A real removal's absolute Undo deadline remained
identical through folding/reopening; Undo then restored the exact 303 HTTP PNG
bytes. At 375/320 px, first/middle/last activations retained mobile adjacency,
one editor/input and a file chooser fully inside the viewport.

A supplemental run used a non-last selected card while resizing through
desktop/mobile widths. The panel's row-end position changed correctly between
headers 2 and 1 without replacing DOM nodes or changing the draft. Search and
clear retained that identity. Fresh post-navigation scroll spies plus an actual
RPC/realtime change verified two-context updates without scroll requests,
scroll-offset changes, focus theft or draft/node replacement.

One additional ordinary isolated fixture project made the final desktop row
contain two cards. Selecting its first member kept its sibling in that row and
placed the panel after the second member. Adding this setup fixture after mount
required refreshing only the isolated Settings page; the first setup timeout is
retained separately, and no product code was changed to bypass it.

Seventeen current screenshots, exact launch drivers, result assertions and
source/data/hash provenance are retained under ignored `dist/release-qa/rowfold`.
Both successful runs closed their owned browser/daemon/server trees; ports
48969/48970 were confirmed closed. The user's running checkout/plugin was not
edited or reloaded by this worker. Native sidebar and the other recorded live
gaps remain explicit; root owns any separately authorized installed-plugin update.

The owner authorized release `0.2.0` dated 2026-10-27 with the known verification
limits above. The root coordinator handles integration into `main`, the signed
`v0.2.0` tag, publication and the subsequent return PR. Issue
[#6](https://github.com/fogrew/bb-plugin-project-icons/issues/6) remains open
through those release actions; this preparation worker performs none of them.
