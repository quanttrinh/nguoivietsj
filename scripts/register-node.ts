import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));

function resolveFile(base: string): string | undefined {
  const withExtension = base.endsWith(".ts") ? base : `${base}.ts`;

  if (existsSync(withExtension)) {
    return withExtension;
  }

  const index = path.join(base, "index.ts");

  return existsSync(index) ? index : undefined;
}

/** Give Node the same `~/` alias and extension resolution the bundler uses. */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith("~/")) {
      const target = resolveFile(path.resolve(ROOT, "src", specifier.slice(2)));

      return target === undefined
        ? nextResolve(specifier, context)
        : nextResolve(pathToFileURL(target).href, context);
    }

    if (specifier.startsWith(".") && !path.extname(specifier) && context.parentURL) {
      const parent = new URL(context.parentURL);

      if (parent.protocol === "file:") {
        const parentPath = fileURLToPath(parent);
        const target = resolveFile(path.resolve(path.dirname(parentPath), specifier));

        if (target !== undefined) {
          return nextResolve(pathToFileURL(target).href, context);
        }
      }
    }

    return nextResolve(specifier, context);
  },
});
