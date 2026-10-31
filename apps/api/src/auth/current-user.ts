import { createParamDecorator, type ExecutionContext } from "@nestjs/common";

export type AuthUser = { id: string };

/** The signed-in user, set by SupabaseJwtGuard. */
export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
