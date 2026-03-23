import path from 'path';

/* eslint-disable import/no-extraneous-dependencies */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import svgr from 'vite-plugin-svgr';

const shimsDir = path.resolve(__dirname, 'src/shims');
const coreDir = path.resolve(__dirname, '../../blocklets/core');
const packagesDir = path.resolve(__dirname, '../../packages');

export default defineConfig({
  plugins: [
    react(),
    svgr({
      svgrOptions: {
        exportType: 'named',
        ref: true,
        svgo: false,
        titleProp: true,
      },
      include: ['**/*.svg'],
    }),
  ],
  resolve: {
    alias: {
      // --- Shim: @blocklet/* packages ---
      '@blocklet/js-sdk': path.join(shimsDir, 'blocklet-js-sdk.ts'),
      '@blocklet/sdk': path.join(shimsDir, 'blocklet-sdk.ts'),
      '@blocklet/ui-react/lib/Dashboard': path.join(shimsDir, 'blocklet-ui-react-dashboard.tsx'),
      '@blocklet/ui-react/lib/Header': path.join(shimsDir, 'blocklet-ui-react-header.tsx'),
      '@blocklet/ui-react/lib/Footer': path.join(shimsDir, 'blocklet-ui-react-footer.tsx'),
      '@blocklet/ui-react/lib/UserCenter': path.join(shimsDir, 'blocklet-ui-react-usercenter.tsx'),
      '@blocklet/ui-react': path.join(shimsDir, 'blocklet-ui-react-dashboard.tsx'),
      '@blocklet/payment-react': path.join(shimsDir, 'blocklet-payment-react.tsx'),
      '@blocklet/payment-js': path.join(shimsDir, 'blocklet-payment-js.ts'),
      '@blocklet/error': path.join(shimsDir, 'blocklet-error.ts'),

      // --- Shim: @arcblock/* packages that depend on Blocklet Server ---
      '@arcblock/did-connect-react/lib/Session': path.join(shimsDir, 'did-connect-react-session.tsx'),
      '@arcblock/did-connect-react/lib/Button': path.join(shimsDir, 'did-connect-react-session.tsx'),
      '@arcblock/ws': path.join(shimsDir, 'arcblock-ws.ts'),

      // --- Real: packages that work as-is ---
      // @arcblock/ux — pure UI, no shim needed
      // @arcblock/did — pure utility, no shim needed
      // @mui/* — direct usage

      // --- Alias: project source code ---
      '@app/icons': path.resolve(__dirname, 'src/icons'),
      '@app': path.join(coreDir, 'src'),
      '@blocklet/aigne-hub': path.join(packagesDir, 'ai-kit/src'),

      // --- Utility aliases ---
      lodash: 'lodash-es',
    },
    dedupe: ['@mui/material', '@mui/utils', '@mui/icons-material', 'react', 'react-dom', 'axios'],
  },
  server: {
    fs: {
      // Allow serving files from entire monorepo (blocklets, packages, node_modules)
      allow: [path.resolve(__dirname, '../..')],
    },
    proxy: {
      '/api': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-mui': ['react', 'react-dom', 'react-router-dom', '@mui/material', '@mui/icons-material'],
        },
      },
    },
  },
});
