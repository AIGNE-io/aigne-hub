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
            'awesome-phonenumber': ['awesome-phonenumber'],
            mui: ['@mui/material', '@mui/system', '@mui/icons-material', 'notistack'],
            'arcblock-ux': ['@arcblock/ux'],
            'blocklet-ui-react': ['@blocklet/ui-react'],
            'arcblock-did-connect': ['@arcblock/did-connect-react'],
          },
        },
      },
    },
  };
});
