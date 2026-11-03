import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const input = resolve(root, "solid-ui/src/lib/weddingMagnetProfileFields.v1.json");
const output = resolve(root, "wedding/assets/js/magnet-profile-fields.js");
const registry = JSON.parse(await readFile(input, "utf8"));
const source = `(function(global){'use strict';global.OmnyWeddingMagnetProfileFields=Object.freeze(${JSON.stringify(registry)});})(window);\n`;
await writeFile(output, source, "utf8");
