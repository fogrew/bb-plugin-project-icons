# PNG assignment validation

New saves keep the existing canonical base64 RPC value, 64 × 64 dimensions,
64 KiB PNG file limit, storage keys and revision behavior. The server validates
before touching the index, image, revision highwater, Undo offers or realtime.
The original file bytes are stored; validation does not re-encode or sanitize.

## Supported representation

Static PNGs support every legal PNG color/depth pair, with either no interlace
or Adam7:

| Color type | Samples | Bit depths |
| --- | --- | --- |
| 0 | Grayscale | 1, 2, 4, 8, 16 |
| 2 | RGB | 8, 16 |
| 3 | Indexed palette | 1, 2, 4, 8 |
| 4 | Grayscale and alpha | 8, 16 |
| 6 | RGBA | 8, 16 |

All 30 profiles have actual-server SDK harness acceptance fixtures. These
generated zero-sample fixtures test representation acceptance, not independent
pixel accuracy. Separate real Chrome canvas fixtures cover transparent and
opaque images and emoji text. No emoji renderer is introduced by this change.

All five PNG scanline filters, consecutive split/empty IDAT chunks, legal
palette/transparency data, and unknown ancillary chunks are supported.
APNG control/frame chunks are explicitly rejected for new saves: assignments
are static. Extra bytes after IEND or after the single zlib stream are rejected.

## Decoder choice and bounds

The exact runtime dependency is **pngjs 7.0.0**, MIT, with no runtime dependencies.
Development types are pinned to **@types/pngjs 6.0.5**. Inspect the lockfile's
integrity-pinned npm archive when upgrading; the source findings below refer to
that archive, not upstream main:

- `lib/parser-sync.js` inflates Adam7 without an output cap. Its noninterlaced
  path uses `lib/sync-inflate.js`, which truncates output at the expected size.
- `lib/parser.js` permits repeated headers and skips unknown ancillary CRCs.
- `lib/filter-parse.js` rejects invalid filters; `lib/format-normaliser.js`
  rejects palette indices without a corresponding entry.

A small preflight validates framing, every chunk CRC, a unique first IHDR,
legal format fields, palette/transparency structure, contiguous IDAT chunks and
an empty final IEND. Unknown critical chunks are rejected. Decoder-relevant
singleton chunks cannot override checked metadata. The preflight concatenates
exactly the IDAT payloads that pngjs will read from the same immutable Buffer.

Native zlib first checks the complete stream with `maxOutputLength` and
`info.engine.bytesWritten`. Output must exactly match the scanline size, and
all compressed input must be consumed. Noninterlaced output is at most 32,832
bytes; Adam7 output is at most **32,888 bytes**. Only then does pngjs check
filters and decode pixels, including indexed pixels, with CRC checking enabled.

The second inflate sees the same already-validated stream and metadata.
It therefore cannot expand beyond that output. Every request processes at most
65,536 file bytes, at most 5,460 framed chunks (fewer in a usable file), two
bounded inflates and 4,096 pixels. Metadata payloads are never decompressed.
Intermediate JS/native decoder buffers and zlib's fixed window add overhead:
32,888 is the inflated-data limit, not a total process-memory limit.

These finite byte/output/pixel bounds constrain per-request work. There is no
hard wall-clock deadline or request-rate limiter. The test runner's timeout
cannot preempt synchronous decode, and its V8 heap cap excludes native memory.
This change does not claim isolation against unlimited repeated requests.

CRC/framing checks apply to unknown ancillary payloads, which are otherwise
ignored. This is pixel-stream validation, not exhaustive ancillary metadata
conformance, metadata stripping, malware scanning or image-content moderation.
No filesystem or network access occurs during validation.

## Existing assignments and Undo

Existing saved bytes are not revalidated on list, HTTP reads or Undo restore.
This preserves both valid assignments and previously accepted malformed data.
Nothing is deleted, migrated or silently rewritten. A malformed legacy icon
may remain broken until the user replaces or removes it; an explicit removal
can still be undone with the original bytes. New malformed saves are rejected
before invalidating an existing Undo offer or reserving a revision.

## Verification and integration

The SDK harness invokes built `dist/server.js`, not a mocked validator.
`png-validation.test.mjs` exercises valid browser exports, all 30 format
profiles, malformed/chunk/CRC/filter/palette/zlib inputs, decompression bombs,
trailing-input policy, byte preservation, storage/realtime rejection atomicity
and successful Undo after rejection. `removal-undo.test.mjs` uses valid PNG
fixtures and verifies concurrent save/remove/restore semantics.

At implementation verification, all 144 root tests passed on Node 22.19.0 and
24.22.1 with a 128 MiB V8 heap cap and a 10-second diagnostic test deadline:

```sh
node --max-old-space-size=128 --test --test-timeout=10000 '*.test.mjs'
```

Accepted CI/tooling now includes the SDK harness dependency and discovers all
root and scripts test suites through `npm run check`, after quality checks,
typechecking and the pinned standalone build. `cron-parser@5.10.2` is part of
that accepted lockfile; no temporary harness dependency is needed.
On Windows without native build prerequisites, `npm ci --ignore-scripts`
supports local checks; normal installation is verified separately by exact-head
Ubuntu CI. This does not establish installed-plugin or remote-client behavior.

After synchronization with accepted develop, the complete local
`npm run check` passed all 187 root and scripts tests on Node 26.8.1 using
`npm ci --ignore-scripts` on Windows. This includes all accepted legacy
highwater tests, with real valid replacement PNGs. The synchronized pinned
build produces a 245,047-byte server bundle with the complete MIT notice.
Exact-head Ubuntu CI separately verifies normal `npm ci` and the full check.

The original host-toolchain baseline server bundle was 210,673 bytes; its
validator/decoder bundle was 244,736 bytes (+34,063), including the embedded
MIT notice. These historical measurements are not an integration-toolchain
comparison; the PR reports the synchronized build size. The app bundle does
not import the decoder. The source's MIT notice is retained in the server
bundle; no new dependency license is imposed on the project's original code.

The original local build used BB 0.47.1 / host SDK 0.6.79. The synchronized
build uses the accepted pinned standalone bb-app 0.46.1 / SDK 0.6.49 toolchain.
Published bb-app 0.46.0 and 0.46.1 declare Node
`^22.19.0 || ^24.0.0 || ^26.0.0`; native zlib CRC32 predates that floor.
The minimum supported Node run verifies CRC32 and complete-stream consumption,
including trailing garbage and concatenated zlib streams. Installed-plugin
runtime, remote-client behavior, Safari and Firefox remain untested here.

The original reviewed validator commit is
`798ed0a2408275a507850290d9113c7c72bed676`, based on #24/PR #27 head
`00add288be354d73a6108547d5156fc549ff98c8` and inheriting #4/PR #23 and
#3/PR #21. After dependency acceptance, this branch additively synchronized
accepted develop `bd3d225b299f92ca9cd3741cf676fa3a495cf24e` and PR #30 targets
develop. The reviewed validator is unchanged. Accepted Undo/highwater safety,
#5 input handling and #32 slider accessibility are retained.
The manifest/lockfile retain the accepted CI toolchain plus only exact
pngjs 7.0.0 and @types/pngjs 6.0.5 additions; there is no dependency version drift.
Final integration requires synchronized-head checks and review under the
current contribution policy; this worker does not perform the integration merge.
Release checkpoint #6 also waits for #28.

## Primary references

- [PNG specification](https://www.w3.org/TR/png-3/): legal formats, Adam7,
  chunk layout/order and scanline serialization.
- [Node zlib documentation](https://nodejs.org/api/zlib.html): CRC32,
  maxOutputLength, info and bytesWritten. CRC32 was added in Node 22.2/20.15;
  no Node-26-only rejectGarbageAfterEnd option is used.
- [Exact pngjs 7.0.0 archive](https://registry.npmjs.org/pngjs/-/pngjs-7.0.0.tgz):
  reviewed source, package metadata and MIT license.
- [bb-app 0.46.0 metadata](https://registry.npmjs.org/bb-app/0.46.0) and
  [0.46.1 metadata](https://registry.npmjs.org/bb-app/0.46.1): runtime engines.
- [HTML canvas serialization](https://html.spec.whatwg.org/multipage/canvas.html#serialising-bitmaps-to-a-file):
  PNG is required; the plugin exports through canvas.toBlob.
