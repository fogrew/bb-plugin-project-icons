# Plugin artwork interoperability

Project Icons exposes a read-only icon resolution contract to other plugins and can import Homepage artwork as an explicit, previewed snapshot. Nothing here changes existing endpoints or storage.

## Capability matrix

Findings come from source inspection of the cited immutable revisions and the installed Plugin SDK types. None of it was exercised against a live BB or a live peer plugin.

| Plugin / version | Verified surface | Direction | Status |
| --- | --- | --- | --- |
| Homepage 0.2.7 ([server](https://github.com/yusuf8834/bb-homepage/blob/dbcb6f59362579fec5ff40b9fae094a541b29794/server.ts), [discovery](https://github.com/yusuf8834/bb-homepage/blob/dbcb6f59362579fec5ff40b9fae094a541b29794/src/project-icons.ts), MIT) | `getProjectArtwork({ projectId })` RPC returns `glyph` (with SVG), `image` (marker, no bytes) or `missing`; image bytes are served by `GET /project-icon?projectId=`; local branding and file discovery; 128-entry cache, found TTL 5 min, missing TTL 1 min | Inbound (Homepage to Project Icons) | Implemented here, optional. |
| Homepage 0.2.7 | Does not call Project Icons; its RPC forwards only `projectId` (no host or worktree selection); it reads `logo.light`, not `logo.dark` | Outbound (Project Icons to Homepage) | Needs an upstream Homepage change that calls `resolveIcon`. Not implemented; not a release promise. |
| Project Themes 0.1.0 ([source](https://github.com/lumenikoly/useful-bb-plugins/blob/e3d7dcaeb47c37e456f9bb1765338eb98f698188/plugins/project-themes/src/server.ts)) | Color `list/save/reset` RPC and `themes-changed` realtime event; no artwork export | None | Possible appearance partner (#13). |
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
| `found` | `projectId`, `revision`, `source: "manual"`, `theme: "any"`, `mimeType: "image/png"`, `width: 64`, `height: 64`, `sizeBytes`, `base64` (PNG bytes, at most 64 KiB) and `urlPath` |
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

## Precedence and loops

- Manual assignments are authoritative. Resolution returns only the manually saved image, never a live peer value.
- Import copies a snapshot. There is no synchronization: later Homepage changes do not update the saved icon, and a saved icon is never overwritten without pressing Save.
- Inbound RPCs reject plugin callers and `resolveIcon` never calls a peer, so Homepage consuming Project Icons later cannot create a feedback loop through this plugin. If Homepage adopts `resolveIcon` upstream, importing its artwork would copy this plugin's own icon back as an identical snapshot, which is harmless.
- No other plugin's private KV, database, cache or DOM is read.

## Evidence

| Evidence | What it shows | What it does not show |
| --- | --- | --- |
| `interop.test.mjs` (contract) | `resolveIcon` outcomes, revision/`ifRevision`, bounds, recursion, version negotiation; consumer example through a faked `plugins.callRpc` bridged to the real built server; `peerArtwork` outcomes (missing, disabled, incompatible, malformed, error, timeout, glyph, image, plugin caller rejected); bounded image fetch (SVG, ICO, oversized, truncated, 404) | A real BB RPC transport or a real peer plugin |
| `peer-artwork.browser.mjs` (component) | Real React and Chrome editor with mocked SDK, RPC and Homepage route: explicit action, preview with provenance, Save, failure states, project switch with delayed answer | Live BB, real Homepage artwork |
| Live | Not performed | Both directions against an installed Homepage; the plugin id `homepage` and route path are taken from source and the package name, and the `experimental_` RPC caller fields are unverified live |

## Follow-ups

- Adoption by Homepage (or any consumer) is a separate upstream change.
- Live verification with an installed Homepage in BB.
- Decoded pixel-dimension limits for imported images (shared with repository import; the 2 MB cap bounds compressed bytes only).
