import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.nestworth.app',
  appName: 'Nestworth',
  webDir: 'dist',
  plugins: {
    // Route fetch through the native HTTP stack so provider APIs (LLM, mutual
    // funds, FX) work without browser CORS restrictions on device.
    CapacitorHttp: { enabled: true },
  },
}

export default config
