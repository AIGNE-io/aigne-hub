import logger from './logger';

function shouldExecuteTask(): boolean {
  const isMasterCluster = process.env.BLOCKLET_INSTANCE_ID === '0';
  const nonCluster = process.env.BLOCKLET_INSTANCE_ID === undefined;
  logger.info('Cluster execution check:', { isMasterCluster, nonCluster });

  return nonCluster || isMasterCluster;
}

export default shouldExecuteTask;
