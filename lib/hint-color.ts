const HEX = /^#[0-9a-fA-F]{6}$/;
export const PROJECT_ID = /^proj_[a-z0-9]{10,32}$/;
export type HexColor = `#${string}`;

export function parseHexColor(value: unknown): HexColor | null {
  return typeof value === "string" && HEX.test(value) ? value.toLowerCase() as HexColor : null;
}
