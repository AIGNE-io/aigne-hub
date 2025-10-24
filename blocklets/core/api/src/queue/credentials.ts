import checkCredentials from '@api/libs/ai-credentials';
import AiCredential from '@api/store/models/ai-credential';
import config from '@blocklet/sdk/lib/config';

import { AIGNE_HUB_DEFAULT_WEIGHT } from '../libs/constants';
import logger from '../libs/logger';
import { NotificationManager } from '../libs/notifications/manager';
import { CredentialValidNotificationTemplate } from '../libs/notifications/templates/credential';
import { getQueue } from './queue';

const AIGNE_HUB_CREDENTIAL_CHECK_TIMEOUT = 10800; // 3 hours

const credentialsQueue = getQueue({
  name: 'check-credentials',
  options: { concurrency: 1, maxRetries: 0, enableScheduledJob: true },
  onJob: async (data: {
    credentialId: string;
    providerId: string;
    delay?: number;
    time?: number;
    isWeightRecovery?: boolean;
  }) => {
    logger.info('start check credentials', data);

    if (data.isWeightRecovery) {
      try {
        const credential = await AiCredential.findByPk(data.credentialId);
        if (credential && credential.weight !== AIGNE_HUB_DEFAULT_WEIGHT) {
          await credential.update({ weight: AIGNE_HUB_DEFAULT_WEIGHT });
          logger.info('Credential weight auto-recovered after 429 cooldown', {
            credentialId: data.credentialId,
            weight: AIGNE_HUB_DEFAULT_WEIGHT,
          });
        }
      } catch (err) {
        logger.error('Failed to auto-recover credential weight', { credentialId: data.credentialId, error: err });
      }
      return;
    }

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
          logger.error('Failed to send credential valid notification', error);
        }
      );
    } catch (err) {
      logger.error('check credentials failed', err);

      // default 3 hours
      const checkCredentialsMaxTime =
        config.env.preferences.checkCredentialsMaxTime || AIGNE_HUB_CREDENTIAL_CHECK_TIMEOUT;

      // 指数增长时间
      const time = data?.time || 0;
      const delay = 5 + 2 ** time;
      if (delay > checkCredentialsMaxTime) return;

      credentialsQueue.push({ job: { ...data, time: time + 1 }, delay });
    }
  },
});

export default credentialsQueue;
