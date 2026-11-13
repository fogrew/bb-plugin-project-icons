# Icon export and import

Settings → Project icons → **Export and import** saves every project icon to one JSON file and restores icons from such a file, on the same server or another one. Nothing is written until the user confirms a preview.

## File format (version 1)

```json
{
  "format": "bb-project-icons",
  "version": 1,
  "icons": [
    { "projectId": "proj_abcdefghij", "projectName": "Demo", "image": "<base64 of a 64 × 64 PNG>" }
  ]
}
```

| Field | Rule |
| --- | --- |
| `format` | Exactly `bb-project-icons`. |
| `version` | Integer. `1` is read; a larger value is refused as coming from a newer plugin; anything else is malformed. |
| `icons` | Array of at most 500 entries. Every project id may appear once. |
| `projectId` | `proj_` followed by 10-32 lowercase letters or digits. Used to propose a target on the server that made the file. |
| `projectName` | At most 200 UTF-16 units; no control, line-separator, direction-formatting, tag or unpaired-surrogate characters (zero-width joiners are allowed). Shown in the preview only. |
| `image` | Canonical base64 of one static 64 × 64 PNG of at most 64 KiB, accepted by the same strict decoder as **Save**. |

Unknown keys at any level (including `__proto__`, `constructor`, `prototype`), missing keys and wrong types make the whole file invalid, as does JSON nested deeper than a valid file can be (checked by a linear scan before parsing). The file may start with a byte order mark.

An export holds nothing but those three fields per icon: no file-system paths, repository data, credentials, tokens, settings, provenance, colours or timestamps. Each PNG is re-emitted with only its pixel chunks (`IHDR`, `PLTE`, `tRNS`, `gAMA`, `IDAT`, `IEND`), so text, time, colour-profile and other metadata chunks embedded in a stored icon never leave the server. Names that would not pass the rules above are exported with offending characters replaced by a space and truncated. Projects without an icon, orphaned data and icons whose stored bytes no longer pass the decoder are left out (the decoder failures are counted and reported). Import accepts what the strict decoder accepts and stores the bytes as received, like **Save**.

## Limits

| Limit | Value |
| --- | --- |
| File size | 12 MiB (12,582,912 characters), checked before the file is scanned or parsed |
| JSON nesting | 3 levels (object, array, entry), checked before parsing |
| Icons per file | 500, checked before any entry is validated |
| Export | Refused with a clear message when it would exceed either limit |

The browser also refuses a larger file before reading it. The export is handed to the host with `experimental_saveFile` (a plain download link where the host does not provide it); the UI reports success only when the host says the save started.

## Preview and confirmation

`importPreview` validates the file and returns, without writing anything, the icons, every current project (id, name, icon revision, icon hash) and a proposed target for each entry:

- An entry whose `projectId` is a current project is proposed for that project. The user may still change or clear it.
- An entry whose id is unknown here has no target. A project with the same name is offered first in the picker and labelled **(same name)**, but is never chosen automatically; duplicate names are shown with their ids. Unmatched entries are left out unless the user picks a project.
- Each row says whether it adds an icon, replaces the current one (shown next to the incoming icon), is already identical (nothing to do), is identical to an icon another plugin still manages (imported, it is kept as a manual icon without rewriting the image) or is left out.
- Replacing any icon needs the **Replace N existing icons** checkbox. Changing a target clears it. **Cancel** closes the preview; nothing was written.

The picker names every project; projects with the same name are shown with their ids.

`importApply` takes the same file again plus one `{ sourceId, targetId, expectedRevision }` per chosen entry, and re-validates everything itself. `expectedRevision` is the icon revision the user saw in the preview (`null` for a project without an icon). If the target's current revision differs, or the project disappeared, the whole import is refused as `stale` and the preview is refreshed. Two entries aimed at the same project, an unknown entry or duplicate selections are refused as `bad-selection`.

## Atomicity

Validation, decoding and planning finish before the first write; any invalid file or selection changes nothing. The writes then run inside the same queue as every other icon change, in this order: revision high-water mark, each `image:<project>` value, the provenance records, and finally the index that the sidebar reads. If any write fails, every key that was written or attempted is restored to its previous value (or deleted if it did not exist) in reverse order, and the reply is `failed` with `rolledBack: true`. `rolledBack: false` means a restore itself failed, so the import may be incomplete. A failure of the realtime notification or the log after the commit does not fail the import.

Limits of this guarantee: BB's plugin storage has no multi-key transaction, so a plugin or server crash in the middle of the write sequence is not recovered, and the revision high-water mark is deliberately not rolled back (revisions are never reused). Because `GET /icon` serves the stored image without checking the `v=` revision, a browser that fetches an icon while a save or import is between its image and index writes can cache the new bytes under the old revision for up to an hour; this already applies to **Save** and is not changed here.

## Provenance

Imported icons are manual: each target project gets the same `manual` provenance record as **Save**, so automatic adoption from other plugins never overwrites them. An icon that was adopted from another plugin and is then replaced by an import becomes manual, and so does one that is identical to the import (only its provenance record is written; the reply counts it as `pinned`). An icon that is already manual and identical is left alone. A pending Undo offer can never restore over an imported icon.

## RPC

`exportIcons`, `importPreview` and `importApply` refuse calls from other plugins. Any other caller the host treats as a client (BB's own UI, the `bb` CLI, agents) can call them; replacing an icon needs the current revision from `list`, which is no more than **Save** already allows. Each returns a `status`; refusals are `{ status: "rejected", code, message }` with codes `too-large`, `not-json`, `wrong-format`, `unsupported-version`, `malformed`, `too-many`, `duplicate`, `bad-image`, `bad-selection` and `stale`. Messages are fixed strings and never repeat file content.

## Verification

`icon-transfer.test.mjs` covers the format and hostile input (corrupt, truncated, oversized and header-only PNGs, huge and deeply nested payloads, duplicate ids, prototype-pollution keys). `icon-transfer-server.test.mjs` runs the real server code on the SDK's fake host: a round trip between two servers with different project ids and duplicate names, replacement confirmation, stale revisions, Undo interaction, manual provenance, concurrency, and an injected failure at every write step. Both run in `npm run check`. `icon-transfer.browser.mjs` is an optional headless-Chrome harness (see the README) that mounts the real Settings page against the real server code over a local HTTP bridge. The SDK host, RPC transport, `experimental_saveFile` and theme tokens are fixtures. Not verified: an installed BB, whether its RPC transport accepts bodies near the 12 MiB limit (preview echoes the images back and apply re-sends the file), native file dialogs, and the save flow in BB Desktop or the iOS app.
