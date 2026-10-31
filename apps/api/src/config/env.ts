import { z } from "zod";

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1),
  SUPABASE_JWKS_URL: z.url(),
  GITHUB_APP_ID: z.string().min(1),
  // Hosts often store PEM keys on one line with literal \n.
  GITHUB_PRIVATE_KEY: z
    .string()
    .min(1)
    .transform((k) => k.replace(/\\n/g, "\n")),
  GITHUB_WEBHOOK_SECRET: z.string().min(1),
  GEMINI_API_KEY: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().default("http://localhost:3000"),
  REVIO_DAILY_REVIEW_CAP: z.coerce.number().int().positive().default(50),
});

export type Env = z.infer<typeof EnvSchema>;

/** Nest injection token for the validated env. */
export const ENV = Symbol("ENV");

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n  ${problems.join("\n  ")}`);
  }
  return parsed.data;
}
