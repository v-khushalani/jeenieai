import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'ai.jeenie.app',
  appName: 'JEEnie AI',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#013062',
      showSpinner: false,
    },
  },
};

export default config;
