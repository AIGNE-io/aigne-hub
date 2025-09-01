import setupHtmlRouter from '@api/routes/html';
// eslint-disable-next-line import/no-extraneous-dependencies
import { setupClient } from 'vite-plugin-blocklet';

import { app, server } from './src';

(async () => {
  const vite = await setupClient(app, {
    appType: 'custom',
    server,
    host: '127.0.0.1',
    port: Number(process.env.BLOCKLET_VITE_PORT || 11111),
    // importMetaHot: import.meta.hot,
  });

  setupHtmlRouter(app, vite);
})();
