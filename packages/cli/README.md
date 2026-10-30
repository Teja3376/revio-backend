# Revio CLI

AI code review in your terminal. Quiet by default: it prints only when it finds a real problem.

```sh
npm i -g @revio/cli
export GEMINI_API_KEY=your-key   # from https://aistudio.google.com
```

Requires Node 22.12+ and git.

## Commands

| Command                               | What it does                                           |
| ------------------------------------- | ------------------------------------------------------ |
| `revio review`                        | Review uncommitted changes vs `HEAD`                   |
| `revio review --staged`               | Review only staged changes                             |
| `revio review --base main`            | Review everything on your branch since `main`          |
| `revio watch`                         | Review each file a couple of seconds after you save it |
| `revio hook install`                  | Run a review before every commit (warns only)          |
| `revio hook install --block-on error` | Same, but stop the commit on errors                    |
| `revio hook uninstall`                | Remove the pre-commit review                           |

Options: `--depth quick|normal|full` (default `quick`: bugs and security only), `--block-on error|warning|info`.

Exit codes: `0` ok · `1` issues at or above `--block-on` · `2` setup, config or Gemini error.

## Config: `.revio.json` (optional, in the repo root)

```json
{
  "depth": { "cli": "quick" },
  "ignore": ["**/*.snap", "docs/**"],
  "model": "gemini-flash-latest",
  "rules": "We use zod for all input validation."
}
```

Lockfiles, `dist/`, `build/`, minified and map files are always skipped.
