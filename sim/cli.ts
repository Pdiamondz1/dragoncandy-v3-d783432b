// CLI entrypoint. Run with tsx (resolves extensionless TS imports on any Node). tsx is a
// lockfile-pinned root devDependency, so `npx tsx` uses the local binary after `npm install`
// (the CI workflow calls node_modules/.bin/tsx directly — never `npx --yes`, see the workflow):
//   npx tsx sim/cli.ts dry-run --n 25
//   npx tsx sim/cli.ts mint --n 5      (boot-gated: needs SIM_* + kill switch ON)
//   npx tsx sim/cli.ts tick
//   npx tsx sim/cli.ts purge
//
// Kept separate from run.ts so importing the logic (tests) has no side effects.
import { main } from "./run";

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
