# Project Icons for BB

Project Icons adds uploaded images beside project names in BB's native thread list. It keeps the existing project grouping, thread rows and status indicators, and works alongside Simple Sidebar Folders. It does not color sidebar rows.

## Install

```sh
bb plugin install https://github.com/fogrew/bb-plugin-project-icons.git
```

BB loads third-party plugins with full trust. Review the source before installing. This command tracks the repository's default branch.

## Use

Open **Settings → Installed plugins → Project Icons**. Search by project name or project ID, then choose a row to edit its icon. Rows show the current icon; duplicate names also show their project IDs. Use Tab or the arrow keys to move through rows, and Enter or Space to select. Filtering and realtime updates retain the selected project while it still exists.

Upload a PNG, JPEG, or WebP image and check the preview. Choose **Remove icon** to restore that project's ordinary heading. Projects without an assigned image keep their usual appearance. Loading, empty results and failures have explicit messages; failed project refreshes can be retried.

Source images must be under 2 MB. The browser fits the image into a transparent 64 × 64 PNG, preserving its proportions; the processed PNG must be at most 64 KiB. The server independently checks the encoding, PNG signature, dimensions, size, and project ID. SVG is unsupported.

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
