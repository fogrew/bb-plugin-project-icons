---
name: project-icons
description: Manage image icons for BB project headings with the Project Icons plugin.
---

# Project Icons

Open **Settings → Installed plugins → Project Icons**. Choose a project, upload a PNG, JPEG, or WebP image, and check its preview. Use **Remove icon** to restore the ordinary project heading.

The plugin stores one resized 64 × 64 PNG per project in BB's plugin storage. Source files must be under 2 MB. It does not read arbitrary local files on the server or support SVG. No CLI command is registered.

Settings offers **Undo removal** for up to 15 seconds, only while that exact deletion is current. Newer changes, capacity eviction or server/plugin reload can invalidate it earlier. Switching projects dismisses the local offer. Removed bytes are retained only in bounded backend memory, with no durable recovery. See [the Undo contract](../../docs/removal-undo.md) for RPC, retention, failure and verification boundaries.
