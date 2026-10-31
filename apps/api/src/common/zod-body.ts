import { BadRequestException } from "@nestjs/common";
import type { z } from "zod";

/** Validates a request body; a failure becomes 400 { message } naming the first bad field. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (result.success) return result.data;
  const issue = result.error.issues[0];
  const field = issue?.path.join(".");
  throw new BadRequestException({
    message: field ? `${field}: ${issue?.message}` : (issue?.message ?? "Invalid request."),
  });
}
