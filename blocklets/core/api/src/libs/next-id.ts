import { Worker } from 'snowflake-uuid';

const instanceId = Number(process.env.BLOCKLET_INSTANCE_ID || process.pid) || 0;
const workerId = instanceId % 31;
const idGenerator = new Worker(workerId);
const nextId = () => idGenerator.nextId().toString();

export default nextId;
