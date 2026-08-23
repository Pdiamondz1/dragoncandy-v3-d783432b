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
      //
      // The site is in private preview behind an edge password, so
      // public/robots.txt is `Disallow: /` on purpose. That fails Lighthouse's
      // is-crawlable audit, and measured on the real build it takes
      // categories:seo to 0.69 — under the 0.95 bar asserted below.
      //
      // It has to be skipped at COLLECT time, not silenced at assert time.
      // `assertions: {'is-crawlable': 'off'}` only disables an assertion ON that
      // audit; it cannot change the category score Lighthouse already computed,
      // so categories:seo would still read 0.69 and still fail. skipAudits drops
      // the audit from the run, and the category renormalizes over the audits
      // that remain. Both measured against dist/ on 2026-08-23: 0.69 with the
      // audit, 1.00 with it skipped. `robots-txt` (syntax) still runs and passes.
      //
      // This copy is the default for anyone running lhci locally. It does NOT
      // reach CI on its own: an LHCI_COLLECT__SETTINGS__* env var replaces this
      // whole `settings` object, and lighthouse-ci.yml sets the desktop preset
      // that way. Both jobs there set LHCI_COLLECT__SETTINGS__SKIP_AUDITS too.
      // Change one, change the other.
      //
      // Lowering the 0.95 threshold instead was rejected: it would also stop
      // catching the real SEO regressions the gate exists for (it caught a
      // "Learn more" link-text failure in Aug 2026).
      //
      // Remove this at public launch, in the same change that restores
      // public/robots.txt. Not before.
      // docs/superpowers/specs/2026-08-23-site-access-lockdown-design.md
      settings: {
        skipAudits: ['is-crawlable'],
      },
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
