// CLI entrypoint. Run with tsx (resolves extensionless TS imports on any Node). tsx is a
// lockfile-pinned root devDependency, so `npx tsx` uses the local binary after `npm install`
// (the CI workflow calls node_modules/.bin/tsx directly — never `npx --yes`, see the workflow):
//   npx tsx sim/cli.ts dry-run --n 25
//   npx tsx sim/cli.ts mint --n 5      (boot-gated: needs SIM_* + kill switch ON)
//   npx tsx sim/cli.ts bulk-seed --n 200 --active 25 --creator-split 0.65   (boot-gated)
//   npx tsx sim/cli.ts tick
//   npx tsx sim/cli.ts purge
//   npx tsx sim/cli.ts avatars-generate --dry-run          (prints the cost estimate, spends nothing)
//   npx tsx sim/cli.ts avatars-generate --count 1500       (PAID — needs SIM_OPENAI_API_KEY + SIM_IMAGE_MODEL)
//   npx tsx sim/cli.ts avatars-apply                       (points synthetic profiles at the pool)
//   npx tsx sim/cli.ts avatars-purge                       (deletes the face pool — NOT part of marketplace-purge)
//   npx tsx sim/cli.ts content-generate --dry-run          (work-sample pool; spends nothing)
//   npx tsx sim/cli.ts content-generate --count 1800       (PAID — same env as avatars-generate)
//   npx tsx sim/cli.ts content-apply                       (3 portfolio samples/creator + DragonFeed posts)
//   npx tsx sim/cli.ts content-purge                       (work pool + portfolios + seeded posts)
//
// Kept separate from run.ts so importing the logic (tests) has no side effects.
import { main } from "./run";

main(process.argv.slice(2)).catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
