import { WsClient } from '@arcblock/ws';
import { useEffect } from 'react';

import { useSessionContext } from '../contexts/session';

let client: any;

function create() {
  const pathPrefix = window?.blocklet?.prefix || '/';
  const url = `//${window.location.host}${pathPrefix.replace(/\/$/, '')}`;

  return new WsClient(url, {
    heartbeatIntervalMs: 10 * 1000,
  });
}

export default function getWsClient() {
  if (!client) {
    client = create();
  }

  return client;
}

export const useSubscription = (event: string, cb: (...rest: any) => void = () => {}, deps: any[] = []) => {
  const { session } = useSessionContext();

  if (!client) {
    client = getWsClient();
    client.connect();
  }

  useEffect(() => {
    client.on(event, cb);

    return () => {
      client.off(event, cb);
    };
  }, [...deps, session.user]);
};
