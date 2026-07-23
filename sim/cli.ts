// CLI entrypoint. Run with tsx (resolves extensionless TS imports on any Node):
//   npx --yes tsx sim/cli.ts dry-run --n 25
//   npx --yes tsx sim/cli.ts mint --n 5      (boot-gated: needs SIM_* + kill switch ON)
//   npx --yes tsx sim/cli.ts tick
//   npx --yes tsx sim/cli.ts purge
//
// Kept separate from run.ts so importing the logic (tests) has no side effects.
import { main } from "./run";

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
