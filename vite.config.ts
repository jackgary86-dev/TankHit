import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  build: { chunkSizeWarningLimit: 1200 },
  test: { include: ['tests/**/*.test.ts'] },
} as any);
