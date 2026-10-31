import { Controller, Get, type INestApplication, UseGuards } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import request from "supertest";
import { afterAll, beforeAll, describe, it } from "vitest";
import { type AuthUser, CurrentUser } from "./current-user";
import { JWT_VERIFIER, jwtVerifier, SupabaseJwtGuard } from "./jwt.guard";

@Controller("whoami")
@UseGuards(SupabaseJwtGuard)
class WhoAmI {
  @Get()
  get(@CurrentUser() user: AuthUser) {
    return user;
  }
}

const USER = "5f0c1f9e-1d1a-4b0e-9a49-3f1f3b1f6a10";
let app: INestApplication;
let sign: (claims: Record<string, unknown>, exp?: string) => Promise<string>;
let foreign: string;

beforeAll(async () => {
  const { publicKey, privateKey } = await generateKeyPair("ES256");
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "ES256" };
  sign = (claims, exp = "1h") =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "ES256", kid: "k1" })
      .setExpirationTime(exp)
      .sign(privateKey);

  const other = await generateKeyPair("ES256");
  foreign = await new SignJWT({ sub: USER, aud: "authenticated" })
    .setProtectedHeader({ alg: "ES256", kid: "k1" })
    .setExpirationTime("1h")
    .sign(other.privateKey);

  const mod = await Test.createTestingModule({
    controllers: [WhoAmI],
    providers: [
      SupabaseJwtGuard,
      { provide: JWT_VERIFIER, useValue: jwtVerifier(createLocalJWKSet({ keys: [jwk] })) },
    ],
  }).compile();
  app = mod.createNestApplication();
  await app.init();
});
afterAll(() => app.close());

const get = (token?: string) => {
  const r = request(app.getHttpServer()).get("/whoami");
  return token ? r.set("Authorization", `Bearer ${token}`) : r;
};

describe("SupabaseJwtGuard", () => {
  it("lets a signed-in user through and exposes their id", async () => {
    await get(await sign({ sub: USER, aud: "authenticated" })).expect(200, { id: USER });
  });

  it("rejects a request with no token", async () => {
    await get().expect(401);
  });

  it("rejects an expired token", async () => {
    await get(await sign({ sub: USER, aud: "authenticated" }, "-1m")).expect(401);
  });

  it("rejects a token for another audience", async () => {
    await get(await sign({ sub: USER, aud: "anon" })).expect(401);
  });

  it("rejects a token signed with another key", async () => {
    await get(foreign).expect(401);
  });

  it("rejects a token without a user id", async () => {
    await get(await sign({ aud: "authenticated" })).expect(401);
  });
});
