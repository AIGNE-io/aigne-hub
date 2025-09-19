import cluster from 'cluster';

import { Worker } from 'snowflake-uuid';

const workerId = cluster.isWorker ? (cluster.worker?.id || 0) % 1024 : 0;
const idGenerator = new Worker(workerId);
const nextId = () => idGenerator.nextId().toString();

export default nextId;
