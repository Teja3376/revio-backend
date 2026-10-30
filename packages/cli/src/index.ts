#!/usr/bin/env node
import { Command, CommanderError, Option } from "commander";
import { runReview } from "./commands/review";

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

try {
  await program.parseAsync();
} catch (e) {
  if (!(e instanceof CommanderError)) throw e;
  // help and --version exit 0; every usage error is exit 2
  process.exitCode = e.exitCode === 0 ? 0 : 2;
}
