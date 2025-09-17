import checkCredentials from '@api/libs/ai-credentials';
import config from '@blocklet/sdk/lib/config';

import logger from '../libs/logger';
import { NotificationManager } from '../libs/notifications/manager';
import { CredentialValidNotificationTemplate } from '../libs/notifications/templates/credential';
import { getQueue } from './queue';

const credentialsQueue = getQueue({
  name: 'check-credentials',
  options: { concurrency: 1, maxRetries: 0, enableScheduledJob: true },
  onJob: async (data: { credentialId: string; providerId: string; delay?: number }) => {
    logger.info('start check credentials', data);

    try {
      const credential = await checkCredentials(data.credentialId, data.providerId);

      const template = new CredentialValidNotificationTemplate({
        credential: {
          ...credential.toJSON(),
          credentialName: credential?.name,
          credentialValue: credential?.getDisplayText(),
        },
      });

      NotificationManager.sendCustomNotificationByRoles(['owner', 'admin'], await template.getTemplate()).catch(
        (error) => {
          logger.error('Failed to send credential invalid notification', error);
        }
      );
    } catch (err) {
      logger.error('check credentials failed', err);

      // default 3 hours
      const checkCredentialsMaxTime = config.env.preferences.checkCredentialsMaxTime || 10800;

      // 指数增长
      const delay = (data?.delay || 5) * 2;
      if (delay > checkCredentialsMaxTime) {
        return;
      }

      credentialsQueue.push({ job: { ...data, delay }, delay });
    }
  },
});

export default credentialsQueue;
