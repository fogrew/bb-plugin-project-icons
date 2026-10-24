# Project Icons for BB

Project Icons adds uploaded images beside project names in BB's native thread list. It keeps the existing project grouping, thread rows and status indicators, and works alongside Simple Sidebar Folders. It does not color sidebar rows.

## Install

```sh
bb plugin install https://github.com/fogrew/bb-plugin-project-icons.git
```

BB loads third-party plugins with full trust. Review the source before installing. This command tracks the repository's default branch.

## Use

Open **Settings → Installed plugins → Project Icons**. Search by project name or project ID, then choose a row to edit its icon. Rows show the current icon; duplicate names also show their project IDs. Use Tab or the arrow keys to move through rows, and Enter or Space to select. Filtering and realtime updates retain the selected project while it still exists.

Choose a PNG, JPEG, or WebP image to open a draft. **Fit** keeps the whole image visible; **Fill** covers the square and crops the edges. Adjust zoom and X/Y offsets with the sliders (Tab to focus, arrow keys to adjust). Check the enlarged preview and actual 20 px sample beside the project name, then choose **Save**. **Cancel** preserves the existing icon. Switching projects cancels the draft and pending image decoding. Failed saves preserve the previous icon and allow retrying. Choose **Remove icon** to restore that project's ordinary heading. Projects without an assigned image keep their usual appearance. Loading, empty results and failures have explicit messages; failed project refreshes can be retried.

Source images must be under 2 MB. The browser renders the crop into a transparent 64 × 64 PNG, preserving its proportions; the processed PNG must be at most 64 KiB. The server independently checks the encoding, PNG signature, dimensions, size, and project ID. SVG is unsupported.

Choose **Emoji** to browse 72 local Unicode Emoji 15.1 choices. Search English names or an exact emoji; skin tone variants are separate named choices. Tab enters each group, arrows move between choices, Home/End reach the first/last choice, and Enter or Space selects. Escape cancels the emoji draft and returns focus to search. Image/Emoji tabs support Left/Right and Home/End.

Emoji use your browser's locally installed emoji fonts. Before saving, appearance and sequence support depend on the device, browser and fonts: flags, skin tones, keycaps or ZWJ combinations may show separate symbols or missing glyphs. The enlarged and actual 20 px previews show the exact transparent PNG bytes sent on Save, rather than a second text rendering. Check these previews before saving. Clients of the same server receive that saved appearance; fonts and artwork are never downloaded or bundled. The small catalog and its license are documented in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

Switching source discards its draft; switching projects, Cancel and closing the editor invalidate pending rendering. Failed saves keep the draft for retry. Cancellation cannot roll back a save RPC already sent. Resetting a draft leaves the saved assignment intact; **Remove icon** remains the separate assignment action.

Recent emoji contain at most 12 known catalog IDs, recorded only after a confirmed successful Save of the still-active draft. **Clear recents** clears this preference. History is local to this browser profile, origin and plugin, shared across projects; it does not sync to another client and is not isolated between accounts sharing that profile/origin. It contains no project IDs, search queries, images or timestamps. Blocked storage falls back to memory while the chooser is mounted.

All sources still store the same normalized PNG assignment; no semantic emoji field or storage migration is introduced. Existing PNG assignments remain readable. Server checks cover base64 encoding, byte bounds and PNG header/dimensions, not complete PNG integrity; stronger validation is tracked in [issue #28](https://github.com/fogrew/bb-plugin-project-icons/issues/28).

BB stores icons in the plugin's server-side storage and serves them through same-origin plugin routes. Desktop and remote browsers connected to the same BB server share the assignments. Changes update open clients through BB realtime events and also refresh when a tab regains focus.

For project headings with an image, Project Icons hides the Project Colors dot to avoid showing two icons. Project Colors remains installed and controls other projects as before.

## Compatibility

BB has no native project image field. This plugin enhances the native thread-list project headings through a content script using BB 0.46's `data-sidebar-project-id` and heading DOM. A future BB sidebar markup change may require a plugin update. Other project pickers do not show these images.

## Develop

Requires BB 0.46 or newer, Node.js and npm for local development. From the repository directory:

```sh
npm ci
npm run check
bb plugin install .
```

`npm run check` typechecks, builds the plugin, and runs the backend tests. The tests use the built `dist/server.js`; run `npm run build` before running `npm test` alone. BB manages the installed plugin's icon data outside this repository.

Run `node --test settings-state.test.mjs` on a Node.js version with built-in TypeScript support to check search, selection retention, out-of-order refreshes and project-scoped mutations. These tests use only Node's test runner and do not require a running BB installation. They are separate from the current `npm run check` command while CI integration is pending.

Run `node --test image-processing.test.mjs settings-state.test.mjs` for image geometry, transparent rendering policy, draft ownership, cancellation and asynchronous resource disposal regressions. These tests are separate from `npm run check` until CI issue #2 integrates root test discovery. Browser image decoding, pixel transparency and keyboard interaction still require live verification.

Run `node --test emoji.test.mjs` for catalog, search, recents and PNG snapshot checks. The finite browser component harness is documented in `scripts/check-emoji-browser.mjs`; it uses existing external React/esbuild installations and Chrome, with no package changes or persistent preview. Component checks do not verify a live BB installation, multi-client realtime or upgrade acceptance.
