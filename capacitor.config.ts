import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.dragoncandy.app',
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
