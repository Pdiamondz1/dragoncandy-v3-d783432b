import { defineConfig } from "vite";
import { configDefaults } from 'vitest/config';
import react from "@vitejs/plugin-react-swc";
import mdx from "@mdx-js/rollup";
import remarkFrontmatter from "remark-frontmatter";
import remarkGfm from "remark-gfm";
import path from "path";
import { writeFileSync } from 'fs';
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "127.0.0.1",
    port: 8080,
  },
  define: {
    /**
     * The investor deck's confidential gate, as a literal `true`/`false` in the output.
     *
     * The spec assumed `import.meta.env.VITE_PITCH_CONFIDENTIAL` would fold on its own.
     * It does not when the variable is UNSET — which is precisely the default public
     * build. Vite leaves an unknown key as a runtime property lookup on `import.meta.env`,
     * so `undefined === '1'` is evaluated at runtime, neither branch is dead, and Rollup
     * keeps the confidential module. `npm run pitch:verify-public` caught exactly that:
     * every budget line label and the use-of-funds buckets were sitting in the public
     * bundle, hidden behind a false condition rather than absent.
     *
     * A `define` is substituted unconditionally, so the ternary folds and the import goes
     * with it. The assertion over dist/ is what proves it, not this comment.
     */
    __PITCH_CONFIDENTIAL__: JSON.stringify(process.env.VITE_PITCH_CONFIDENTIAL === '1'),
  },
  plugins: [
    mdx({ remarkPlugins: [remarkFrontmatter, remarkGfm] }),
    react(),
    mode === 'development' &&
    componentTagger(),
    mode === 'production' && {
      name: 'generate-version-json',
      closeBundle() {
        const hash = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        const content = JSON.stringify({ hash, built: new Date().toISOString() });
        writeFileSync(path.resolve(__dirname, 'dist/version.json'), content);
      },
    },
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      /**
       * The investor deck's confidential figures, resolved to a stub unless the build
       * asks for them.
       *
       * Dead-code elimination alone was not enough, and the difference is worth keeping.
       * With `__PITCH_CONFIDENTIAL__` folded to `false`, Rollup did drop the branch and
       * the numbers really were absent from the emitted JavaScript — but the module was
       * still in the graph, so `sourcesContent` in `PitchDeck-*.js.map` carried the
       * entire budget, every salary line included. Sourcemaps are deployed and fetchable;
       * that is a leak, and only `npm run pitch:verify-public` (which scans `.map` as
       * well as `.js`) would ever have said so.
       *
       * Swapping the module at resolution means it does not enter the graph at all, so
       * there is nothing for a sourcemap to embed. The gate is now two independent
       * mechanisms — the alias and the folded constant — and the assertion checks both
       * at once.
       */
      "@pitch/confidential": path.resolve(
        __dirname,
        process.env.VITE_PITCH_CONFIDENTIAL === '1'
          ? "./src/pitch/model/confidential.ts"
          : "./src/pitch/model/confidential.stub.ts",
      ),
    },
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
  build: {
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-supabase': ['@supabase/supabase-js'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'node',
    // Node 24+ ships a built-in `localStorage` that is undefined without
    // --localstorage-file, and it shadows the one jsdom provides. See vitest.setup.ts.
    setupFiles: ['./vitest.setup.ts'],
    // Playwright e2e specs live in tests/e2e and run via playwright.config.ts.
    // supabase/ holds Deno edge functions: their Deno-style tests (https:// std
    // imports) can't run under Vitest, so exclude those by path. But pure,
    // dependency-free edge logic (capture.ts, reconcile.ts) ships a vitest-style
    // *.test.ts that DOES run here for real CI coverage.
    exclude: [
      ...configDefaults.exclude,
      'tests/e2e/**',
      'supabase/functions/_shared/flush-pending-balance.test.ts',
      'supabase/functions/release-creator-payout/wallet-first.test.ts',
    ],
  },
}));
