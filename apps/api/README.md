# Revio API

NestJS service behind the Revio GitHub App and the dashboard at revio.charanteja.site.

- `POST /webhooks/github`: GitHub App webhooks (signature checked)
- `GET /me`, `POST /me/github-link`, `GET /repos`, `PATCH /repos/:id`, `GET /reviews`, `GET /reviews/:id`: dashboard API (Supabase sign-in token)
- `GET /health`; Swagger at `/docs`

Pull request reviews run in a pg-boss queue in the same Postgres (3 retries with backoff).

## Run it

```sh
cp .env.example .env      # fill in every value
pnpm build
set -a; . ./.env; set +a
pnpm migrate              # applies migrations via DIRECT_URL
pnpm start                # http://localhost:4000
```

## Create the GitHub App

Quickest: `node scripts/create-github-app.mjs --webhook <smee.io URL>` registers the app from a manifest and writes its credentials into `.env`. Or by hand:

GitHub → Settings → Developer settings → GitHub Apps → New GitHub App:

| Setting                   | Value                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| Homepage URL              | `https://revio.charanteja.site`                                                                  |
| Callback URL              | Supabase's GitHub callback: `https://<project-ref>.supabase.co/auth/v1/callback`                 |
| Webhook URL               | `https://api.revio.charanteja.site/webhooks/github`                                              |
| Webhook secret            | any long random string → `GITHUB_WEBHOOK_SECRET`                                                 |
| Repository permissions    | Pull requests: Read and write · Contents: Read-only · Metadata: Read-only                        |
| Account permissions       | Email addresses: Read-only (Supabase sign-in fails with "Error getting user profile" without it) |
| Subscribe to events       | Pull request                                                                                     |
| Where can it be installed | Any account                                                                                      |

Installation events are sent automatically. Then generate a private key (→ `GITHUB_PRIVATE_KEY`, newlines may be written as `\n`), note the App ID (→ `GITHUB_APP_ID`), and generate a client secret. Put the app's client ID and secret into Supabase → Authentication → Providers → GitHub, so signing in to the dashboard uses the GitHub App.

For local webhook testing, forward GitHub's deliveries with a tunnel (for example `smee.io`) to `http://localhost:4000/webhooks/github`.
