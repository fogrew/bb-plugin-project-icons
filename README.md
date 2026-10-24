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

The image area accepts the file picker, file drag-and-drop, or image paste while that area or its editor controls have focus. Tab to the image area to paste with the normal keyboard shortcut; search and text fields keep ordinary paste behavior. Only files are accepted, not image URLs or HTML. Choose one file at a time: multiple files produce an error and preserve the current draft. A new single file replaces the draft, including a pending decode; only the newest decode can become the preview. Invalid or unreadable images show an error and can be retried with the same file. During save/removal, new files are refused; wait for completion and try again. Switching projects cancels pending input and never transfers a draft to another project.

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

Run `node --test image-input.test.mjs` for file-event ownership, nested drag tracking, multiple-file policy and shared decoder validation. These tests use event/transfer doubles; they do not verify operating-system clipboard or native file dialogs. Root tests will be discovered by CI issue #2 after integration.

For the optional finite component/browser harness, install temporary tooling with `npm install --no-save --package-lock=false --ignore-scripts cron-parser@5.10.2 react@19 react-dom@19 esbuild playwright-core`, then run `node image-input.browser.mjs`. It launches and closes headless Chrome, uses a local file fixture without a server, and writes results and a 320 px screenshot under ignored `dist/image-input-browser/`. Set `CHROME_PATH` if Chrome is elsewhere. The harness uses real React, DOM focus, PNG decoding and canvas rendering, with synthetic drop/paste events and fake RPC responses. It does not install/reload the plugin or establish live-BB, native file-dialog or OS clipboard evidence. The temporary cron-parser package also supplies a missing dependency in the baseline SDK backend harness; package manifests remain unchanged.
