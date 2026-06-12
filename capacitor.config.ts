import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'app.lovable.96499479549949ee9a2ac61520e53433',
  appName: 'JEEnie AI',
  webDir: 'dist',
  server: {
    url: 'https://96499479-5499-49ee-9a2a-c61520e53433.lovableproject.com?forceHideBadge=true',
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#013062',
      showSpinner: false,
    },
  },
};

export default config;
