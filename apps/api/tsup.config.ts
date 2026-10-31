import { defineConfig } from "tsup";

// Bundles @revio/core and @revio/types in (they ship TypeScript source); other deps stay external.
export default defineConfig({
  entry: ["src/main.ts", "src/migrate.ts"],
  format: ["esm"],
  platform: "node",
  target: "node22",
  outDir: "dist",
  noExternal: [/^@revio\//],
  sourcemap: true,
  clean: true,
});
