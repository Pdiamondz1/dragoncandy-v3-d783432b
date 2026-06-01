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
    // Unit tests only — Playwright e2e specs live in tests/e2e and run via playwright.config.ts
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
  },
}));
