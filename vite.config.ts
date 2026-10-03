import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
  resolve: {
    // Use the ORT build that loads its WASM from ort.env.wasm.wasmPaths (/ort/) instead of a bundled copy.
    alias: { 'onnxruntime-web/wasm': fileURLToPath(new URL('./node_modules/onnxruntime-web/dist/ort.wasm.min.mjs', import.meta.url)) },
  },
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      strategies: 'generateSW',
      includeAssets: ['icons/*.png'],
      manifest: {
        name: 'Ami Ama — xem lá cà phê',
        short_name: 'Ami Ama',
        description: 'Xem lá cà phê ngay trên điện thoại, không cần mạng.',
        lang: 'vi',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#faf6ef',
        theme_color: '#1f5130',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything the core loop needs is precached on first load: app, model, WASM runtime, audio, samples.
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,json,onnx,wasm,ogg,mp3,jpg,webmanifest}'],
        maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        // Safety net: anything the precache missed (or a retry fetched) is cached here and served offline.
        runtimeCaching: [
          {
            urlPattern: ({ url }) => /^\/(models|audio|ort|samples)\//.test(url.pathname),
            handler: 'CacheFirst',
            options: { cacheName: 'ami-runtime', cacheableResponse: { statuses: [200] } },
          },
        ],
      },
    }),
  ],
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 },
});
