import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const config = require("../tailwind.config.cjs") as { theme: { extend: { colors: Record<string, string> } } };
const colors = config.theme.extend.colors;
function luminance(hex: string): number {
  const rgb = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255).map((channel) => channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
}
function contrast(a: string, b: string): number { const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (light + .05) / (dark + .05); }
test("wedding palette keeps readable text, CTA, and focus contrast", () => {
  assert.ok(contrast(colors["wedding-text"], colors["wedding-surface"]) >= 4.5);
  assert.ok(contrast(colors["wedding-muted"], colors["wedding-surface"]) >= 4.5);
  assert.ok(contrast(colors["wedding-accent"], colors["wedding-surface"]) >= 4.5);
  assert.ok(contrast("#FFFFFF", colors["wedding-cta"]) >= 4.5);
});
