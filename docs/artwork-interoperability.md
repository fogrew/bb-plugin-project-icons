# Plugin artwork interoperability

Project Icons exposes a read-only icon resolution contract to other plugins, adopts artwork that installed plugins already have for a project, and can import Homepage artwork as an explicit, previewed snapshot. Nothing here changes existing endpoints; adoption adds two storage keys (`adoption`, `automaticAdoption`).

## Capability matrix

Findings come from source inspection of the cited immutable revisions and the installed Plugin SDK types. None of it was exercised against a live BB or a live peer plugin.

| Plugin / version | Verified surface | Direction | Status |
| --- | --- | --- | --- |
| Homepage 0.2.7 ([server](https://github.com/yusuf8834/bb-homepage/blob/dbcb6f59362579fec5ff40b9fae094a541b29794/server.ts), [discovery](https://github.com/yusuf8834/bb-homepage/blob/dbcb6f59362579fec5ff40b9fae094a541b29794/src/project-icons.ts), MIT) | `getProjectArtwork({ projectId })` RPC returns `glyph` (with SVG), `image` (marker, no bytes) or `missing`; image bytes are served by `GET /project-icon?projectId=` (this plugin reads at most 2 MB); local branding and file discovery; 128-entry cache, found TTL 5 min, missing TTL 1 min | Inbound (Homepage to Project Icons) | Implemented here, optional: manual snapshot and automatic adoption. |
| Cursor Sidebar 0.3.5 ([source](https://github.com/wy3z/bb-cursor-suite/tree/16f5a896fee8/plugins/cursor-sidebar)) | `listProjectIcons({})` returns `{ icons: [{ projectId, icon }] }`; `icon` is an opaque glyph, emoji or monogram string, or a data URL of at most 256 KiB (the plugin writes PNG; this plugin accepts PNG, JPEG and WebP data URLs of at most 256 KiB) | Inbound | Implemented, automatic adoption only; non-image values are ignored. |
| Nest 0.5.0 ([source](https://github.com/euanguo/euanguo-plugins/tree/8251228eab48/plugins/nested-sidebar)) | `listProjectIcons({})` returns `{ icons: [{ projectId, icon: { src, label, source } or null }] }`; `src` is a favicon data URL of any mime type | Inbound | Implemented, automatic adoption only; SVG and ICO are ignored. |
| Chat Sidebar 0.2.8 ([source](https://github.com/seoperin/bb-plugin-chat-sidebar/tree/902ec817ea47)) | `images_get(null)` returns `{ "project:<id>": dataURL }`, PNG, WebP or JPEG, at most 200,000 characters each; marked experimental by its author | Inbound | Implemented, automatic adoption only. |
| BB Sidebar 0.3.9 ([source](https://github.com/yusuf8834/bb-sidebar/tree/1741aa6ec97e)) | `listProjectIconSettings` carries no bytes; the image is a browser-session route that also takes an environment id and can return SVG or ICO | Inbound | Not implemented: the route contract is unverified here. |
| Threadspace 0.2.2 ([source](https://github.com/KosachMax/threadspace/tree/20b53ff8194b)) | `appearance_get` returns `{ emoji, color }`, with a folder emoji as the default value | Inbound | Not implemented: it is an emoji and colour choice, not artwork, and its default is indistinguishable from a choice. |
| Homepage 0.2.7 | Does not call Project Icons; its RPC forwards only `projectId` (no host or worktree selection); it reads `logo.light`, not `logo.dark` | Outbound (Project Icons to Homepage) | Needs an upstream Homepage change that calls `resolveIcon`. Not implemented; not a release promise. |
| Project Themes 0.1.0 ([source](https://github.com/lumenikoly/useful-bb-plugins/blob/e3d7dcaeb47c37e456f9bb1765338eb98f698188/plugins/project-themes/src/server.ts)) | Color `list/save/reset` RPC and `themes-changed` realtime event; no artwork export | None | Possible appearance partner (#13). A colour for automatic initials is a follow-up, not part of adoption. |
| Project Colors 0.1.4 ([source](https://github.com/ninjasweb/bb-project-colors/blob/aca04c16703421365f160369f7af8edd604cc246/app.tsx)) | Browser localStorage and a DOM change event; no server RPC | None | Compatibility QA only. Private browser storage is never read. |
| Agent Board 0.7.0 / Focus Board 1.6.0 | `plugins.callRpc` used for unrelated integrations | Potential consumers | No inspected artwork adoption. |

Plugin SDK `@get-bb/plugin-sdk` 0.6.104 (the version this repository builds against) provides `bb.sdk.plugins.list()` (id, version, `enabled`, `status`) and `bb.sdk.plugins.callRpc({ pluginId, method, input, outputSchema, signal })`; handlers see `experimental_caller` (`plugin` or `client`). The `experimental_` name means the shape may change between SDK versions.

## Outbound: `resolveIcon` (contract version 1)

A consumer plugin calls the `project-icons` plugin's `resolveIcon` RPC:

```ts
bb.sdk.plugins.callRpc({
  pluginId: "project-icons", method: "resolveIcon", signal, outputSchema,
  input: { version: 1, projectId, ifRevision, trail: ["my-plugin"], theme: "dark" },
});
```

Input (strict; unknown keys are rejected): `version` (integer, required), `projectId` (1-64 characters), optional `ifRevision`, `trail` (at most 8 plugin ids) and `theme` (`light` or `dark`).

| `status` | Meaning |
| --- | --- |
| `found` | `projectId`, `revision`, `source: "manual"`, `theme: "any"`, `mimeType: "image/png"`, `width: 64`, `height: 64`, `sizeBytes`, `base64` (PNG bytes, at most 64 KiB), `urlPath` and, only for an auto-adopted icon, `adoptedFrom` (the source plugin id). `source` stays `"manual"` in version 1 and means a stored snapshot, never a live peer value |
| `not-modified` | `ifRevision` equals the current revision; keep your cached copy |
| `missing` | The project has no saved image. Glyph, emoji and initials presets that were saved as icons are exported like any image; automatic initials that were never saved are not |
| `unknown-project` | The id is malformed or not a BB project |
| `unsupported-version` | `version` is not 1; `supportedVersions` lists what is accepted |
| `recursive` | `trail` already contains `project-icons` |

Every response carries `version: 1`. Consumers must tolerate unknown future `status` values as "no icon".

- **Revisions** are monotonic per plugin storage and never reused after save, removal or project cleanup. Use `ifRevision` for cheap revalidation. The existing realtime `changed` event (`{ projectId }`) is published for this plugin's own app and is not part of this contract; consumers revalidate with `ifRevision` and a short TTL.
- **Themes** are optional: stored icons are single images, so `theme` is accepted and ignored and `found.theme` is always `any`.
- **Bounds:** one project per call, a single PNG of at most 64 KiB, no listing and no mutation. Resolution only reads this plugin's own storage and never calls another plugin, so provider chains cannot loop; `trail` lets a chaining consumer stop early.
- **URL transport:** `urlPath` is the authenticated local route `/api/v1/plugins/project-icons/http/icon?projectId=&v=`. It works from a browser session only. Do not publish it as a public URL and do not assume a server-side fetch can reuse browser authentication; server consumers should use `base64`.
- The existing `list`, `/icons` and `/icon` endpoints are unchanged.

The executable consumer example is [`examples/artwork-consumer.ts`](../examples/artwork-consumer.ts): `createIconResolver(bb, consumerId)` resolves through `plugins.callRpc`, caches by revision, revalidates with `ifRevision` after a 60 s TTL and keeps serving the stale copy when the provider is disabled. [`interop.test.mjs`](../interop.test.mjs) drives it against the real built server.

## Inbound: Homepage artwork

The image editor has a **Use Homepage artwork** button. Nothing is probed until it is pressed.

1. The server RPC `peerArtwork` (plugin callers are rejected; any non-plugin client may call it) lists plugins, requires `homepage` 0.2.7 or newer that is enabled and `running` or `degraded`, and calls its `getProjectArtwork` with a 5 s timeout. Replies are validated; anything else is `malformed`.
2. Outcomes: `unavailable` (`not-installed`, `disabled`, `incompatible`, `not-running`, `timeout`, `error`, `malformed`), `none`, `glyph` and `image`. A glyph is an SVG and is never rendered or imported.
3. For `image`, the browser fetches `/api/v1/plugins/homepage/http/project-icon?projectId=` with its own session (`same-origin`, redirects refused). The body is read with a 2 MB cap and a 10 s timeout, must start with PNG, JPEG or WebP magic bytes, and is handed to the existing editor as a file: the normal decoder, crop, 64 x 64 PNG rasterization and 64 KiB validation apply. SVG, ICO and GIF are rejected.
4. The editor shows the draft with a provenance note. The icon changes only after **Save**; when a manual icon already exists the note says saving replaces it.

Switching project, cancelling the draft, closing the editor or starting another action discards in-flight work (the fetch is aborted and late answers are ignored).

## Inbound: automatic adoption

Automatic adoption copies artwork from installed plugins into the project's own stored icon. It is on by default and can be switched off with the global toggle in Settings.

**Peers and priority.** A project with no icon takes artwork from the first peer that has usable artwork: Homepage, Cursor Sidebar, Nest, Chat Sidebar. A refresh of an already adopted icon asks only the plugin it came from, so a project never switches source because a higher-priority plugin appears later. Vanished peer artwork keeps the stored icon.

**Detection.** The server `adoptionScan` RPC (plugin callers are rejected) lists plugins and requires each peer to be enabled, `running` or `degraded`, and at its minimum version (Homepage 0.2.7, Cursor Sidebar 0.3.5, Nest 0.5.0, Chat Sidebar 0.2.8: the versions whose source was read). Each peer call has a 5 s timeout and the scan a 30 s one. Scans are queued so peers never see overlapping scans. At most 20 projects are examined per scan (rotating) and 12 candidates returned. Replies are shape-checked and a reply whose serialized size exceeds 12 MB is rejected. A malformed, failing or slow peer never throws. If a peer that is installed and enabled fails, times out, is `not-running` or returns an oversize or malformed reply, the projects it would serve are skipped for that scan rather than falling through to a lower-priority peer, so a transient failure cannot pin a project to a lesser source. A disabled, not installed or incompatible peer is skipped as if absent. Method names and shapes were found in source, are undocumented and may change.

**Image rules.** Inline images must be a `data:image/(png|jpeg|webp);base64,` URL of at most 256 KiB whose magic bytes match the declared type (SVG, ICO and mismatches are dropped) and whose size, read from the PNG, JPEG or WebP header, is at most 4096 px per side and 16 megapixels. Homepage images are fetched by the browser with the same bounds as the manual import (2 MB, magic bytes, dimensions).

**Normalisation.** Candidates go to the app overlay, which decodes them in the browser and renders a 64 x 64 PNG on the same Fit canvas as a manual import. It then calls `adoptPeer` with that PNG, the content hash of the original bytes (SHA-256, or a non-cryptographic fallback outside secure contexts) and the revision it saw. The server validates the PNG with the same strict decoder as `save`.

**Provenance and policy.** The server stores one record per project in the `adoption` key: `manual`, or `peer` with source plugin id, import time, content hash and the icon revision it produced. `adoptPeer` succeeds only when automatic adoption is on, the project exists, its record is not `manual`, the revision matches what the scan saw and, for a refresh, the peer is the recorded source and the hash differs. Everything else is `skipped` with a reason (`disabled`, `manual`, `stale`, `unchanged`, `unknown-project`). The write path is serialised with saves, so a user edit made after a scan always wins.

- A project without a record that already has an icon (anything saved before this feature) is manual.
- `save`, `remove` and `removeWithUndo` mark the project manual before touching storage, so a crash can leave an icon without provenance but never an auto-overwritable manual one. A removal followed by Undo leaves the project manual (the restored icon has no provenance). A project whose icon was removed before this feature shipped has no record and is therefore eligible for adoption.
- A record whose revision no longer matches the stored icon, or that fails validation, is treated as manual.
- **Re-enable automatic icons** (`enableAutomatic`) clears a manual record only while the project has no icon; with an icon it returns `has-icon`.
- Records of deleted projects are removed on the next list or scan.

**When it runs.** In the app overlay about 3 s after BB loads, every 10 minutes while the tab is visible, when the tab becomes visible again, on the plugin's own realtime `changed` event, and when the toggle or re-enable action is used. A run is single-flight and, unless forced by that action, at most once per 30 s, with at most three scan rounds. The adopter skips an item whose image failed to decode, normalise or save for 30 minutes (or until the peer's value changes), and does not re-fetch an unchanged Homepage image for 30 minutes; a user action clears both. It needs an open BB window because decoding uses the browser; with no window open nothing is adopted until one opens.

**Safety.** Adopted bytes are untrusted peer data: they are bounded, sniffed, re-rendered and re-validated before storage. No other plugin's storage, database, cache or DOM is read, and log lines name only the peer id.

## Precedence and loops

- Manual assignments are authoritative. Resolution returns only the manually saved image, never a live peer value.
- The manual **Use Homepage artwork** import copies a snapshot that is saved only on Save, and a manual save is never overwritten. Automatic adoption refreshes an icon only while it is still auto-imported from the same peer.
- A consumer can detect an adopted copy through `adoptedFrom` and ignore it when it equals its own plugin id.
- Inbound RPCs reject plugin callers and `resolveIcon` never calls a peer, so Homepage consuming Project Icons later cannot create a feedback loop through this plugin. If Homepage adopts `resolveIcon` upstream, importing its artwork would copy this plugin's own icon back as an identical snapshot, which is harmless.
- No other plugin's private KV, database, cache or DOM is read.

## Evidence

| Evidence | What it shows | What it does not show |
| --- | --- | --- |
| `interop.test.mjs` (contract) | `resolveIcon` outcomes, revision/`ifRevision`, bounds, recursion, version negotiation; consumer example through a faked `plugins.callRpc` bridged to the real built server; `peerArtwork` outcomes (missing, disabled, incompatible, malformed, error, timeout, glyph, image, plugin caller rejected); bounded image fetch (SVG, ICO, oversized, truncated, 404) | A real BB RPC transport or a real peer plugin |
| `peer-artwork.browser.mjs` (component) | Real React and Chrome editor with mocked SDK, RPC and Homepage route: explicit action, preview with provenance, Save, failure states, project switch with delayed answer | Live BB, real Homepage artwork |
| `adoption.test.mjs`, `auto-adopt.test.mjs` (contract and unit) | Fake peers for Homepage, Cursor Sidebar, Nest and Chat Sidebar through the real built server: absent, disabled, old, slow and malformed peers; SVG, oversize, mismatched and oversize-pixel images; adoption on first run; no overwrite after a manual save, removal or concurrent edit; refresh only while still auto and only for the same peer; the global toggle; priority. The browser-side adopter loop (rate limit, single flight, failures, rounds) runs against a fake RPC client | Real peer reply shapes at runtime, real browser decoding |
| `auto-adopt.browser.mjs` (component) | Real React and Chrome: source label, toggle, Re-enable action, and canvas normalisation of PNG, JPEG, WebP and a Homepage-style route into 64 x 64 PNGs, with a corrupt image skipped | Live BB, any real peer plugin |
| Live | Not performed. Homepage is the only supported peer installed on the development machine, and it has no artwork for its local projects | Both directions against an installed Homepage; the plugin id `homepage` and route path are taken from source and the package name, and the `experimental_` RPC caller fields are unverified live |

## Follow-ups

- Adoption by Homepage (or any consumer) is a separate upstream change.
- BB Sidebar adapter, Threadspace emoji and a Project Themes colour for automatic initials are tracked as follow-up issues.
- Decoding happens in the browser, so adoption waits for an open BB window.
- Live verification with an installed Homepage in BB.
- Decoded pixel-dimension limits for imported images (shared with repository import; the 2 MB cap bounds compressed bytes only).
