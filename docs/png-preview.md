# PNG preview boundary and validation

Current and draft PNGs use a native button and a plugin-owned modal dialog.
The dialog renders the same URL or data URL as the thumbnail without encoding,
saving or removing anything. Its close control occupies a separate toolbar row.
The checkerboard makes alpha visible. Escape closes only the viewer; Tab and
Shift+Tab stay on its sole close control, and close restores the connected trigger.
Native modal inertness contains pointer/focus interaction outside the dialog.

## Installed viewer evidence

Inspected BB 0.47.1 and pinned SDK 0.6.49 before implementation. The SDK has no
documented per-image automatic-viewer opt-out API. The installed running community
plugin image-preview 0.1.0 supplies the automatic Settings image viewer:
Dwite/bb-plugin-image-preview commit
6c730433b20826c6359b0ae733b8eb00d539ffae, image-preview.ts SHA-256
5e616cd2617c9b3ca069671b4672ac0f353a151a5d5cf5fefd1cb31ee07756a3.

Its isInsideIgnoredSurface (lines 330–336) explicitly excludes button and
[data-bb-image-preview-ignore]. Its document click/keydown listeners run in
capture (lines 928–929), so React stopPropagation alone cannot prevent opening.
The preview wrapper uses the existing ignore surface, including the 20px sample
and enlarged dialog image. This is a scoped interoperability boundary with that
installed plugin, not a new guaranteed BB SDK contract. Other viewer plugins or
future versions require separate verification. No host CSS is patched. The
installed viewer's overlapping absolute close control remains a host limitation.

## Reproduction

After npm ci and the README temporary browser-tool installation, run npm run build.
Set IMAGE_PREVIEW_SOURCE to the installed image-preview.ts, then run:

    node icon-preview.browser.mjs
    node project-grid.browser.mjs

The finite harness bundles and executes the actual installed viewer source in a
disposable page alongside real Settings/React/Chrome/PNG/canvas. It first proves
that an unrelated image opens that viewer, then tests plugin current/draft
activation without a second viewer. Results record the actual source path/hash.
It covers Enter, Space, pointer, Tab/Shift+Tab, Escape, close, focus restoration,
no open/close RPCs, exact image draft bytes/input identity, Cancel, exact emoji
snapshot/save bytes, 320/375/1440 and 640x400 layouts, light/dark, close separation
and 44px targets. 640x400 is reduced CSS viewport evidence for zoomed layouts,
not an OS browser zoom test. Screenshots and results are under ignored
dist/icon-preview-browser. The grid harness covers row layout, mobile, draft/DOM
preservation, generation ownership and Undo.

SDK registration, RPC, realtime and theme tokens remain fixtures. This does not
prove live installed-BB integration, remote mobile touch, safe-area hardware,
screen-reader announcements, Safari/Firefox, or OS/browser zoom. The installed
plugin, its checkout and BB configuration were not changed. Glyph and initials
sources are unavailable in this branch; they can later use the shared PNG
component without importing sibling feature code.

