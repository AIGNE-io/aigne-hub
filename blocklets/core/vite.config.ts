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
    build: {
      // 禁用模块预加载以优化 CDN 集成
      modulePreload: false,
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
