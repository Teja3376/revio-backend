import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { vscode: fileURLToPath(new URL("./test/vscode-fake.ts", import.meta.url)) } },
});
