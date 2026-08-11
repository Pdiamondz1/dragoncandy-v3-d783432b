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
    contentInset: 'always',
  },
};

export default config;
