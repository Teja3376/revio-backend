import type { GithubUserApi } from "../installations/installations.service";

type Fetch = typeof fetch;

/** GitHub REST calls made with a user's token (the GitHub App's user-to-server token). */
export function githubUserApi(fetchImpl: Fetch = fetch): GithubUserApi {
  async function get<T>(path: string, token: string): Promise<T> {
    const res = await fetchImpl(`https://api.github.com${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (res.status === 401) throw new Error("GitHub rejected the sign-in token. Sign in again.");
    if (!res.ok) throw new Error(`GitHub request failed (${res.status}) for ${path}`);
    return (await res.json()) as T;
  }

  return {
    getUser: (token) => get("/user", token),
    async listInstallations(token) {
      type Page = { installations: { id: number; account: { login: string; type: string } }[] };
      const all: Page["installations"] = [];
      for (let page = 1; ; page++) {
        const { installations } = await get<Page>(
          `/user/installations?per_page=100&page=${page}`,
          token,
        );
        all.push(
          ...installations.map((i) => ({
            id: i.id,
            account: { login: i.account.login, type: i.account.type },
          })),
        );
        if (installations.length < 100) return all;
      }
    },
    async listInstallationRepos(token, installationId) {
      type Page = { repositories: { id: number; full_name: string }[] };
      const all: Page["repositories"] = [];
      for (let page = 1; ; page++) {
        const { repositories } = await get<Page>(
          `/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
          token,
        );
        all.push(...repositories.map((r) => ({ id: r.id, full_name: r.full_name })));
        if (repositories.length < 100) return all;
      }
    },
  };
}
