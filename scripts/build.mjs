import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

try {
  const require = createRequire(import.meta.url);
  function packageVersion(name) {
    let dir = dirname(require.resolve(name));
    while (true) {
      const path = join(dir, "package.json");
      if (existsSync(path)) {
        const pkg = JSON.parse(readFileSync(path, "utf8"));
        if (pkg.name === name) return pkg.version;
      }
      const parent = dirname(dir);
      if (parent === dir) throw new Error(`Cannot locate the ${name} manifest.`);
      dir = parent;
    }
  }
  // Match bb-app 0.46.1's official local-toolchain resolver. Refuse drift so a
  // cold build cannot fall back to downloading packages through bundled npm.
  const pins = { "bb-app": "0.46.1", esbuild: "0.28.1", "@tailwindcss/node": "4.3.0", "@tailwindcss/oxide": "4.3.0", tailwindcss: "4.3.0" };
  for (const [name, version] of Object.entries(pins)) {
    const installed = packageVersion(name);
    if (installed !== version) throw new Error(`${name} must be ${version}; found ${installed}. Run npm ci.`);
  }
  const cli = join(dirname(require.resolve("bb-app")), "bb.js");
  if (!existsSync(cli)) throw new Error("The pinned bb-app package has no dist/bb.js.");
  // BB_CLI may point at the desktop installation; always use the locked npm CLI.
  const { BB_CLI, ...env } = process.env;
  const result = spawnSync(process.execPath, [cli, "plugin", "build"], { stdio: "inherit", env });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`bb-app plugin build failed (status ${result.status}, signal ${result.signal ?? "none"}).`);
} catch (error) {
  console.error(`Plugin build failed: ${error.message}\nRun npm ci with the supported Node version. The official pinned bb-app CLI and matching local toolchain are required; do not install the unrelated npm package "bb".`);
  process.exitCode = 1;
}
