module.exports = {
  ci: {
    collect: {
      url: ['http://localhost:8080/landing'],
      startServerCommand: 'npm run preview -- --port 8080',
      startServerReadyPattern: 'Local',
      numberOfRuns: 3,
      // No preset here = Lighthouse default (mobile emulation). The desktop run
      // sets preset=desktop via env in lighthouse-ci.yml; the mobile run uses
      // this default. ("mobile" is not a valid Lighthouse preset.)
    },
    assert: {
      // Bars set from a measured baseline (landing page, median of 3 runs, 2026-06-06):
      // desktop perf 0.99; a11y / best-practices / SEO 1.00 on both desktop & mobile;
      // mobile perf ~0.81. a11y/best-practices/SEO and desktop perf gate at `error`
      // (comfortably below current scores, so they catch real regressions without
      // flaking). The mobile run overrides perf to `warn` via env in lighthouse-ci.yml
      // (mobile perf is a known weak spot — a non-blocking nudge, not a gate).
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
