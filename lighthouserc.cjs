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
      // Report-only for now (warn): this file was previously deleted, so there is
      // no trusted current baseline. warn keeps the check green while CI prints
      // the real desktop + mobile scores; the stable categories get promoted back
      // to `error` (at data-driven bars) once a baseline is established.
      // The mobile run overrides the perf assertion via env in lighthouse-ci.yml.
      assertions: {
        'categories:performance': ['warn', { minScore: 0.9 }],
        'categories:accessibility': ['warn', { minScore: 1.0 }],
        'categories:best-practices': ['warn', { minScore: 0.95 }],
        'categories:seo': ['warn', { minScore: 0.95 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
