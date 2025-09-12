import { WsServer } from '@arcblock/ws';

import logger from './libs/logger';

function createWebsocketServer() {
  const wsServer = new WsServer({ logger, pathname: '/websocket' });
  return wsServer;
}

const ws = createWebsocketServer();
export default ws;
