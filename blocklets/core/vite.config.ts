/* eslint-disable import/no-extraneous-dependencies */

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createBlockletPlugin } from 'vite-plugin-blocklet';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [
      tsconfigPaths(),
      react(),
      createBlockletPlugin({ disableNodePolyfills: false, disableDynamicAssetHost: false, chunkSizeLimit: 8000 }),
      svgr({
        svgrOptions: {
          exportType: 'named',
          ref: true,
          svgo: false,
          titleProp: true,
        },
        include: '**/*.svg',
      }),
    ],
    resolve: {
      alias: {
        lodash: 'lodash-es',
      },
      dedupe: [
        //
        '@mui/material',
        '@mui/utils',
        '@mui/icons-material',
        'react',
        'react-dom',
        'bn.js',
        'axios',
      ],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-mui': [
              'react',
              'react-dom',
              'react-router-dom',
              '@mui/material',
              '@mui/icons-material',
              '@mui/system',
              '@mui/lab',
              '@mui/styled-engine',
              '@mui/utils',
            ],
            'vendor-arcblock': ['@arcblock/did-connect-react', '@arcblock/ux'],
            'vendor-blocklet': ['@blocklet/ui-react'],
          },
        },
      },
    },
  };
});
