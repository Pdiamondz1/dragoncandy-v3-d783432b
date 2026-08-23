// Vitest global setup.
//
// Node 24 introduced a built-in `localStorage` global that is `undefined` unless the
// runtime is started with `--localstorage-file`. Under `@vitest-environment jsdom`
// that built-in shadows the `localStorage` jsdom provides, so any test whose setup
// calls `localStorage.clear()` dies with "Cannot read properties of undefined".
// Measured on Node 26.7.0: 50 tests across 3 files, all of which CI (Node 24) passes.
//
// The fix restores jsdom's own Storage when it is being shadowed, and otherwise
// installs a minimal in-memory Storage so the `environment: 'node'` files that reach
// for it still behave. It deliberately does NOT run when a working `localStorage` is
// already present, so a correct runtime is left completely alone.

function createMemoryStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    get length() {
      return Object.keys(store).length;
    },
    key: (i: number) => Object.keys(store)[i] ?? null,
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = String(v);
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      store = {};
    },
  } as Storage;
}

function ensureStorage(name: 'localStorage' | 'sessionStorage'): void {
  const g = globalThis as unknown as Record<string, unknown>;

  // Already working — leave it alone.
  if (g[name] !== undefined && g[name] !== null) return;

  // Under jsdom the real Storage lives on `window`; prefer it over a stand-in so
  // tests keep whatever behaviour jsdom actually implements.
  const w = g.window as (Window & typeof globalThis) | undefined;
  const fromWindow = w?.[name];

  Object.defineProperty(globalThis, name, {
    value: fromWindow ?? createMemoryStorage(),
    configurable: true,
    writable: true,
  });
}

ensureStorage('localStorage');
ensureStorage('sessionStorage');
