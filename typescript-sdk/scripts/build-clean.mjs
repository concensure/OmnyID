import { rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const distDir = path.join(packageRoot, "dist");
const tscEntry = path.join(packageRoot, "node_modules", "typescript", "bin", "tsc");
const tsconfigPath = path.join(packageRoot, "tsconfig.build.json");

await rm(distDir, { recursive: true, force: true });

const child = spawn(process.execPath, [tscEntry, "-p", tsconfigPath], {
  cwd: packageRoot,
  stdio: "inherit",
});

const exitCode = await new Promise((resolve, reject) => {
  child.once("error", reject);
  child.once("exit", resolve);
});

if (typeof exitCode === "number" && exitCode !== 0) {
  process.exit(exitCode);
}
