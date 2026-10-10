import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react(), tailwindcss()],
    build: {
      rolldownOptions: {
        output: {
          // Split the libraries into their own files: they change rarely, so browsers keep them cached
          // between releases, and no single file grows past the size warning.
          codeSplitting: {
            groups: [
              { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\//, priority: 40 },
              { name: 'radix', test: /node_modules\/@radix-ui\//, priority: 30 },
              { name: 'motion', test: /node_modules\/(motion|motion-dom|motion-utils|framer-motion)\//, priority: 20 },
              { name: 'icons', test: /node_modules\/lucide-react\//, priority: 10 },
            ],
          },
        },
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.API_PROXY_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      css: false,
      testTimeout: 15000,
    },
  };
});
