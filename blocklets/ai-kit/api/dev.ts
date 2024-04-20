// eslint-disable-next-line import/no-extraneous-dependencies
import { setupClient } from 'vite-plugin-blocklet';

import { app } from './src';

const hmrPort = process.env.__HMR_PORT__;
const hmrProtocol = process.env.__HMR_HOSTNAME__ ? 'wss' : undefined;

setupClient(app, hmrPort ? { port: parseInt(hmrPort, 10), protocol: hmrProtocol } : undefined);
