import { describe, expect, it, vi } from "vitest";
import { githubUserApi } from "./github-user-api";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("githubUserApi", () => {
  it("lists installations across pages", async () => {
    const page = (n: number, count: number) =>
      json({
        installations: Array.from({ length: count }, (_, i) => ({
          id: n * 100 + i,
          account: { login: "a", type: "User" },
        })),
      });
    const fetch = vi.fn().mockResolvedValueOnce(page(1, 100)).mockResolvedValueOnce(page(2, 3));
    const list = await githubUserApi(fetch).listInstallations("tok");
    expect(list).toHaveLength(103);
    expect(fetch.mock.calls[0]?.[0]).toBe(
      "https://api.github.com/user/installations?per_page=100&page=1",
    );
    expect(fetch.mock.calls[0]?.[1].headers.Authorization).toBe("Bearer tok");
  });

  it("throws a clear error when GitHub refuses the token", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ message: "Bad credentials" }, 401));
    await expect(githubUserApi(fetch).getUser("tok")).rejects.toThrow(
      /GitHub rejected the sign-in token/,
    );
  });
});
