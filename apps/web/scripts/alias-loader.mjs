/**
 * Minimal Node ESM loader so the standalone test/verification scripts can import
 * app modules that use the Next.js `@/` path alias and import `data/*.json`
 * without an import assertion. Only used by the test runner, never in the app
 * (Next.js resolves both natively via jsconfig + its bundler).
 */
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolvePath(dirname(fileURLToPath(import.meta.url)), "..");

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    let target = resolvePath(REPO_ROOT, specifier.slice(2));
    if (!existsSync(target)) {
      if (existsSync(`${target}.js`)) target = `${target}.js`;
      else if (existsSync(`${target}.json`)) target = `${target}.json`;
    }
    return { url: pathToFileURL(target).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}

export async function load(url, context, nextLoad) {
  if (url.endsWith(".json")) {
    const source = await readFile(fileURLToPath(url), "utf8");
    return { format: "module", source: `export default ${source};`, shortCircuit: true };
  }
  return nextLoad(url, context);
}
