import { defineConfig } from "vitest/config";

export default defineConfig({
  // Each test file boots an in-memory Postgres (PGlite); under a full turbo run that can exceed 10 s.
  test: { include: ["tests/**/*.test.ts"], hookTimeout: 30_000, testTimeout: 15_000 },
});
