import { defineConfig } from 'vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: false }),
    react(),
  ],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx'],
  },
  esbuild: {
    jsx: 'automatic',
    loader: 'tsx',
    include: /src\/.*\.(js|jsx|ts|tsx)$/,
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    strictPort: true
  },
  css: {
    postcss: {},
  },
  build: {
    cssCodeSplit: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks: {
          tldraw: ['tldraw', '@tldraw/tldraw']
        }
      }
    }
  },
});
