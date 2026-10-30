// Manual check against real Gemini: GEMINI_API_KEY=... npx tsx packages/core/scripts/smoke.ts
import { createGeminiClient, review } from "../src/index";

const diff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,0 +1,6 @@
+export async function login(user: { password: string }, input: string) {
+  if (user.password == input) {
+    fetch("/api/session", { method: "POST" });
+    return true;
+  }
+}`;

const key = process.env.GEMINI_API_KEY;
if (!key) throw new Error("Set GEMINI_API_KEY");
const client = createGeminiClient(key);
for (const depth of ["quick", "full"] as const) {
  const t = Date.now();
  const res = await review({ diff, depth }, client);
  console.log(`\n== ${depth} (${Date.now() - t}ms)`, JSON.stringify(res, null, 2));
}
