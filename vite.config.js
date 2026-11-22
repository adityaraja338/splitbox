import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Unique id per build. The app compares it with /version.json to spot a newer deploy while open.
const BUILD_ID = Date.now().toString(36);

const versionFile = () => ({
  name: 'splitbox-version-file',
  apply: 'build',
  generateBundle() {
    this.emitFile({ type: 'asset', fileName: 'version.json', source: JSON.stringify({ build: BUILD_ID }) });
  },
});

export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(BUILD_ID) },
  plugins: [
    react(),
    versionFile(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: false, // registered in src/components/Pwa.jsx
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Splitbox — split trip expenses',
        short_name: 'Splitbox',
        description: 'Split trip expenses with friends. Free, no sign-up — just share the link.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f1413',
        theme_color: '#0f766e',
        categories: ['finance', 'travel', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        // The HTML page is NOT precached: it's fetched fresh (network-first) by the service worker.
        globPatterns: ['**/*.{js,css,svg,png,webmanifest}'],
        globIgnores: ['sw.js', 'version.json'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
