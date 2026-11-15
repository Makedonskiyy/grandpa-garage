import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'));

export default defineConfig({
  // Относительные пути: игра должна работать из dist/ без отдельного сервера (ТЗ 7.6).
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 5173,
    open: false,
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
