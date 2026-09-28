import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SRC_ROOT_URL = new URL("../src/", import.meta.url);

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith("@/")) {
        const relativePath = specifier.slice(2);
        const resolved = new URL(relativePath, SRC_ROOT_URL);
        if (!/\.[a-z0-9]+$/i.test(resolved.pathname)) {
          resolved.pathname = `${resolved.pathname}.ts`;
        }
        return nextResolve(resolved.href, context);
      }
      if (
        error
        && typeof error === "object"
        && "code" in error
        && error.code === "ERR_MODULE_NOT_FOUND"
        && /^\.{1,2}\//.test(specifier)
        && !/\.[a-z0-9]+$/i.test(specifier)
      ) {
        return nextResolve(`${specifier}.ts`, context);
      }
      throw error;
    }
  },
  load(url, context, nextLoad) {
    const moduleUrl = new URL(url);
    if (moduleUrl.pathname.endsWith(".sql")) {
      const source = readFileSync(fileURLToPath(moduleUrl), "utf8");
      return {
        format: "module",
        shortCircuit: true,
        source: `export default ${JSON.stringify(source)};`,
      };
    }
    return nextLoad(url, context);
  },
});
