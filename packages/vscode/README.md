# Revio: AI Code Review

Revio reviews every commit you make in VS Code and underlines real problems, with one-click fixes.

## Get started

1. Get a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey).
2. Run **Revio: Set Gemini API Key** from the Command Palette. The key is kept in VS Code's secret storage, never in your settings.
3. Commit as usual. Revio reviews the commit in the background; the status bar shows `Revio: N issues` when it's done.

Problems appear as underlines and in the Problems panel. Where Revio has a fix, the quick fix menu (Ctrl+. / Cmd+.) offers **Apply Revio fix**. Editing a file clears its Revio issues, since the line numbers no longer match.

## Commands

- **Revio: Set Gemini API Key**
- **Revio: Review Last Commit**: review the current commit now
- **Revio: Clear Issues**

## Settings

| Setting         | Default  | What it does                                                                    |
| --------------- | -------- | ------------------------------------------------------------------------------- |
| `revio.enabled` | `true`   | Review each new commit automatically                                            |
| `revio.depth`   | `normal` | `quick` (bugs, security), `normal` (+ performance, quality) or `full` (+ style) |

A `.revio.json` at the repository root can set `depth.vscode`, `ignore` patterns and team `rules`. If it sets `depth.vscode`, that wins over the setting.

## Privacy

Only the changes in each commit are sent to Gemini, with your key. Gitignored files are never sent. Nothing is stored by Revio.

Docs: https://revio.charanteja.site/docs
