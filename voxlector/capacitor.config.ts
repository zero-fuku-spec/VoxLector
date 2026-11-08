import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.voxlector.ai',
  appName: 'VoxLector AI',
  webDir: 'dist',
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  plugins: {
    Preferences: {
      group: 'voxlector_prefs',
    },
  },
};

export default config;
