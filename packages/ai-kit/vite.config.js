import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    server: {
      fs: {
        strict: false, // monorepo and pnpm required
      },
    },
  };
});
