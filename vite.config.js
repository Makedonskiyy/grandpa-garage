import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

// Версия сборки для меню: VITE_* попадает в import.meta.env и в dev, и в build, и в тестах.
process.env.VITE_APP_VERSION = pkg.version;

export default defineConfig({
  // Относительные пути: игра должна работать из dist/ без отдельного сервера (ТЗ 7.6).
  base: './',
  server: {
    port: 5173,
    open: false,
    proxy: {
      '/lobby': 'http://127.0.0.1:8787',
    },
  },
  build: {
    outDir: 'dist',
    assetsInlineLimit: 0, // ассеты из public/ и импортов не инлайним — проще отлаживать загрузчик Phaser
    chunkSizeWarningLimit: 1600, // Phaser сам по себе ~1.2 МБ
    rollupOptions: {
      output: {
        manualChunks: (id) => (id.includes('node_modules/phaser') ? 'phaser' : undefined),
      },
    },
  },
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
  },
});
