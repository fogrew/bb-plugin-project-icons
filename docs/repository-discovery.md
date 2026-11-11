# Repository icon discovery

The image editor has a **Find icons in repository** button. Nothing is searched until it is pressed.

- Search uses the supported SDK `projects.files` and `projects.fileContent` calls, which route to the project's own host. No network access is added by the plugin.
- Three queries (`favicon`, `icon`, `logo`) run with a combined 8 s timeout. Results are filtered to PNG, JPEG and WebP names containing one of those words, skipping dependency/build directories, paths deeper than 8 segments, absolute or `..` paths, backslashes and control characters. At most 12 ranked candidates are shown.
- SVG and other formats (ICO, GIF, …) are counted and reported as skipped; SVG is never rendered.
- Reading a candidate re-validates the path, rejects files over 2 MB, requires base64 content whose magic bytes match a supported format and the file extension, then hands the bytes to the existing editor as a draft. The existing icon changes only after the user presses Save.
- A missing folder, an offline host or a timeout is reported as unavailable; zero matches show an explicit empty state. Switching projects or closing the editor discards in-flight results.

## Verification boundary

Covered by unit tests (`discovery.test.mjs`) and a real-Chrome fixture (`repository-icons.browser.mjs`) with SDK and RPC mocked. Not verified live in BB: real multi-logo repositories, remote hosts, symlink escapes (containment is the host API's responsibility; the plugin cannot observe symlinks) and the host's own size limits (`fileContent` reports `sizeBytes` after the read, so an oversized file is read by the host before being rejected).

An unknown project makes `discover` and `readCandidate` fail with "Project not found". Host error details are logged, not returned to the UI.
