import logger from '../libs/logger';
import { getAppName } from '../libs/user/util';
import Project from '../store/models/project';
import { getQueue } from './queue';

interface ProjectQueueJob {
  appDid: string;
}

// Track pending appDids to avoid duplicate jobs
const pendingAppDids = new Set<string>();

const projectsQueue = getQueue<ProjectQueueJob>({
  name: 'fetch-project-info',
  options: {
    concurrency: 5,
    maxRetries: 1,
    maxTimeout: 30000,
    retryDelay: 5000,
  },
  onJob: async (data: ProjectQueueJob) => {
    const { appDid } = data;

    try {
      logger.info('Fetching project info', { appDid });

      // Check if project already exists in database
      const existingProject = await Project.getByAppDid(appDid);
      if (existingProject) {
        const updatedAt = existingProject.updatedAt ? existingProject.updatedAt.getTime() : 0;
        const isComplete = !!existingProject.appLogo?.trim();
        const refreshAfterMs = isComplete ? 7 * 24 * 60 * 60 * 1000 : 2 * 24 * 60 * 60 * 1000;
        const isStale = !updatedAt || Date.now() - updatedAt >= refreshAfterMs;

        if (!isStale) {
          pendingAppDids.delete(appDid);
          return;
        }
      }

      // Fetch app info from external service
      const appInfo = await getAppName(appDid);

      // Save to database
      await Project.upsertProject(appDid, appInfo.appName, appInfo.appLogo, appInfo.appUrl);

      logger.info('Successfully fetched and saved project info', {
        appDid,
        appName: appInfo.appName,
      });
    } catch (error) {
      logger.error('Failed to fetch project info', { appDid });
      throw error; // Re-throw to trigger retry mechanism
    } finally {
      // Remove from pending set after processing (success or final failure)
      pendingAppDids.delete(appDid);
    }
  },
});

/**
 * Push a project info fetch job to the queue with deduplication
 * @param appDid - The blocklet DID to fetch info for
 * @param delay - Optional delay in seconds before processing
 */
export function pushProjectFetchJob(appDid: string, delay = 0): void {
  if (!appDid) return;

  // Deduplicate: skip if already in pending queue
  if (pendingAppDids.has(appDid)) {
    logger.debug('Project fetch job already pending, skipping', { appDid });
    return;
  }

  // Add to pending set
  pendingAppDids.add(appDid);

  // Push to queue
  projectsQueue.push({
    job: { appDid },
    delay,
  });

  logger.debug('Pushed project fetch job to queue', { appDid, delay });
}

/**
 * Clear the pending set (useful for testing or manual cleanup)
 */
export function clearPendingProjects(): void {
  pendingAppDids.clear();
}

export default projectsQueue;
