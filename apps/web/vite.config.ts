import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const monorepoRoot = path.resolve(__dirname, '../..');

export default defineConfig(({ mode }) => {
  // Load monorepo root .env (not just apps/web/.env)
  const env = loadEnv(mode, monorepoRoot, '');
  const apiUrl = env.VITE_API_URL || process.env.VITE_API_URL || '';

  if (mode === 'production') {
    if (!apiUrl) {
      throw new Error(
        'VITE_API_URL is required for production builds. Set it in the repo-root .env (e.g. https://api.tournament.pixelpaddle.com).'
      );
    }
    if (/localhost|127\.0\.0\.1/i.test(apiUrl)) {
      throw new Error(
        `Refusing production build with localhost API URL: ${apiUrl}. Set VITE_API_URL to your public HTTPS API host.`
      );
    }
  }

  return {
    envDir: monorepoRoot,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: true,
    },
  };
});
