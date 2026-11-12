# Project Icons for BB

Project Icons adds uploaded images beside project names in BB's native thread list. It keeps the existing project grouping, thread rows and status indicators, and works alongside Simple Sidebar Folders. It does not color sidebar rows.

## Install

Version 0.3.0 is in preparation. See the [release preparation and acceptance report](docs/release-0.3.0.md); its release date and publication remain pending.

```sh
bb plugin install https://github.com/fogrew/bb-plugin-project-icons.git
```

BB loads third-party plugins with full trust. Review the source before installing. This command tracks the repository's default branch.

## Use

Open **Settings → Installed plugins → Project Icons**. All projects appear in normal page flow: compact headers with 36 px images on phones, and a card grid on desktop. Each header shows its current image or automatic initials and **Icon assigned** or **Automatic initials**. An assigned image that fails to load shows **Preview unavailable** while retaining its assigned status. Duplicate names also show their project IDs, and long names wrap.

Search by project name or project ID to narrow the collection, with visible result counts. The initial overview keeps the editor closed. Activate a project by tapping its header or pressing Enter/Space to reveal the single editor immediately after it on phones. On desktop, the full-width editor follows the complete selected row, including a partial final row, so the cards keep their columns and row companions. The expanded indicator, chevron and **Fold editor** action show which project is open. Repeating activation folds it; activating it again reopens it. Folding keeps the same hidden editor, draft and Undo deadline, performs no write and requests no scrolling. Only explicit opening may scroll as far as needed to reveal the start of the controls, respecting reduced motion. Refresh and realtime do not move focus or request scrolling. Resizing, filtering and realtime reordering preserve the same panel, editor, file input and draft.

Tab follows the headers and open editor controls in DOM order. Arrow keys follow the visible header rows and columns without selecting or opening; Home/End focus the first/last header. Editor controls keep their native keyboard behavior. Arrow Down from search focuses the first result. Filtering retains the selected project while it still exists. If its editor is open and its header does not match the search, that header remains after the results with an explicit explanation and the same editor. The result count excludes this retained header; even a no-match search keeps its draft and Undo available alongside Clear search.

Choose a PNG, JPEG, WebP, or ICO image to open a draft (for an ICO, the largest valid entry is used). **Fit** keeps the whole image visible; **Fill** covers the square and crops the edges. Adjust zoom and X/Y offsets with the sliders (Tab to focus, arrow keys to adjust). Check the enlarged preview and actual 20 px sample beside the project name, then choose **Save**. **Cancel** preserves the existing icon. Switching projects cancels the draft and pending image results. An in-progress browser decode may still finish; its result is discarded and closed. Failed saves preserve the previous icon and allow retrying. Choose **Remove icon** to restore that project's automatic initials. Loading, empty results and failures have explicit messages; failed project refreshes can be retried.

Offset ranges follow the scaled image dimensions and zoom, so both source edges remain reachable. Changing Fit/Fill or zoom clamps offsets to the new range; choosing another image resets the draft to centered Fit.

Source images must be under 2 MB. This compressed-file limit is not a decoded-pixel or memory limit. The browser renders the crop into a transparent 64 × 64 PNG, preserving its proportions; the processed PNG must be at most 64 KiB. The server independently validates the complete bounded PNG pixel stream and project ID; see [PNG validation and compatibility](docs/png-validation.md) for supported formats, limits and existing-data handling. SVG is unsupported.

The image area accepts the file picker, file drag-and-drop, or image paste while that area or its editor controls have focus. Tab to the image area to paste with the normal keyboard shortcut; search and text fields keep ordinary paste behavior. Only files are accepted, not image URLs or HTML. Choose one file at a time: multiple files produce an error and preserve the current draft. A new single file replaces the draft, including a pending decode; only the newest decode can become the preview. Invalid or unreadable images show an error and can be retried with the same file. During save/removal, new files are refused; wait for completion and try again. Switching projects cancels pending input and never transfers a draft to another project.

Removing an icon offers **Undo removal** for up to 15 seconds, with a visible deadline. A newer save/removal, project switch, capacity eviction or server/plugin reload can end the offer earlier. Undo restores only that exact deletion and never replaces a newer icon. See [the Undo contract](docs/removal-undo.md) for bounded retention, failure and reload behavior.

BB stores icons in the plugin's server-side storage and serves them through same-origin plugin routes. Desktop and remote browsers connected to the same BB server share the assignments. Changes update open clients through BB realtime events and also refresh when a tab regains focus.

For project headings with an image, Project Icons hides the Project Colors dot to avoid showing two icons. Project Colors remains installed and controls other projects as before.

Choose **Emoji** to browse 72 local Unicode Emoji 15.1 choices. Search English names or an exact emoji; skin tone variants are separate named choices. Tab enters each group, arrows move between choices, Home/End reach the first/last choice, and Enter or Space selects. Escape cancels the emoji draft and returns focus to search. Image/Emoji tabs support Left/Right and Home/End.

Emoji use your browser's locally installed emoji fonts. Before saving, appearance and sequence support depend on the device, browser and fonts: flags, skin tones, keycaps or ZWJ combinations may show separate symbols or missing glyphs. The enlarged and actual 20 px previews show the exact transparent PNG bytes sent on Save, rather than a second text rendering. Check these previews before saving. Clients of the same server receive that saved appearance; fonts and artwork are never downloaded or bundled. The small catalog and its license are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Switching source discards its draft; switching projects, Cancel and closing the editor invalidate pending rendering. Failed saves keep the draft for retry. Cancellation cannot roll back a save RPC already sent. Resetting a draft leaves the saved assignment intact; **Remove icon** remains the separate assignment action.

Recent emoji contain at most 12 known catalog IDs, recorded only after a confirmed successful Save of the still-active draft. **Clear recents** clears this preference. History is local to this browser profile, origin and plugin, shared across projects; it does not sync to another client and is not isolated between accounts sharing that profile/origin. It contains no project IDs, search queries, images or timestamps. Blocked storage falls back to memory while the chooser is mounted.

All sources retain normalized PNG storage. The accepted server validates PNG structure, CRC and decoded pixels independently; see [PNG validation](docs/png-validation.md). Existing assignments remain compatible.

## Plugin interoperability

Other plugins can read a project's stored icon through the versioned read-only `resolveIcon` RPC. In the other direction, Project Icons can use artwork that other installed plugins already have for a project:

- **Automatic adoption.** A project that has no icon takes artwork from the first installed supported plugin (Homepage, Cursor Sidebar, Nest, Chat Sidebar, BB Sidebar, Threadspace, in that order). BB Sidebar contributes only an icon its user chose (an upload or a project file), not the favicon it discovers; Threadspace contributes only an emoji its user chose, never its default folder. While an icon is still auto-imported, it is replaced when that same plugin's artwork changes. The editor and Settings show the source ("From Cursor Sidebar, imported ..."). Turn it off for every project with **Use artwork from installed plugins automatically** in Settings.
- **Manual choices win.** Saving or removing an icon marks that project manual for good; automatic adoption never touches it again. Icons that existed before this feature count as manual. Undoing a removal leaves the project manual too. A project whose icon was removed before this version was installed has no record, so it is treated as new and can receive peer artwork; turn the toggle off first if you do not want that. To opt a project back in, remove its icon and choose **Re-enable automatic icons** in the editor.
- **One source per project.** A project adopted from one plugin is refreshed only from that plugin and is never offered another plugin's icon, not even one from a higher-priority plugin that appears later.
- **Needs an open BB window.** Images are decoded in the browser with the same 64 x 64 PNG pipeline as manual imports, and Homepage images need the browser session. A scan runs shortly after BB loads, every 10 minutes while the tab is visible, and when you change these settings; it is rate limited and never blocks the UI.
- **Colour hints.** Projects that still show automatic initials use the colour from Project Themes (or, failing that, Threadspace) as the initials background, keeping at least 4.5:1 contrast for the lettering. Hints are never stored, never replace a saved icon, and follow the same Settings toggle. They refresh when BB regains focus and about once a minute while it is visible. When the hints cannot be read, BB keeps showing the last colours it had; only a successful answer replaces them.
- **Explicit snapshot.** **Use Homepage artwork** in the image editor still previews Homepage artwork and saves it only on Save.

See [Plugin artwork interoperability](docs/artwork-interoperability.md) for the contract, precedence, limits and evidence boundaries, and [Compatibility](#compatibility) for the plugins involved. No peer plugin consumes Project Icons today.

## Compatibility

This section comes from reading each plugin's source at the versions named below and from read-only RPC calls on one machine. It was not verified with those plugins running next to Project Icons in a live BB, except where stated.

### Peer RPCs are undocumented

BB publishes no project-icon interface. The method names and reply shapes Project Icons reads from other plugins were found in their source code; they are not published contracts, and a new release of any of those plugins (or of BB's experimental plugin SDK) can change them. Project Icons checks the peer's installed version, validates every reply, bounds and sniffs every image (PNG, JPEG or WebP only, at most 256 KiB inline or 2 MB over HTTP, at most 4096 px per side), ignores a reply larger than 12 MB, and ignores a peer that does not match. Every call goes through one guard: the plugin must be installed, enabled and running at a known version; the method is probed by calling it (BB lists only the RPC methods a plugin marks discoverable, and none of these peers does), a method BB reports as unknown is remembered as missing for that peer version for 30 minutes (one minute when seen right after the plugin changed state), and is probed again when the plugin's version, enabled flag or status changes; each call has a 5 second timeout; and every field of the reply is checked for its type before use, only own properties of peer objects are read (never `__proto__`, `constructor` or similar keys), and a missing, null or wrongly typed field drops that one entry. Any failure degrades silently to "peer absent" without touching the sidebar. A change therefore stops adoption from that plugin without affecting the sidebar. If a higher-priority plugin is installed but fails, times out or is not running, the projects it would serve wait for the next scan instead of taking artwork from a lower-priority plugin; a disabled or too-old plugin is simply skipped. A failing image is not retried for 30 minutes unless the peer's value changes.

### Artwork Project Icons consumes

| Plugin (id) | Version checked | What is read |
| --- | --- | --- |
| Homepage (`homepage`) | 0.2.7+ | `getProjectArtwork` says an image exists; the browser fetches `/project-icon` with its own session (at most 2 MB) |
| Cursor Sidebar (`cursor-sidebar`) | 0.3.5+ | `listProjectIcons`: PNG, JPEG or WebP data URLs of at most 256 KiB; glyph, emoji and monogram values are ignored |
| Nest (`nested-sidebar`) | 0.5.0+ | `listProjectIcons`: favicon data URLs; SVG and ICO are ignored |
| Chat Sidebar (`chat-sidebar`) | 0.2.8+ | `images_get`: `project:<id>` entries |
| BB Sidebar (`bb-sidebar`) | 0.3.9+ | `listProjectIconSettings` says a project has a chosen upload or file path; the browser then fetches `/project-icon` with its own session (at most 2 MB; SVG and ICO are rejected: such a path icon is skipped and retried after 30 minutes, and never falls through to a lower-priority plugin's icon). An environment is looked up through BB for path icons and left out when none matches, so BB Sidebar uses the project's default host |
| Threadspace (`threadspace`) | 0.2.2+ | `appearance_get`: a chosen emoji, drawn locally to a transparent 64 x 64 PNG; its default folder emoji, a cleared emoji and anything that is not one emoji are ignored |

### Colour hints Project Icons consumes

| Plugin (id) | Version checked | What is read |
| --- | --- | --- |
| Project Themes (`project-themes`) | 0.1.0+ | `list`: the `#rrggbb` colour of a project whose theme has at least one surface switched on |
| Threadspace (`threadspace`) | 0.2.2+ | `appearance_get`: the colour name, mapped to a fixed palette; `default` and unknown names are ignored |

### Undocumented RPC risk per peer

None of these methods is a published contract. Each row names what was read at which source revision and what happens if the peer changes it.

| Peer | Call (source) | If it changes |
| --- | --- | --- |
| Homepage 0.2.7 | `getProjectArtwork`, route `/project-icon` ([server.ts](https://github.com/yusuf8834/bb-homepage/blob/26ce35049407/server.ts)) | No adoption from Homepage until the shape matches again |
| Cursor Sidebar 0.3.5 | `listProjectIcons` ([src/server.ts](https://github.com/wy3z/bb-cursor-suite/blob/16f5a896fee8/plugins/cursor-sidebar/src/server.ts)) | Same |
| Nest 0.5.0 | `listProjectIcons` ([contract.ts](https://github.com/euanguo/euanguo-plugins/blob/8251228eab48/plugins/nested-sidebar/server/contract.ts)) | Same |
| Chat Sidebar 0.2.8 | `images_get`, marked experimental by its author ([lib/rpc.ts](https://github.com/seoperin/bb-plugin-chat-sidebar/blob/902ec817ea47/lib/rpc.ts)) | Same |
| BB Sidebar 0.3.9 | `listProjectIconSettings` ([contract.ts](https://github.com/yusuf8834/bb-sidebar/blob/1741aa6ec97e/src/contract.ts)) and route `/project-icon` ([server.ts](https://github.com/yusuf8834/bb-sidebar/blob/1741aa6ec97e/src/server.ts)); its `environmentId` query parameter is optional and defaults to the project's default host ([server-project-icons.ts](https://github.com/yusuf8834/bb-sidebar/blob/1741aa6ec97e/src/server-project-icons.ts)) | No adoption from BB Sidebar. A project whose environment lookup fails is skipped and keeps waiting rather than taking a lower-priority icon |
| Threadspace 0.2.2 | `appearance_get` ([server.ts](https://github.com/KosachMax/threadspace/blob/20b53ff8194b/server.ts)); its default `{ emoji: "📁", color: "default" }` ([preferences.ts](https://github.com/KosachMax/threadspace/blob/20b53ff8194b/src/preferences.ts)) | No emoji icon and no colour hint. A changed default would import that default once, because a default cannot be told from a choice |
| Project Themes 0.1.0 | `list` ([server.ts](https://github.com/lumenikoly/useful-bb-plugins/blob/ca95d1932e80/plugins/project-themes/src/server.ts)) | Initials keep their palette colour |

BB's plugin SDK only lets an app subscribe to its own realtime channels, so Project Themes' `themes-changed` and Threadspace's `appearance-changed` events are not received. Hints are re-read on focus and about once a minute, and the server reuses an answer for 20 seconds.

Not consumed: Dockside, Compact UI, Nest and Chat Sidebar colours or hues, BB Sidebar colours, and Chat Tabs (a settings string). Project Colors keeps its colours in browser `localStorage` and is never read.

### Plugins that coexist

Simple Sidebar Folders, Project Page, Thread Hover Cards, Sessions Switcher, Chat Tabs and Project Themes work next to Project Icons: they act on other elements (folder order, title links, row tints, tabs) or show no project visuals. Project Themes' colour is additionally read as a hint for automatic initials. Compact UI and Pane Workspaces colour the project label beside our image. Homepage shows its own artwork on the homepage only.

**Project Colors:** on any project heading that shows our image, Project Icons hides the Project Colors dot and its palette, so two icons are not shown. Row tint and title colour stay, and the palette remains available from the thread header action. You lose the sidebar colour picker while an icon is shown.

### Plugins that replace the thread list

Plugins that replace BB's sidebar thread list (for example Cursor Sidebar, Nest, BB Sidebar, Chat Sidebar, Threadspace, Dockside, Ultra Sidebar and Tinted Threads) draw their own rows. Project Icons only decorates BB's native project headings, so while one of them is active our images may not appear in its list. Ultra Sidebar draws its own heading and favicon, so the two icon systems do not overlap. Tinted Threads likely reuses the native heading markup, which was not verified live. Adoption can still copy those plugins' artwork into Project Icons. Minus can hide a whole project group, including its image.

### Where the editor is reachable

BB has no extension slot for its native project menu, so the editor cannot be added there. Open it from **Edit project icon** in the thread actions menu, the thread header action or the Homepage project section, or from Settings.

## Preview and host notes

Use the current or enlarged draft PNG button to inspect it in a modal preview. Close preview or Escape returns to the editor without saving or cancelling its draft. The checkerboard shows transparency; the close control stays above the image. See [preview validation and host limitations](docs/png-preview.md).

BB has no native project image field. This plugin enhances the native thread-list project headings through a content script using BB 0.46's `data-sidebar-project-id` and heading DOM. A future BB sidebar markup change may require a plugin update. Other project pickers do not show these images.

## Develop

Requires BB 0.46 or newer, npm, and Node.js 22.19 or newer in the 22.x line, 24.x, or 26.x for local development. From the repository directory:

```sh
npm ci
npm run check
bb plugin install .
```

`npm run check` validates branch and manifest conventions, typechecks, builds the plugin with the pinned standalone toolchain, and runs all root `*.test.mjs` and `scripts/*.test.mjs` suites. This includes backend, image-processing, settings-state and build/quality-validator tests. Tests use the built `dist/server.js`; run `npm run build` before running `npm test` alone. BB manages the installed plugin's icon data outside this repository.

For a focused settings-state check, run `node --test settings-state.test.mjs`. It covers search, selection retention, out-of-order refreshes and project-scoped mutations using only Node's test runner, without a running BB installation. These tests also run through `npm run check` and the Ubuntu/Node 24 pull request workflow. See [.github/README.md](.github/README.md) for CI scope, standalone build details and Windows native-install limitations.

For focused crop regressions, run `node --test image-processing.test.mjs settings-state.test.mjs`. These suites are included in `npm run check` and CI. They cover image geometry, transparent-canvas policy, draft ownership, cancellation and resource disposal; they do not replace live host integration checks.

For focused input regressions, run `node --test image-input.test.mjs`. This suite is included in `npm run check` and CI. It covers file-event ownership, nested drag tracking, multiple-file policy and shared decoder validation using event/transfer doubles; it does not verify operating-system clipboard or native file dialogs.

For focused Undo regressions, build first, then run `node --test removal-undo.test.mjs undo-state.test.mjs`. These suites are included in `npm run check` and CI. They cover server authority, races, expiry, replay, legacy revision/cache safety, storage failures and client operation ownership. The fake host and state tests do not establish live BB or OS integration.

For the finite grid regression, install the temporary browser tooling below, run `npm run build`, then `node project-grid.browser.mjs`. It mounts the actual Settings component with a 12-project fixture, including assigned/missing/broken images, duplicate names and long names. It measures before/after row coordinates for every card at 768/1024/1440 px, including partial rows, and checks light/dark layouts at 320/375/768/1024/1440 px. It covers initial overview, mobile adjacency, complete desktop rows, viewport reveal, reduced motion, repeated pointer/Enter/Space folding, hidden-editor Tab exclusion, exact editor/panel/file-input identity and nondefault draft bytes through fold/filter/resize/realtime reordering, host-container resizing, spatial header navigation, native editor keys, search/counts, draft cancellation, busy guards, save ownership and removal/Undo with an unchanged deadline through folding. Results and screenshots are written under ignored `dist/project-grid-browser/`. To record the original #39 failures against the accepted pre-fix source, set `BUG39_BASELINE=1`; that mode records broken row membership and failed disclosures in `baseline.json` and requires both failures to reproduce. The finite local HTTP fixture and Chrome close on completion. SDK/RPC/realtime and host theme tokens are mocks; native React, DOM, PNG decoding and canvas are real. This is separate from default CI and does not establish installed-BB layout, remote-client, OS clipboard or file-dialog evidence.

For the finite crop-label regression, use the temporary browser tooling below,
run `npm run build`, then `node crop-labels.browser.mjs`. It checks native Chrome
slider names and clickable label associations across two editors, continuous
keyboard focus, pointer drag, Fill, and exact preview/save PNG bytes after an
injected encoding failure. Results are written under ignored
`dist/crop-labels-browser/`. SDK/RPC and theme tokens are fixtures; installed BB
integration and OS input are untested. This harness is separate from default CI.

For the optional finite component/browser harness, install temporary tooling with `npm install --no-save --package-lock=false --ignore-scripts react@19 react-dom@19 playwright-core`, run `npm run build`, then run `node image-input.browser.mjs`. It launches and closes headless Chrome, uses a local file fixture without a server, and writes results and a 320 px screenshot under ignored `dist/image-input-browser/`. Set `CHROME_PATH` if Chrome is elsewhere. The harness uses real React, DOM focus, PNG decoding and canvas rendering, with synthetic drop/paste events and fake RPC responses. It does not install/reload the plugin or establish live-BB, native file-dialog or OS clipboard evidence. This optional harness is separate from the default CI suite; package manifests remain unchanged by the temporary tooling install.

Choose **Glyph** for eight locally bundled Feather glyphs, searchable by English
name or keyword. Choose **Initials** for one or two grapheme clusters (up to 128
UTF-16 code units), preserving case, combining marks and compound sequences.
The project-name default takes the first grapheme from each of the first two
words, or the first two from a single word; Unicode whitespace and punctuation
separate words. An empty name uses `?`. Controls, lone surrogates and bidi
formatting controls are rejected. Initials use installed system fonts; font
coverage, complex-script shaping and color emoji vary by platform. Color emoji
may ignore the selected foreground. Check the encoded PNG at 20 px before Save.

Glyphs and initials share eight background colors with deterministic black or
white foreground, chosen for at least 4.5:1 mathematical contrast. Rounded
corners are transparent; the colored interior keeps contrast independent of the
sidebar theme. Recent colors store at most six known palette IDs separately from
emoji history. They update only after confirmed Save of the still-current draft;
**Clear recent colors** resets that client-local preference. Browser-profile,
origin, account-sharing and blocked-storage limits are the same as emoji recents.


See [Glyph and initials contract](docs/icon-presets.md) for source/license and verification details.

Projects without a saved assignment use automatic initials in the sidebar, Settings thumbnails and current preview. These reuse the Unicode rules and local palette above; project ID determines color, and renaming refreshes initials. Fallback PNGs are generated only in browser memory: they never change saved revisions, Undo or recents. Every explicit saved PNG takes priority. Remove reveals the fallback; Undo restores the exact saved PNG.

Run `node automatic-icons.browser.mjs` after building with the optional browser tooling above for the bounded native sidebar DOM fixture. It checks shared Unicode PNGs, empty/duplicate names, renaming, new rows, saved precedence, realtime removal/restoration and disposal including a late fetch. Results and a screenshot are in ignored `dist/automatic-icons-browser/`. Fetch responses are mocked; this does not prove installed BB integration. The grid harness also checks matching Settings fallback PNGs, name refresh and unchanged RPC-write/storage counts.
