/// <reference types="vitest/config" />
import { playwright } from '@vitest/browser-playwright'
import { defineConfig, type Plugin } from 'vite'
import { VitePWA } from 'vite-plugin-pwa';
import { viteStaticCopy } from 'vite-plugin-static-copy';

/**
 * Sub-path deployments (GitHub Pages project sites) set BASE_PATH, e.g. '/qrcode-studio/'.
 * Dev and root deployments leave it unset.
 */
const base = process.env.BASE_PATH || '/';

/** Keeps <base href> in sync with the build base - @vaadin/router derives its baseUrl from it. */
function syncBaseHref(): Plugin {
  return {
    name: 'sync-base-href',
    transformIndexHtml: {
      order: 'post',
      handler: (html: string) => html.replace(/<base href="[^"]*">/, `<base href="${base}">`),
    },
  };
}

export default defineConfig({
  base,
  build: {
    rollupOptions: {
      output: {
        entryFileNames: '[hash].js',
        chunkFileNames: '[hash].js',
        assetFileNames: '[hash][extname]',
      },
      onwarn: (warning: any, warn: any) => {
        if (warning.code === 'THIS_IS_UNDEFINED') return;
        warn(warning);
      },
    },
    target: 'es2021',
    minify: 'terser',
    chunkSizeWarningLimit: 10 * 1024 * 1024 // 10 MB
  },
  test: {
    browser: {
      enabled: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }]
    }
  },
  plugins: [
    syncBaseHref(),
    /** Copy static assets */
    viteStaticCopy({
      targets: [
        { src: 'src/assets', dest: '.' }
      ],
      silent: true,
    }),
    /** PWA Plugin for service worker generation */
    VitePWA({
      registerType: 'autoUpdate',
      strategies: 'generateSW',
      workbox: {
        globDirectory: 'dist',
        globPatterns: ['**/*.{html,js,css,webmanifest}'],
        globIgnores: ['polyfills/*.js', 'nomodule-*.js'],
        // Relative so it resolves against the service worker scope under any base.
        navigateFallback: 'index.html',
        runtimeCaching: [
          {
            urlPattern: /^polyfills\/.*\.js$/,
            handler: 'CacheFirst',
          },
        ],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // 10 MB
      },
      manifest: {
        theme_color: "#ffffff"
      }
    }),
  ],
});
