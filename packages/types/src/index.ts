import { z } from "zod";

export const DepthSchema = z.enum(["quick", "normal", "full"]);
export const CategorySchema = z.enum(["bug", "security", "performance", "quality", "style"]);
export const SeveritySchema = z.enum(["error", "warning", "info"]);

export const IssueSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive(),
  endLine: z.number().int().positive().optional(),
  severity: SeveritySchema,
  category: CategorySchema,
  message: z.string().min(1),
  suggestion: z.string().optional(),
});

/** What the model must return. `warnings` is added by the engine, not the model. */
export const ReviewResultSchema = z.object({
  issues: z.array(IssueSchema),
  summary: z.string().optional(),
  risk: z.enum(["low", "medium", "high"]).optional(),
});

export const RevioConfigSchema = z
  .object({
    depth: z
      .object({ cli: DepthSchema, vscode: DepthSchema, github: DepthSchema })
      .partial()
      .strict()
      .optional(),
    ignore: z.array(z.string()).optional(),
    model: z.string().min(1).optional(),
    rules: z.string().optional(),
  })
  .strict();

export type Depth = z.infer<typeof DepthSchema>;
export type Category = z.infer<typeof CategorySchema>;
export type Severity = z.infer<typeof SeveritySchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type ReviewResult = z.infer<typeof ReviewResultSchema> & { warnings: string[] };
export type RevioConfig = z.infer<typeof RevioConfigSchema>;
