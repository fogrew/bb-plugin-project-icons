# v0.2.0 release preparation

Status: pending owner release. No release date or tag is asserted.

## Release notes

Project Icons adds a searchable project list and an image editor with Fit/Fill,
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

The accepted source is `171295e9a76c39aecfce32fb34fe84c346fc1038`.
Release preparation changes package versions and release documentation only;
application source, SDK requirements and dependency resolutions are preserved.
Both manifests identify version `0.2.0`.

Requires BB 0.46 or newer and Plugin SDK 0.6.49 or newer. The native sidebar
enhancement depends on BB's heading DOM and `data-sidebar-project-id` marker.
Other project pickers do not display these images.

## Acceptance boundary

Build and SDK fake-host tests do not prove installation, upgrade, real Settings
slots, sidebar integration or cross-client realtime. Fresh installation and
upgrade must be verified in an isolated BB instance with independent data and
configuration before final acceptance. The user's running BB installation is
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

All owned process trees were closed and both test ports were confirmed closed.
The user's running plugin, BB configuration and data were preserved. The only
captured screenshot shows isolated BB onboarding, not the plugin's UI. Fresh
activation, upgrade preservation, actual Settings/sidebar UI and realtime
remain unverified. These host setup blockers require coordinator follow-up
before release acceptance; source/build tests do not replace that evidence.

Issue [#6](https://github.com/fogrew/bb-plugin-project-icons/issues/6) remains
open. The owner controls release integration into `main`, the actual release
date, the signed `v0.2.0` tag, publication and the subsequent return PR.
