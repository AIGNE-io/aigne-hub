import path from 'path';

import createQueue from '@abtnode/queue';

import { Config } from '../libs/env';

const queueMap = new Map();

export const getQueue = <T = any>({
  name,
  onJob,
  options = {},
}: {
  name: string;
  onJob: (payload: T) => void;
  options: {
    concurrency?: number;
    maxRetries?: number;
    maxTimeout?: number;
    retryDelay?: number;
    enableScheduledJob?: boolean;
  };
}): ReturnType<typeof createQueue> => {
  if (queueMap.has(name)) {
    return queueMap.get(name);
  }

  const queue = createQueue({
    file: path.join(Config.dataDir, `queue/${name}.db`),
    onJob,
    options,
  });
  queueMap.set(name, queue);

  return queue;
};
