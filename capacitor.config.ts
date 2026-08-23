import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  // com, not io: dragoncandy.com is the company's primary domain as of 2026-08.
  // Immutable once the App Store Connect record exists — changed before that
  // record was created. See docs/superpowers/specs/2026-08-09-ios-testflight-first-build-design.md
  appId: 'com.dragoncandy.app',
  appName: 'DragonCandy',
  webDir: 'dist',
  ios: {
    // `scheme` is the Xcode BUILD scheme name (default 'App') — NOT the WebView
    // URL scheme. The served origin stays capacitor://localhost because we do not
    // set `server.iosScheme`. The Task 5 CSP (capacitor://localhost) is therefore correct.
    scheme: 'DragonCandy',
    // 'never', not 'always'. With 'always' WebKit shrinks documentElement.clientHeight by the
    // top safe-area inset (measured on an iPhone 17 Pro simulator: innerHeight 840 vs
    // clientHeight 778, safeTop 62), so anything sized to a viewport unit — 100dvh here,
    // h-screen in AppShell — is taller than the document box and the webview's own white
    // background shows through beneath it. That band was invisible while the landing footer was
    // itself white; making the footer transparent exposed it.
    // The app already pays back env(safe-area-inset-*) in CSS everywhere it matters
    // (DESIGN_SYSTEM.md), so insetting natively as well was doing the same job twice and
    // disagreeing about the answer. Pick one: CSS.
    contentInset: 'never',
  },
};

export default config;
