# Browser PNG fixtures

Generated on Windows on 2026-10-24 by installed HeadlessChrome/156.0.0.0,
using a fresh temporary profile, `HTMLCanvasElement.toBlob(callback, "image/png")`
and `createImageBitmap(blob)`. Each bitmap decoded successfully as 64 × 64,
was closed, and the temporary browser/profile were closed/removed. No BB
plugin installation or settings were changed.

All three files are real Chrome RGBA8, noninterlaced exports:

- `canvas-transparent.png` (303 bytes): transparent canvas with a 48 × 32
  rectangle at (8,16), fillStyle `#ff660080`.
- `canvas-opaque.png` (283 bytes): entire canvas filled with `#123456`.
- `canvas-emoji.png` (2,790 bytes): transparent canvas, `48px sans-serif`,
  `fillText("🌲", 6, 51)`, using the system's available emoji font.

These are self-generated test images. Emoji is a Unicode test fixture for
browser-export compatibility, not a renderer added to the plugin.
`png.mjs` loads the original files. The integration tests compare saved and
Undo-restored bytes exactly. They do not assert cross-browser glyph shape or
independent decoder pixel accuracy.

The generated color/depth/interlace matrix in `png-validation.test.mjs` is
separate from these browser-provenance fixtures and uses zero-valued samples.
