import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../..');
const PRODUCTION_API_URL = 'https://api.tournament.pixelpaddle.com';

function forbidLocalhostApiInProd(): Plugin {
  return {
    name: 'forbid-localhost-api-in-prod',
    apply: 'build',
    closeBundle() {
      const assetsDir = path.resolve(__dirname, 'dist/assets');
      if (!fs.existsSync(assetsDir)) return;
      for (const file of fs.readdirSync(assetsDir)) {
        if (!file.endsWith('.js')) continue;
        const content = fs.readFileSync(path.join(assetsDir, file), 'utf8');
        if (content.includes('localhost:3000') || content.includes('127.0.0.1:3000')) {
          throw new Error(
            `[forbid-localhost-api] ${file} contains localhost:3000 — must use ${PRODUCTION_API_URL}`
          );
        }
      }
      const main = fs
        .readdirSync(assetsDir)
        .find((f) => f.startsWith('index-') && f.endsWith('.js') && fs.statSync(path.join(assetsDir, f)).size > 100_000);
      if (main) {
        const content = fs.readFileSync(path.join(assetsDir, main), 'utf8');
        if (!content.includes('api.tournament.pixelpaddle.com')) {
          throw new Error(`[forbid-localhost-api] ${main} missing ${PRODUCTION_API_URL}`);
        }
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, monorepoRoot, '');
  const fromEnv = (env.VITE_API_URL || process.env.VITE_API_URL || '').trim();

  // Production / preview builds: always public API. Never localhost.
  // Dev server: allow VITE_API_URL or local API for `pnpm --filter web dev`.
  const appApiUrl =
    mode === 'development'
      ? fromEnv || 'http://localhost:3000'
      : fromEnv && !/localhost|127\.0\.0\.1/i.test(fromEnv)
        ? fromEnv
        : PRODUCTION_API_URL;

  return {
    envDir: monorepoRoot,
    define: {
      __APP_API_URL__: JSON.stringify(appApiUrl),
    },
    plugins: [react(), tailwindcss(), ...(mode === 'production' ? [forbidLocalhostApiInProd()] : [])],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
    build: {
      target: 'es2020',
      cssCodeSplit: true,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes('node_modules')) return;
            if (id.includes('@stripe')) return 'vendor-stripe';
            if (id.includes('lenis') || id.includes('motion')) return 'vendor-motion';
            if (id.includes('socket.io')) return 'vendor-socket';
            if (id.includes('@tanstack')) return 'vendor-query';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (
              id.includes('react-router') ||
              id.includes('react-dom') ||
              /node_modules[\\/]react[\\/]/.test(id)
            ) {
              return 'vendor-react';
            }
          },
        },
      },
    },
  };
});
