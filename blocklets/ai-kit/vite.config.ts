/* eslint-disable import/no-extraneous-dependencies */

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { createBlockletPlugin } from 'vite-plugin-blocklet';
import svgr from 'vite-plugin-svgr';
import tsconfigPaths from 'vite-tsconfig-paths';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [tsconfigPaths(), react(), createBlockletPlugin({ disableNodePolyfills: false }), svgr()],
    build: {
      commonjsOptions: {
        transformMixedEsModules: true,
      },
    },
  };
});
