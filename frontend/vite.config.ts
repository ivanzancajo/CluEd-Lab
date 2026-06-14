import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import istanbul from 'vite-plugin-istanbul';

const coverageEnabled = process.env.COVERAGE === 'true';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    ...(coverageEnabled
      ? [
          istanbul({
            include: ['src/**/*', 'components/**/*', 'routes.ts'],
            exclude: ['node_modules', 'cypress', 'components/ui/**'],
            extension: ['.ts', '.tsx'],
            requireEnv: false,
          }),
        ]
      : []),
  ],
  server: {
    port: 5173,
    host: '0.0.0.0',
    watch: {
      usePolling: true,
    },
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://localhost:4000',
        changeOrigin: true,
        ws: true,
      },
    },
    fs: {
      allow: [resolve(__dirname, '..')],
    },
  },
  preview: {
    port: 4173,
    host: '0.0.0.0',
  },
});