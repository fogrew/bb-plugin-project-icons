# Theme variants

A project has one default icon, as before. It can optionally also have a light variant and a dark variant. While BB is in a theme that has a variant, the sidebar shows the variant; otherwise it shows the default. Nothing changes for a project that never gets a variant.

## Behaviour

- **Default first.** A variant can only be added to a project that already has a default icon (the server rejects a variant save otherwise). Removing the default removes its variants; Undo restores the default and its variants.
- **Editing.** The editor's **Light and dark variants (optional)** section chooses where the next icon goes: default, light theme only or dark theme only. Any icon source (image, emoji, glyph, initials) can produce a variant. The draft's 20 px sample is drawn on a light or dark surface so the icon can be judged against the theme it is for. **Remove light variant** and **Remove dark variant** delete one variant without Undo; **Remove icon** removes the default and every variant and offers Undo.
- **Manual.** Saving a variant marks the project manual (like any save), so peer adoption never replaces the default underneath it.
- **Live switching.** The sidebar reads BB's theme from the `dark` or `light` class on `<html>` (BB's theme CSS uses `:root, .light` and `.dark`), falling back to the computed `color-scheme` and then `prefers-color-scheme`. A mutation observer on the root element (class, style, data-theme) and a media query listener update the images immediately, with no reload and no network request. Variant revisions are fetched from `GET /icon-variants` together with `GET /icons` on the usual refresh triggers; if that route fails the default icons are used until the next successful refresh.

## Storage and migration

Format change, additive and backward compatible:

| Key | Before | Now |
| --- | --- | --- |
| `index` | `{ [projectId]: revision }` | unchanged |
| `image:<projectId>` | default PNG (base64) | unchanged |
| `variants` | absent | new: `{ [projectId]: { light?: revision, dark?: revision } }` |
| `image:<projectId>:light`, `image:<projectId>:dark` | absent | new: variant PNG (base64) |
| `revisionHighwater` | maximum revision ever issued | also covers variant revisions |

**Migration.** None is performed and none is needed. Every existing single icon stays the project's default and keeps its revision, URL and `resolveIcon` result; a missing `variants` key means no variants. Saving a new default for a project that has none discards variants left over from an interrupted removal or an older version. Malformed or hostile `variants` entries (wrong ids, non-positive or non-integer revisions, unknown themes, inherited keys) are ignored, and variants of a project that has no default or no longer exists are deleted on the next list. **Downgrade.** An older version ignores the new keys and keeps working with the default icons; the variant data stays in storage and becomes active again after upgrading.

RPC and HTTP additions: `list` rows carry `variants: { light, dark }` (revision or `null`); `save`, `remove` and `removeWithUndo` accept an optional `theme`; `GET /icon-variants` returns `{ [projectId]: { light?, dark? } }`; `GET /icon?projectId=&theme=light|dark` serves a variant (404 when absent) and the form without `theme` is unchanged. `resolveIcon` is unchanged at contract version 1: `theme` is still accepted and ignored, `found.theme` is still always `any` and the default icon is returned, so consumers that validate the published schema keep working (see [Plugin artwork interoperability](artwork-interoperability.md#outbound-resolveicon-contract-version-1)). Exposing variants to other plugins is tracked in #81.

## Project Colors

The issue asks for an explicit opt-in to use a Project Colors colour as an icon background or outline, where a public contract supports it. Inspecting Project Colors 0.1.4 ([source](https://github.com/ninjasweb/bb-project-colors/blob/aca04c16703421365f160369f7af8edd604cc246/app.tsx)): it stores its choices in the browser's `localStorage`, dispatches a window event, and styles rows through a `--project-sidebar-color` property and `project-colors-*` classes. It registers no RPC (`server.ts` only logs) and its README and overview document none of this as an interface for other plugins. Project Themes 0.1.0 has a server RPC `list`, but it is not documented as an interface either and is already used here only as a hint for automatic initials. Using either as an icon background would mean guessing at private details, so this version does not: no colour is read from Project Colors, no background or outline is drawn, and the follow-up is tracked in #78.

The previous rule that hid the Project Colors dot (`.project-colors-control`) on every heading with an image was unconditional, which the issue forbids when nothing replaces the dot. It is removed: the dot, palette, tint and title colour of Project Colors are untouched.

## Readability and contrast

Icons are drawn at 20 x 20 px. A single dark glyph is unreadable on a dark sidebar, which is what variants are for. The browser harness renders black-on-transparent and white-on-transparent fixtures at 20 px and measures WCAG contrast against the light (#ffffff) and dark (#18181b) surfaces: the matching variants reach at least 4.5:1 (21:1 and 17.7:1 in the fixture) while the wrong glyph on a dark surface is about 1.2:1. Real artwork is the user's choice; the editor shows the sample on the target theme's surface but does not block low-contrast icons.
