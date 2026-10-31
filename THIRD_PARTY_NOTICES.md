# Third-party notices

## Unicode Emoji 15.1 data

The selected fully-qualified sequences and English names in
`lib/emoji-catalog.ts` are derived from:
https://www.unicode.org/Public/emoji/15.1/emoji-test.txt

Source copyright: © 2023 Unicode, Inc.
Unicode and the Unicode Logo are registered trademarks of Unicode, Inc.

No emoji artwork or font files are included. The browser uses locally installed
fonts. The catalog is intentionally a small selection, not the complete Unicode
emoji repertoire.

### Unicode License V3

Copyright © 1991-2026 Unicode, Inc.

COPYRIGHT AND PERMISSION NOTICE

NOTICE TO USER: Carefully read the following legal agreement. BY
DOWNLOADING, INSTALLING, COPYING OR OTHERWISE USING DATA FILES, AND/OR
SOFTWARE, YOU UNEQUIVOCALLY ACCEPT, AND AGREE TO BE BOUND BY, ALL OF THE
TERMS AND CONDITIONS OF THIS AGREEMENT. IF YOU DO NOT AGREE, DO NOT
DOWNLOAD, INSTALL, COPY, DISTRIBUTE OR USE THE DATA FILES OR SOFTWARE.

Permission is hereby granted, free of charge, to any person obtaining a
copy of data files and any associated documentation (the "Data Files") or
software and any associated documentation (the "Software") to deal in the
Data Files or Software without restriction, including without limitation
the rights to use, copy, modify, merge, publish, distribute, and/or sell
copies of the Data Files or Software, and to permit persons to whom the
Data Files or Software are furnished to do so, provided that either (a)
this copyright and permission notice appear with all copies of the Data
Files or Software, or (b) this copyright and permission notice appear in
associated Documentation.

THE DATA FILES AND SOFTWARE ARE PROVIDED "AS IS", WITHOUT WARRANTY OF ANY
KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT OF
THIRD PARTY RIGHTS.

IN NO EVENT SHALL THE COPYRIGHT HOLDER OR HOLDERS INCLUDED IN THIS NOTICE
BE LIABLE FOR ANY CLAIM, OR ANY SPECIAL INDIRECT OR CONSEQUENTIAL DAMAGES,
OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS,
WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION,
ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THE DATA
FILES OR SOFTWARE.

Except as contained in this notice, the name of a copyright holder shall
not be used in advertising or otherwise to promote the sale, use or other
dealings in these Data Files or Software without prior written
authorization of the copyright holder.

License source: https://www.unicode.org/license.txt

## Feather v4.29.2 glyph geometry

Eight selected glyphs are converted from SVG primitives to fixed Canvas Path2D
geometry in `lib/icon-presets.ts`: folder, star, heart, code, terminal, cloud,
bookmark and zap. No SVG parser, arbitrary markup, remote assets, font or icon
library is included.

Primary source: https://github.com/feathericons/feather/tree/1b002399e8758fb2bccea4d07312dc9e0f43dcb8/icons

The v4.29.2 annotated tag resolves to commit
`1b002399e8758fb2bccea4d07312dc9e0f43dcb8`. Each catalog entry corresponds to
`icons/<id>.svg` at that commit; only polygon/polyline/line primitives are
converted to equivalent path commands. Stroke width, round caps and joins are
preserved. The UI and PNG renderer use the same local geometry.

License source: https://github.com/feathericons/feather/blob/1b002399e8758fb2bccea4d07312dc9e0f43dcb8/LICENSE

### Feather MIT license

The MIT License (MIT)

Copyright (c) 2013-2023 Cole Bemis

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
