/* eslint-disable import/no-extraneous-dependencies */
import react from '@vitejs/plugin-react';
/* eslint-disable no-unused-vars */
import { defineConfig } from 'vite';
import { buildPlugin } from 'vite-plugin-build';

// https://vitejs.dev/config/
export default defineConfig(() => {
  const extraBuildConfig = process.env.npm_lifecycle_event === 'watch' ? { watch: {} } : null;
  return {
    plugins: [
      react(),
      buildPlugin({
        // multiple files build
        fileBuild: {
          esOutputDir: 'lib/es',
          commonJsOutputDir: 'lib/cjs',
          ...extraBuildConfig,
          emitDeclaration: true,
        },
      }),
    ],
    server: {
      fs: {
        strict: false, // monorepo and pnpm required
      },
    },
  };
});
