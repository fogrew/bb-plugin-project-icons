// Selected fully-qualified Unicode Emoji 15.1 sequences and English names.
// Source: https://www.unicode.org/Public/emoji/15.1/emoji-test.txt
// Copyright © 2023 Unicode, Inc. See THIRD_PARTY_NOTICES.md.
const entries = [
  ["1f600", "grinning face"], ["1f603", "grinning face with big eyes"],
  ["1f60a", "smiling face with smiling eyes"], ["1f60e", "smiling face with sunglasses"],
  ["1f914", "thinking face"], ["1f680", "rocket"], ["2b50", "star"], ["1f525", "fire"],
  ["2764-fe0f", "red heart"], ["2705", "check mark button"], ["1f4a1", "light bulb"],
  ["1f4bb", "laptop"], ["1f527", "wrench"], ["1f528", "hammer"], ["2699-fe0f", "gear"],
  ["1f512", "locked"], ["1f511", "key"], ["1f4c1", "file folder"], ["1f4da", "books"],
  ["1f3a8", "artist palette"], ["1f3b5", "musical note"], ["1f3ae", "video game"],
  ["1f3af", "bullseye"], ["1f9ea", "test tube"], ["1f52c", "microscope"],
  ["1f30d", "globe showing Europe-Africa"], ["1f331", "seedling"], ["1f333", "deciduous tree"],
  ["1f335", "cactus"], ["1f340", "four leaf clover"], ["1f98a", "fox"], ["1f431", "cat face"],
  ["1f436", "dog face"], ["1f43f-fe0f", "chipmunk"], ["1f409", "dragon"], ["1f984", "unicorn"],
  ["2615", "hot beverage"], ["1f355", "pizza"], ["1f34e", "red apple"], ["1f370", "shortcake"],
  ["1f381", "wrapped gift"], ["1f389", "party popper"], ["1f48e", "gem stone"], ["1f3e0", "house"],
  ["1f3d7-fe0f", "building construction"], ["1f6e0-fe0f", "hammer and wrench"],
  ["1f4ca", "bar chart"], ["1f4c5", "calendar"], ["1f4dd", "memo"], ["1f4ac", "speech balloon"],
  ["1f4e6", "package"], ["2600-fe0f", "sun"], ["1f319", "crescent moon"], ["26a1", "high voltage"],
  ["1f44d", "thumbs up"], ["1f44d-1f3fb", "thumbs up: light skin tone"],
  ["1f44d-1f3fc", "thumbs up: medium-light skin tone"],
  ["1f44d-1f3fd", "thumbs up: medium skin tone"],
  ["1f44d-1f3fe", "thumbs up: medium-dark skin tone"],
  ["1f44d-1f3ff", "thumbs up: dark skin tone"],
  ["1f469-200d-1f4bb", "woman technologist"],
  ["1f469-1f3fd-200d-1f4bb", "woman technologist: medium skin tone"],
  ["1f468-200d-1f4bb", "man technologist"],
  ["1f468-1f3ff-200d-1f4bb", "man technologist: dark skin tone"],
  ["1f468-200d-1f469-200d-1f467-200d-1f466", "family: man, woman, girl, boy"],
  ["1f3f3-fe0f-200d-1f308", "rainbow flag"], ["1f1e8-1f1fe", "flag: Cyprus"],
  ["1f1ec-1f1e7", "flag: United Kingdom"], ["1f1fa-1f1f8", "flag: United States"],
  ["1f1ef-1f1f5", "flag: Japan"], ["0031-fe0f-20e3", "keycap: 1"], ["0023-fe0f-20e3", "keycap: #"],
] as const;

export const emojiCatalog = entries.map(([id, label]) => ({
  id, label, value: String.fromCodePoint(...id.split("-").map(hex => parseInt(hex, 16))),
}));
export type Emoji = (typeof emojiCatalog)[number];

export function searchEmoji(query: string): Emoji[] {
  const term = query.trim().toLowerCase();
  return emojiCatalog.filter(entry => entry.label.toLowerCase().includes(term) || entry.value === term);
}
