// eslint-disable-next-line import/no-extraneous-dependencies
import { setupClient } from 'vite-plugin-blocklet';

import { app, server } from './src';

setupClient(app, {
  server,
  importMetaHot: import.meta.hot,
});
