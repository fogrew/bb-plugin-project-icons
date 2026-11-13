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
| `projectName` | At most 200 UTF-16 units; no control, bidi-formatting or unpaired-surrogate characters. Shown in the preview only. |
| `image` | Canonical base64 of one static 64 × 64 PNG of at most 64 KiB, accepted by the same strict decoder as **Save**. |

Unknown keys at any level (including `__proto__`, `constructor`, `prototype`), missing keys and wrong types make the whole file invalid. The file may start with a byte order mark.

An export holds nothing but those three fields per icon: no file-system paths, repository data, credentials, tokens, settings, provenance, colours or timestamps. Names that would not pass the rules above are exported with offending characters replaced by a space and truncated. Projects without an icon, orphaned data and icons whose stored bytes no longer pass the decoder are left out (the decoder failures are counted and reported).

## Limits

| Limit | Value |
| --- | --- |
| File size | 12 MiB (12,582,912 characters), checked before the file is parsed |
| Icons per file | 500, checked before any entry is validated |
| Export | Refused with a clear message when it would exceed either limit |

The browser also refuses a larger file before reading it.

## Preview and confirmation

`importPreview` validates the file and returns, without writing anything, the icons, every current project (id, name, icon revision, icon hash) and a proposed target for each entry:

- An entry whose `projectId` is a current project is proposed for that project. The user may still change or clear it.
- An entry whose id is unknown here has no target. A project with the same name is offered first in the picker and labelled **(same name)**, but is never chosen automatically; duplicate names are shown with their ids. Unmatched entries are left out unless the user picks a project.
- Each row says whether it adds an icon, replaces the current one (shown next to the incoming icon), is already identical (nothing to do) or is left out.
- Replacing any icon needs the **Replace N existing icons** checkbox. Changing a target clears it. **Cancel** closes the preview; nothing was written.

`importApply` takes the same file again plus one `{ sourceId, targetId, expectedRevision }` per chosen entry, and re-validates everything itself. `expectedRevision` is the icon revision the user saw in the preview (`null` for a project without an icon). If the target's current revision differs, or the project disappeared, the whole import is refused as `stale` and the preview is refreshed. Two entries aimed at the same project, an unknown entry or duplicate selections are refused as `bad-selection`.

## Atomicity

Validation, decoding and planning finish before the first write; any invalid file or selection changes nothing. The writes then run inside the same queue as every other icon change, in this order: revision high-water mark, each `image:<project>` value, the provenance records, and finally the index that the sidebar reads. If any write fails, the previous index, provenance records and image values are restored and the reply is `failed` with `rolledBack: true`. A rollback that cannot complete is reported as `rolledBack: false`.

Limits of this guarantee: BB's plugin storage has no multi-key transaction, so a plugin or server crash in the middle of the write sequence is not recovered, and the revision high-water mark is deliberately not rolled back (revisions are never reused).

## Provenance

Imported icons are manual: each target project gets the same `manual` provenance record as **Save**, so automatic adoption from other plugins never overwrites them. An icon that was adopted from another plugin and is then replaced by an import becomes manual. A pending Undo offer for an imported project is dropped.

## RPC

`exportIcons`, `importPreview` and `importApply` are callable only by the plugin's own settings UI, not by other plugins. Each returns a `status`; refusals are `{ status: "rejected", code, message }` with codes `too-large`, `not-json`, `wrong-format`, `unsupported-version`, `malformed`, `too-many`, `duplicate`, `bad-image`, `bad-selection` and `stale`. Messages are fixed strings and never repeat file content.

## Verification

`icon-transfer.test.mjs` covers the format and hostile input (corrupt, truncated, oversized and header-only PNGs, huge and deeply nested payloads, duplicate ids, prototype-pollution keys). `icon-transfer-server.test.mjs` runs the real server code on the SDK's fake host: a round trip between two servers with different project ids and duplicate names, replacement confirmation, stale revisions, Undo interaction, manual provenance, concurrency, and an injected failure at every write step. Both run in `npm run check`. `icon-transfer.browser.mjs` is an optional headless-Chrome harness (see the README) that drives the real component against the real server code over a local HTTP bridge. The SDK host, RPC transport and theme tokens are fixtures: installed-BB behaviour, native file dialogs, and the browser download UI in a BB window are not verified.
