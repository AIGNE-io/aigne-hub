import logger from './logger';

function shouldExecuteTask(flag?: string): boolean {
  const instanceId = process.env.BLOCKLET_INSTANCE_ID;
  const isMasterCluster = instanceId === '0';
  const nonCluster = !instanceId;
  logger.info('cluster execution check:', { instanceId, isMasterCluster, nonCluster, flag });
  return nonCluster || isMasterCluster;
}

export default shouldExecuteTask;
