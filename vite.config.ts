import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

const version = (JSON.parse(readFileSync('./package.json', 'utf8')) as { version: string }).version;
import { VitePWA } from 'vite-plugin-pwa';

// The app is served from the same origin as the Hearth server's /api and /ws (a reverse proxy does that, see docs/DEPLOY.md);
// in development Vite forwards them to HEARTH_SERVER (default http://localhost:18200, the scratch server).
const server = process.env.HEARTH_SERVER ?? 'http://localhost:18200';

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'Ember',
        short_name: 'Ember',
        description: 'Ember in the browser: a messenger for a Hearth server.',
        id: '/',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#FFFBF8',
        theme_color: '#E8590C',
        categories: ['social', 'communication'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: { globPatterns: ['**/*.{js,css,html,svg,png,woff2,webmanifest}'], maximumFileSizeToCacheInBytes: 6 * 1024 * 1024 },
    }),
  ],
  server: {
    port: 5180,
    proxy: {
      '/api': { target: server, changeOrigin: false },
      '/ws': { target: server.replace(/^http/, 'ws'), ws: true },
    },
  },
  preview: { port: 18300, proxy: { '/api': { target: server }, '/ws': { target: server.replace(/^http/, 'ws'), ws: true } } },
  build: { target: 'es2022', sourcemap: true },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
    globals: true,
  },
});
