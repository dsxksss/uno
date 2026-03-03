import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      host: true,
      // Exclude backend from being watched by Vite dev server
      watch: {
        ignored: ['**/backend/**'],
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/ws': {
          target: 'ws://127.0.0.1:8080',
          ws: true,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ws/, '/ws'),
          secure: false, // Useful if the target is local and not SSL
        },
      },
    },
  };
});
