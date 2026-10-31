# v0.3.0 release preparation

Status: preparation only. Release date is pending owner authorization.
Main integration, tagging, publication and the return PR to develop remain owner-controlled.

## Scope and compatibility

Accepted application source: `c9966661aa3fdc06976cd493bd4f51ae551643aa`.
This batch adds emoji, bundled glyphs, initials and current/draft PNG viewing.
Image uploads remain available. Every source saves normalized PNG bytes through
the existing storage contract. Existing assignments are intended to remain intact.

Emoji appearance and complex sequences depend on local fonts and browser support
before saving. Initials accept one or two grapheme clusters and depend on local
font coverage and shaping. Glyphs use a small locally bundled Feather catalog.
Inspect the exact PNG preview before Save; saved artwork is shared across clients.
See the README and THIRD_PARTY_NOTICES.md for limits and licensing.

## Verification

Release acceptance is pending the isolated BB 0.48.1 runtime matrix and local/CI
checks. Previous 0.2.0 and issue #7 results are reference evidence only.
No release date, tag, publication or live installation update is asserted.
