import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.robin.app',
  appName: 'Robin',
  webDir: 'dist',
  plugins: {
    Keyboard: {
      resize: 'body'
    }
  },
  server: {
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true
  },
  ios: {
    contentInset: 'always'
  }
};

// Add orientation lock if possible via config (Capacitor doesn't have a top-level orientation key, but we can set it in AndroidManifest)
// Note: Capacitor Config doesn't strictly have "screenOrientation" at top level but some plugins or custom configs might use it.
// We'll rely on AndroidManifest for Android.


export default config;
