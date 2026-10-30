#!/usr/bin/env node
import { Command, CommanderError, Option } from "commander";
import { installHook, uninstallHook } from "./commands/hook";
import { clientFromEnv, runReview } from "./commands/review";
import { startWatch } from "./commands/watch";

const depthOption = () =>
  new Option("-d, --depth <depth>", "review depth").choices(["quick", "normal", "full"]);
const blockOption = () =>
  new Option("--block-on <severity>", "exit 1 when an issue is at least this severe").choices([
    "error",
    "warning",
    "info",
  ]);

const program = new Command()
  .name("revio")
  .description("AI code review in your terminal.")
  .version("0.1.0")
  .exitOverride();

program
  .command("review")
  .description("Review uncommitted changes (default), staged changes, or a branch.")
  .option("-s, --staged", "review staged changes only")
  .option("-b, --base <ref>", "review commits since <ref> (e.g. main)")
  .addOption(depthOption())
  .addOption(blockOption())
  .action(async (opts) => {
    process.exitCode = await runReview({
      cwd: process.cwd(),
      ...opts,
      env: process.env,
      out: (s) => console.log(s),
    });
  });

program
  .command("watch")
  .description("Quietly review each file when you save it.")
  .addOption(depthOption())
  .action(async (opts) => {
    const client = clientFromEnv(process.env);
    if (!client) {
      console.log("Set GEMINI_API_KEY to use Revio.");
      process.exitCode = 2;
      return;
    }
    try {
      const w = await startWatch({
        cwd: process.cwd(),
        depth: opts.depth,
        client,
        out: (s) => console.log(s),
      });
      console.log(`Revio watching ${w.root} (quick review on save). Ctrl+C to stop.`);
      process.once("SIGINT", () => void w.stop().then(() => process.exit(0)));
    } catch (e) {
      console.log((e as Error).message);
      process.exitCode = 2;
    }
  });

const hook = program.command("hook").description("Run Revio before every git commit.");

const runHook = (fn: () => Promise<void>) => async () => {
  try {
    await fn();
  } catch (e) {
    console.log((e as Error).message);
    process.exitCode = 2;
  }
};

hook
  .command("install")
  .description("Add a pre-commit check (warns only, unless --block-on is set).")
  .addOption(blockOption())
  .action((opts) =>
    runHook(async () => {
      const file = await installHook(process.cwd(), { blockOn: opts.blockOn });
      console.log(`Revio pre-commit hook installed at ${file}`);
    })(),
  );

hook
  .command("uninstall")
  .description("Remove the Revio pre-commit check.")
  .action(
    runHook(async () => {
      await uninstallHook(process.cwd());
      console.log("Revio pre-commit hook removed.");
    }),
  );

try {
  await program.parseAsync();
} catch (e) {
  if (!(e instanceof CommanderError)) throw e;
  // help and --version exit 0; every usage error is exit 2
  process.exitCode = e.exitCode === 0 ? 0 : 2;
}
