import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { type JWTVerifyGetKey, jwtVerify } from "jose";
import type { AuthUser } from "./current-user";

export type JwtVerifier = (token: string) => Promise<AuthUser>;
export const JWT_VERIFIER = Symbol("JWT_VERIFIER");

/** Verifies a Supabase access token against the project's signing keys. */
export function jwtVerifier(keys: JWTVerifyGetKey): JwtVerifier {
  return async (token) => {
    const { payload } = await jwtVerify(token, keys, { audience: "authenticated" });
    if (!payload.sub) throw new Error("token has no subject");
    return { id: payload.sub };
  };
}

@Injectable()
export class SupabaseJwtGuard implements CanActivate {
  constructor(@Inject(JWT_VERIFIER) private readonly verify: JwtVerifier) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const header: string | undefined = req.headers.authorization;
    const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException({ message: "Sign in to continue." });
    try {
      req.user = await this.verify(token);
      return true;
    } catch {
      throw new UnauthorizedException({ message: "Your session has expired. Sign in again." });
    }
  }
}
