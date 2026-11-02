# Built-in glyph and initials contract

All four sources use the existing 64 × 64 PNG assignment, at most 65,536 decoded
file bytes (base64 wire representation at most 87,384 characters). No server
schema, RPC, storage migration or semantic source field is added.

`usePngDraft` owns the encoded snapshot, render generation, project subscription,
explicit mutation outcome and successful-current-draft callback.
`DraftOutput` supplies the same actual PNG preview and Save/Cancel buttons for
Image, Emoji, Glyph and Initials. The image editor retains bitmap ownership,
decode disposal, Fit/Fill, clamped crop geometry and the resettable native input.
Crop controls mount for the lifetime of the decoded image, independently of the
encoded snapshot. A redraw clears the snapshot and disables Save while keeping
range/button DOM and focus intact, including after an encoding failure; another
adjustment retries encoding from the retained image.
Each crop control has a per-instance React useId-derived range ID and explicit
native label association. The label contains only its stable name: Zoom,
Horizontal offset (pixels), or Vertical offset (pixels). Numeric output is a
sibling outside the label, associated with the same range. This keeps names
stable without overriding native semantics with ARIA. The inherited baseline
label defect is also tracked separately in #32; no sibling implementation is
imported.
The source switch cancels synchronously, including an away-and-back switch in
one React batch. Project changes, Cancel and unmount invalidate pending work.
A failed Save retains the encoded draft. An RPC already dispatched cannot be
rolled back by cancelling or switching.

## Catalog and license evidence

The eight local glyphs derive from Feather v4.29.2, whose annotated tag
`24c23655d77f46af2d81bd48eabb3d81ada5f562` resolves to commit
`1b002399e8758fb2bccea4d07312dc9e0f43dcb8`.
[Primary source tree](https://github.com/feathericons/feather/tree/1b002399e8758fb2bccea4d07312dc9e0f43dcb8/icons).
The catalog converts polygon/polyline/line primitives into equivalent paths;
the original path data and 24-unit view box, 2-unit strokes, round caps/joins
are retained. A 2× scale and 8-pixel inset produce the saved glyph. The same fixed
data renders the accessible choice buttons. No arbitrary SVG input/parser,
remote asset fetch, private SDK import, bundled font or icon-library dependency
is introduced.

The following SHA-256 digests describe the exact upstream UTF-8 `icons/<id>.svg`
responses at that immutable commit, fetched during implementation:

| ID | Bytes | SHA-256 |
| --- | ---: | --- |
| folder | 274 | d479596013ee6703bb7bb30515c5306e8624499643d947d9b9576d9003650b33 |
| star | 301 | 270f826c022a34610f8ce0d608503ecadfe8b6e5a873ee06006a9838e3a512e5 |
| heart | 335 | edfe493d0a62b84e25f4e2d1c2df8a47dfe2a637a554b44970196f52c191eaae |
| code | 258 | c48ef4e5b91e5c306f71f06cfb283e4aafa4561fa1e8ef11b95b4461166fe3ee |
| terminal | 261 | 50bd627b68b0ef3c1c5146ccc4a462f0705d566cdf0aa34f0e33b3d51a2ea13e |
| cloud | 244 | 45a52d3b54fb60f3fcdfedf60644bf36348b1db1dfff3b11c40746584fbdee25 |
| bookmark | 248 | cc25f3f32004c76d1821efc019ea8ff229f771efb7ab2fc20650d4aca9f53b3b |
| zap | 245 | 85afd3069e5d060ee77624281756c923b972db40bef65e1d7a7669b58e185f1d |

The [upstream MIT license](https://github.com/feathericons/feather/blob/1b002399e8758fb2bccea4d07312dc9e0f43dcb8/LICENSE)
is 1,082 bytes, SHA-256
`308028e93fcf84972523cdf6e616f73168546b4953895f516d01287f16fe7bee`.
The complete license and copyright are retained in
[THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md). Its addition, including
provenance, costs 2,060 bytes; no license runtime is bundled.

Measured with BB 0.47.1 / build SDK 0.6.79, comparing an isolated archive of
reviewed base `b34a6d7c179bb55c07641b898f2cebe5de39b04b` with this implementation
using the same installed build tool:

| Artifact | Base bytes | Changed bytes | Delta | Base gzip | Changed gzip |
| --- | ---: | ---: | ---: | ---: | ---: |
| app.js | 24,530 | 32,405 | +7,875 | 9,064 | 11,836 |
| app.css | 10,376 | 11,354 | +978 | 1,994 | 2,096 |
| server.js | 208,596 | 208,596 | 0 | 60,899 | 60,899 |

Gzip uses Python's default compression with mtime zero. These are complete
production artifact costs, including the shared lifecycle and both sources,
rather than only the catalog strings. `lib/icon-presets.ts` is 4,027 bytes;
`lib/preset-rendering.ts` is 1,674 bytes. The manifest and lock are unchanged.
Typechecking uses the repository's SDK 0.6.49 declarations; the installed CLI
reports its newer SDK when building. This is a verification limit, not proof of
live compatibility on both SDK versions.

## Unicode, colors and local preferences

Initials explicitly accept one or two full `Intl.Segmenter("und")` grapheme
clusters, with a 128 UTF-16-code-unit input ceiling, no controls, lone surrogates
or bidi formatting controls. Input is trimmed, preserves case and is never
UTF-16-sliced. The project default groups already segmented graphemes by Unicode
whitespace/punctuation separators, then uses the first cluster of two words or
the first two clusters of one word; an empty name yields `?`. Separators are
detected after segmentation so keycaps such as `#️⃣` stay intact.

Modern browser `Intl.Segmenter`, Canvas and system-font coverage are required.
Installed fonts determine complex-script shaping and missing-glyph behavior;
color emoji may ignore the requested foreground. Text bounding-box measurements
fit the complete shaped string inside a 48 × 46 inset. No cross-platform
pre-save raster identity or universal font coverage is promised; saved PNG bytes
are shared unchanged.

Eight fixed palette IDs select backgrounds. Relative sRGB luminance chooses
black or white, whichever has higher contrast, always at least 4.5:1 for these
colors. The interior is opaque and corners transparent, keeping the intended
foreground/background contrast independent of theme. This mathematical ratio
does not guarantee every font/emoji remains legible at 20 px.

Glyph and Initials share `<pluginId>:color-recents:v1`: at most six known unique
palette IDs, MRU order. It is distinct from `emoji-recents:v1`. Only the callback
for an explicit, confirmed successful Save of the still-current generation and
project adds a color. Preview, failed/skipped/invalidated Save and switching do
not add one. Clear is an explicit local-preference action. Blocked storage uses
an in-memory fallback; malformed/oversized/unknown values cannot escape the
known-ID bound. Preferences are browser-profile/origin/plugin local, shared
across projects, neither account-isolated nor synced across clients.

## Accepted integration base

This branch is synchronized by an additive signed merge with accepted develop
a3fc59bc9839d46e05011a0041fba3c2bc70d19a (PR44), following PR43 at
1c902471edfdc9247fcce3e4647e54bd04a229af.
Accepted server, strict PNG validation/highwater, settings-state Undo/outcome
handling, ImageInput, ProjectList mobile row folding and removal controls are
retained from that base. ImageEditor combines accepted input ownership and
single-file guards with the four-source exact PNG draft and stable crop controls.
The glyph catalog, palette, Unicode segmentation and color recents are preserved.
The shared snapshot lifecycle replaces duplicated Image/Emoji draft feedback;
confirmed Save still uses the accepted explicit outcome contract.

Accepted IconPreview/PngPreview from #41/PR44 is shared by all four sources
through DraftOutput. Its scoped preview-ignore marker, native dialog close and
focus return logic are preserved unchanged; no duplicate viewer is added.
No live plugin settings are changed.

## Current verification

npm run check passes all 197 root/scripts tests. The finite presets matrix
passes 94 checks in each theme, including exact four-source viewer bytes,
scoped ignore markers and separate dialog Escape/focus return, and project-grid.browser.mjs passes 15 scenario
groups including all four sources. The grid harness also checks Glyph/Initials
exact PNG and node retention through narrow rowfold/filter/resize/realtime and
native source keyboard cancellation. Browser fixtures mock SDK/RPC/realtime and
theme tokens; native Chrome canvas, pixels, DOM and keyboard/pointer are real.
Live BB, remote clients and OS input remain separate acceptance boundaries.

Earlier bundle measurements above describe the original reviewed stack, not
incremental cost over the accepted 0.2 baseline. Current integration checks and
exact-head CI are recorded in the PR handoff.
