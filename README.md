# Project Icons for BB

Project Icons adds uploaded images beside project names in BB's native thread list. It keeps the existing project grouping, thread rows and status indicators, and works alongside Simple Sidebar Folders. It does not color sidebar rows.

## Install

```sh
bb plugin install https://github.com/fogrew/bb-plugin-project-icons.git
```

BB loads third-party plugins with full trust. Review the source before installing. This command tracks the repository's default branch.

## Use

Open **Settings → Installed plugins → Project Icons**. Search by project name or project ID, then choose a row to edit its icon. Rows show the current icon; duplicate names also show their project IDs. Use Tab or the arrow keys to move through rows, and Enter or Space to select. Filtering and realtime updates retain the selected project while it still exists.

Choose a PNG, JPEG, or WebP image to open a draft. **Fit** keeps the whole image visible; **Fill** covers the square and crops the edges. Adjust zoom and X/Y offsets with the sliders (Tab to focus, arrow keys to adjust). Check the enlarged preview and actual 20 px sample beside the project name, then choose **Save**. **Cancel** preserves the existing icon. Switching projects cancels the draft and pending image results. An in-progress browser decode may still finish; its result is discarded and closed. Failed saves preserve the previous icon and allow retrying. Choose **Remove icon** to restore that project's ordinary heading. Projects without an assigned image keep their usual appearance. Loading, empty results and failures have explicit messages; failed project refreshes can be retried.

Offset ranges follow the scaled image dimensions and zoom, so both source edges remain reachable. Changing Fit/Fill or zoom clamps offsets to the new range; choosing another image resets the draft to centered Fit.

Source images must be under 2 MB. This compressed-file limit is not a decoded-pixel or memory limit. The browser renders the crop into a transparent 64 × 64 PNG, preserving its proportions; the processed PNG must be at most 64 KiB. The server independently validates the complete bounded PNG pixel stream and project ID; see [PNG validation and compatibility](docs/png-validation.md) for supported formats, limits and existing-data handling. SVG is unsupported.

The image area accepts the file picker, file drag-and-drop, or image paste while that area or its editor controls have focus. Tab to the image area to paste with the normal keyboard shortcut; search and text fields keep ordinary paste behavior. Only files are accepted, not image URLs or HTML. Choose one file at a time: multiple files produce an error and preserve the current draft. A new single file replaces the draft, including a pending decode; only the newest decode can become the preview. Invalid or unreadable images show an error and can be retried with the same file. During save/removal, new files are refused; wait for completion and try again. Switching projects cancels pending input and never transfers a draft to another project.

Removing an icon offers **Undo removal** for up to 15 seconds, with a visible deadline. A newer save/removal, project switch, capacity eviction or server/plugin reload can end the offer earlier. Undo restores only that exact deletion and never replaces a newer icon. See [the Undo contract](docs/removal-undo.md) for bounded retention, failure and reload behavior.

BB stores icons in the plugin's server-side storage and serves them through same-origin plugin routes. Desktop and remote browsers connected to the same BB server share the assignments. Changes update open clients through BB realtime events and also refresh when a tab regains focus.

For project headings with an image, Project Icons hides the Project Colors dot to avoid showing two icons. Project Colors remains installed and controls other projects as before.

## Compatibility

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

For the finite crop-label regression, use the temporary browser tooling below,
run `npm run build`, then `node crop-labels.browser.mjs`. It checks native Chrome
slider names and clickable label associations across two editors, continuous
keyboard focus, pointer drag, Fill, and exact preview/save PNG bytes after an
injected encoding failure. Results are written under ignored
`dist/crop-labels-browser/`. SDK/RPC and theme tokens are fixtures; installed BB
integration and OS input are untested. This harness is separate from default CI.

For the optional finite component/browser harness, install temporary tooling with `npm install --no-save --package-lock=false --ignore-scripts react@19 react-dom@19 playwright-core`, run `npm run build`, then run `node image-input.browser.mjs`. It launches and closes headless Chrome, uses a local file fixture without a server, and writes results and a 320 px screenshot under ignored `dist/image-input-browser/`. Set `CHROME_PATH` if Chrome is elsewhere. The harness uses real React, DOM focus, PNG decoding and canvas rendering, with synthetic drop/paste events and fake RPC responses. It does not install/reload the plugin or establish live-BB, native file-dialog or OS clipboard evidence. This optional harness is separate from the default CI suite; package manifests remain unchanged by the temporary tooling install.
