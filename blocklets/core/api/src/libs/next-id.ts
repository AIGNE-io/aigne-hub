import cluster from 'cluster';

import { Worker } from 'snowflake-uuid';

const nextId = () => {
  const workerId = cluster.isWorker ? cluster.worker?.id || 0 : 0;
  const idGenerator = new Worker(workerId);
  return idGenerator.nextId().toString();
};

export default nextId;
