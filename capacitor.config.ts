import type { CapacitorConfig } from '@capacitor/cli';

// The native shell loads the deployed Next.js app (API routes need a server, so a
// static export is not possible). Override for local testing with
//   CAP_SERVER_URL=http://<your-mac-lan-ip>:3000 npx cap sync android
const SERVER_URL = process.env.CAP_SERVER_URL ?? 'https://transbridge.vercel.app';

const config: CapacitorConfig = {
  appId: 'kr.medtranslate.app',
  appName: 'MedTranslate',
  webDir: 'capacitor-web',
  server: {
    url: SERVER_URL,
    cleartext: SERVER_URL.startsWith('http://'),
  },
  android: {
    allowMixedContent: false,
  },
};

export default config;
