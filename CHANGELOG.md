# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
with the explicit pre-1.0 policy in [CONTRIBUTING.md](CONTRIBUTING.md).

## Unreleased

### Added

- Export and import of project icons from **Export and import** in Settings. The versioned JSON file holds only each icon's project id, project name and 64 x 64 PNG (no paths, credentials or settings), limited to 12 MiB and 500 icons on import; exported PNGs keep only their pixel chunks, so embedded text or path metadata never leaves the server. Importing validates the file with the same strict PNG decoder as Save, then shows a preview of every icon, its target project and whether it adds, replaces or repeats an icon. Projects are matched by id only; on another server nothing is mapped until you choose a project, and same-name projects are suggested but never chosen for you. Replacing icons needs an explicit confirmation and an icon that changed after the preview refuses the import. Cancel changes nothing and a failed import is rolled back as a whole. Imported icons are manual and never overwritten by automatic adoption, including an identical icon another plugin supplied. Light and dark variants are not exported or imported yet (importing keeps a project's existing variants, and the export reports how many it left out; #85) ([docs](docs/icon-transfer.md)). Verified with the SDK's fake host and in headless Chrome with a mocked host and RPC transport; live BB verification is pending.
- Optional light and dark icon variants per project. The icon you already have stays the default for every theme; a variant replaces it only while BB uses that theme, and the sidebar follows a theme switch live without a reload. Variants are added from the editor's **Light and dark variants (optional)** section (the draft preview sits on a light or dark surface), need a default icon first, can be removed individually, and are removed with the default (Undo restores them). `resolveIcon` (contract version 1) is unchanged and still returns the default icon; exposing variants to other plugins is a follow-up. See [Theme variants](docs/theme-variants.md).

### Changed

- **Stored-data format (additive, no migration needed).** New storage keys `variants` and `image:<projectId>:light|dark`; `index`, `image:<projectId>` and every existing single icon are unchanged and stay valid, and an older version ignores the new keys. New RPC fields (`list` rows carry `variants`; `save`, `remove` and `removeWithUndo` accept `theme`) and routes (`GET /icon-variants`, `GET /icon?theme=`) are optional additions.
- Project Icons no longer hides the Project Colors dot on headings that show an image. The old rule was unconditional and removed the colour picker; the dot, palette, tint and title colour now stay as Project Colors draws them. Project Colors exposes no public contract (browser storage and DOM only), so its colours are not used as an icon background or outline.

## 0.4.0 - 2026-11-13

### Changed

- Removing an icon now resets the project to automatic: the next scan can adopt peer artwork again (for example from Homepage). Turn off **Use artwork from installed plugins automatically** in Settings to keep a removed icon empty.
- Every call to another plugin goes through one guard: the plugin must be installed, enabled and running at a known version, a method BB reports as unknown is treated as an absent peer and not asked again for that version for 30 minutes, calls time out after 5 seconds, and replies are shape-checked field by field, read by own properties only and size-limited. A plugin that changes state is probed again, and any failure degrades silently to an absent peer.
- `resolveIcon` results for an auto-adopted icon carry an optional `adoptedFrom` plugin id (contract version 1 is otherwise unchanged), and images imported from Homepage are bounded by decoded dimensions (4096 px per side).
- Projects whose icon was removed before this version have no provenance record and become eligible for automatic adoption; turn off **Use artwork from installed plugins automatically** in Settings to keep them without an icon.
- Repository icon discovery recognizes `app-icon`, `apple-touch-icon`, `android-chrome-*`, `ic_launcher`, size-only names in icon directories (`src-tauri/icons`, `mipmap-*`, `*.appiconset`) and `build/icon.png`, ranks larger square sizes and higher Android densities first, and runs three more host queries (`apple-touch`, `android-chrome`, `ic_launcher`). Safety limits are unchanged; `.claude`, `bin` and `obj` are now skipped.

### Fixed

- The contextual editor dialog is centered with explicit positioning, fits 320 px viewports, and its close button and chrome use host theme tokens outside the Settings page. Clicking the backdrop now closes it, and the browser fixture runs under a host-like CSS reset. Live BB verification is pending.

### Added

- Automatic adoption from two more plugins, after the existing ones in priority order: BB Sidebar (an icon its user uploaded or chose from a project file; the browser fetches its icon route and the project's environment is looked up through BB) and Threadspace (an emoji its user chose, drawn locally; its default folder emoji is never imported). A project BB Sidebar cannot resolve is skipped and keeps lower-priority plugins waiting. Their RPCs are undocumented; see the README risk table ([docs](docs/artwork-interoperability.md)).
- Automatic initials take their background colour from Project Themes, or from Threadspace when Project Themes has none, with the existing black or white lettering keeping at least 4.5:1 contrast. Colours are hints: never stored, never replace a saved icon, controlled by the automatic icons toggle, and refreshed on focus and about once a minute. A failed read keeps the last colours instead of clearing them, and a failing Project Themes holds Threadspace's colours back until it recovers.
- ICO support: `.ico` files are suggested by **Find icons in repository** and accepted by choose, drop and paste. The header, directory, entry bounds, 64-entry and 2 MB limits are validated strictly on the host and again in the browser, the largest valid PNG or BMP entry is decoded by the browser and exported as the usual 64 x 64 PNG, and `favicon.ico` is ranked alongside PNG candidates. A file named `.ico` may also hold PNG, JPEG or WebP data and is then handled as that format, while ICO data under any other name (including pasted clipboard images) is refused. BMP entries that are 16-bit, RLE-compressed, bitfield or use a V4/V5 header are skipped and the next-largest entry is tried. SVG stays rejected and Homepage and other plugin artwork is unchanged ([docs](docs/repository-discovery.md#ico-files)). Verified in headless Chrome with mocked SDK and RPC; live BB verification is pending.
- Automatic adoption of artwork from installed Homepage, Cursor Sidebar, Nest and Chat Sidebar plugins for projects without an icon, refreshed while the icon is still auto-imported and the same plugin's artwork changes. Saving or removing an icon marks the project manual for good; Settings shows each project's source, a global on/off toggle, and **Re-enable automatic icons** in the editor. Peer replies are version-checked, bounded and re-rendered to 64 x 64 PNGs; the peer RPCs are undocumented and found in source ([docs](docs/artwork-interoperability.md)).
- README Compatibility section covering coexisting plugins, the Project Colors dot interaction, plugins that replace the thread list, and where the editor is reachable.
- Edit project icons from the homepage, thread actions menu and open thread header in a shared contextual editor.
- Suggest favicon, icon and logo images from the project repository on an explicit action; preview and Save remain manual. SVG is rejected.
- Versioned, bounded read-only `resolveIcon` RPC so other plugins can read a project's manual icon, with an executable consumer example, revision revalidation and a capability matrix ([docs](docs/artwork-interoperability.md)). No peer plugin consumes it yet.
- Optional **Use Homepage artwork** action that previews Homepage 0.2.7+ image artwork as a snapshot and saves only on explicit Save; absent, disabled or incompatible Homepage, timeouts, unsafe or oversized images and project switches are handled without changing the current icon.

## 0.3.0 - 2026-11-02

### Added

- Display the installed plugin version in Project Icons settings.

- Automatic Unicode initials in the sidebar and Settings for projects without saved icons, with deterministic local colors and no stored assignment.

- Choose searchable built-in Feather glyphs or Unicode initials with contrasting colors, exact PNG previews and separate success-only local recent colors.

- Inspect current and draft PNG icons in an accessible enlarged dialog with separate close controls, keyboard support and a transparency background.

- Search a local licensed emoji catalog and keep bounded client-local recent choices. Preview exact transparent PNG snapshots before saving, with device-dependent pre-save rendering.

## 0.2.0 - 2026-10-27

No historical 0.1.0 release date is asserted.

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

- Show all projects in a responsive collection, with clear
  assigned/missing status, broken-preview fallback, wrapping names and spatial
  keyboard navigation and natural page scrolling
  ([#35](https://github.com/fogrew/bb-plugin-project-icons/issues/35)).
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

- Keep complete desktop project-card rows when opening the single inline editor,
  including partial final rows. Repeated header click or Enter/Space now folds
  and reopens it while preserving the same editor, draft and Undo deadline;
  folding never requests scrolling
  ([#39](https://github.com/fogrew/bb-plugin-project-icons/issues/39)).
- Reveal one inline project icon editor after explicit header activation, with
  compact mobile rows, visible expanded feedback and reduced-motion-aware viewport
  reveal. Preserve drafts and Undo through filtering and resize; keep editor keys
  separate from project navigation
  ([#37](https://github.com/fogrew/bb-plugin-project-icons/issues/37)).
- Reject malformed or truncated PNG assignments before saving while preserving
  existing icons, revision state and removal Undo offers
  ([#28](https://github.com/fogrew/bb-plugin-project-icons/issues/28)).
- Preserve legacy icon revision maxima before removal or project cleanup so
  reloads and clock rollback cannot reuse a previously cached icon URL
  ([#24](https://github.com/fogrew/bb-plugin-project-icons/issues/24)).
- Give crop sliders stable, clickable labels and accessible names across
  multiple editors ([#32](https://github.com/fogrew/bb-plugin-project-icons/issues/32)).
- Kept asynchronous icon changes and feedback attached to their initiating
  project when selection changes
  ([#3](https://github.com/fogrew/bb-plugin-project-icons/issues/3)).
