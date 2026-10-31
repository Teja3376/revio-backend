// Creates the Revio GitHub App from a manifest, then writes its credentials into the env files.
// The owner clicks "Create GitHub App" once on github.com; no secret is copied by hand or printed.
// Usage: node scripts/create-github-app.mjs --webhook <url> [--setup <url>] [--name Revio]
// Docs: https://docs.github.com/apps/sharing-github-apps/registering-a-github-app-from-a-manifest
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const webhook = arg("webhook");
if (!webhook) throw new Error("Pass --webhook <url> (a smee.io channel for local work).");
const setupUrl = arg("setup", "http://localhost:3000/repos");
const name = arg("name", "Revio");
const PORT = 4321;
const state = randomBytes(16).toString("hex");

const manifest = {
  name,
  url: "https://revio.charanteja.site",
  description: "AI code review on every pull request.",
  hook_attributes: { url: webhook, active: true },
  redirect_url: `http://localhost:${PORT}/done`,
  callback_urls: ["https://mtctkobjnubndctyrfqx.supabase.co/auth/v1/callback"],
  setup_url: setupUrl,
  setup_on_update: true,
  public: true,
  request_oauth_on_install: false,
  default_permissions: {
    contents: "read",
    pull_requests: "write",
    metadata: "read",
    emails: "read",
  },
  default_events: ["pull_request"],
};

const apiEnv = fileURLToPath(new URL("../.env", import.meta.url));
const apiEnvExample = fileURLToPath(new URL("../.env.example", import.meta.url));
const webEnv = fileURLToPath(new URL("../../../../revio-frontend/.env.local", import.meta.url));

/** Sets KEY=value lines, replacing existing ones and keeping everything else. */
function setEnv(file, values, template) {
  let text = existsSync(file)
    ? readFileSync(file, "utf8")
    : template && existsSync(template)
      ? readFileSync(template, "utf8")
      : "";
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const re = new RegExp(`^${key}=.*$`, "m");
    text = re.test(text) ? text.replace(re, () => line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  }
  writeFileSync(file, text, { mode: 0o600 });
}

const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const page = (body) => `<!doctype html><meta charset="utf-8"><title>Revio setup</title>
<body style="font:16px system-ui;background:#0d060f;color:#e4e1e0;display:grid;place-items:center;min-height:100vh">${body}</body>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      page(`<form action="https://github.com/settings/apps/new?state=${state}" method="post">
        <input type="hidden" name="manifest" value="${escapeHtml(JSON.stringify(manifest))}">
        <p>Sending you to GitHub to create the <b>${escapeHtml(name)}</b> GitHub App…</p>
        <button type="submit">Continue to GitHub</button></form>
        <script>document.forms[0].submit()</script>`),
    );
    return;
  }
  if (url.pathname === "/done") {
    if (url.searchParams.get("state") !== state) {
      res.writeHead(400).end("State mismatch; start again.");
      return;
    }
    const code = url.searchParams.get("code");
    const r = await fetch(`https://api.github.com/app-manifests/${code}/conversions`, {
      method: "POST",
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!r.ok) {
      res.writeHead(500).end(`GitHub said ${r.status}. Start again.`);
      console.error(`Conversion failed: ${r.status} ${await r.text()}`);
      process.exit(1);
    }
    const app = await r.json();
    setEnv(
      apiEnv,
      {
        GITHUB_APP_ID: String(app.id),
        GITHUB_PRIVATE_KEY: `"${app.pem.trim().replace(/\n/g, "\\n")}"`,
        GITHUB_WEBHOOK_SECRET: app.webhook_secret,
        GITHUB_CLIENT_ID: app.client_id,
        GITHUB_CLIENT_SECRET: app.client_secret,
      },
      apiEnvExample,
    );
    setEnv(webEnv, { NEXT_PUBLIC_GITHUB_APP_INSTALL_URL: `${app.html_url}/installations/new` });
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(
      page(`<p>Done. <b>${escapeHtml(app.name)}</b> is created; you can close this tab.</p>`),
    );
    console.log(`Created ${app.html_url} (App ID ${app.id}).`);
    console.log(
      "Wrote GITHUB_APP_ID, GITHUB_PRIVATE_KEY, GITHUB_WEBHOOK_SECRET, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET to apps/api/.env",
    );
    console.log("Wrote NEXT_PUBLIC_GITHUB_APP_INSTALL_URL to revio-frontend/.env.local");
    server.close();
    return;
  }
  res.writeHead(404).end();
});

server.listen(PORT, () => console.log(`Open http://localhost:${PORT} to create the GitHub App.`));
