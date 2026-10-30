import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node22",
  clean: true,
  // core and types are workspace source, bundled into the CLI; real npm deps stay external
  noExternal: [/^@revio\//],
});
