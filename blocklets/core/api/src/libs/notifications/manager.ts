import BlockletNotification from '@blocklet/sdk/lib/service/notification';
import { TNotification } from '@blocklet/sdk/lib/types/notification';

import { blocklet } from '../auth';
import logger from '../logger';
import { BaseNotificationTemplate, BaseNotificationTemplateType } from './templates/base';

export async function getDidListByRole(role: string | string[]) {
  try {
    if (Array.isArray(role)) {
      const didSet = new Set<string>();
      await Promise.all(
        role.map(async (r: string) => {
          const { users } = await blocklet.getUsers({ query: { role: r } });
          users.forEach((u: { did: string }) => didSet.add(u.did));
        })
      );
      return Array.from(didSet);
    }
    const { users } = await blocklet.getUsers({ query: { role } });
    return users.map((x: { did: string }) => x?.did);
  } catch (error) {
    logger.error('getDidListByRole error', error);
    throw error;
  }
}

export class NotificationManager {
  static async sendTemplateNotification<T extends BaseNotificationTemplate>(
    template: T,
    userDid: string
  ): Promise<boolean> {
    try {
      const notificationData = await template.getTemplate();

      // 转换为 TNotification 格式
      const payload: TNotification = {
        title: notificationData.title,
        body: notificationData.body,
        actions: notificationData.actions || [],
        attachments:
          notificationData.attachments?.map((attachment) => ({
            ...attachment,
            type: attachment.type as 'section',
          })) || [],
      };

      await BlockletNotification.sendToUser(userDid, [payload]);
      logger.info('Template notification sent successfully', {
        userDid,
        template: template.constructor.name,
      });

      return true;
    } catch (error) {
      logger.error('Failed to send template notification', {
        error,
        userDid,
        template: template.constructor.name,
      });
      return false;
    }
  }

  static async sendCustomNotification(
    userDid: string | string[],
    notificationData: BaseNotificationTemplateType
  ): Promise<boolean> {
    try {
      const payload: TNotification = {
        title: notificationData.title,
        body: notificationData.body,
        actions: notificationData.actions || [],
        attachments:
          notificationData.attachments?.map((attachment) => ({
            ...attachment,
            type: attachment.type as 'section',
          })) || [],
      };

      await BlockletNotification.sendToUser(userDid, [payload]);
      logger.info('Custom notification sent successfully', { userDid });

      return true;
    } catch (error) {
      logger.error('Failed to send custom notification', { error, userDid });
      return false;
    }
  }

  static async sendCustomNotificationByRoles(
    role: string | string[],
    notificationData: BaseNotificationTemplateType
  ): Promise<boolean> {
    try {
      const userDids = await getDidListByRole(role);
      return await NotificationManager.sendCustomNotification(userDids, notificationData);
    } catch (error) {
      logger.error('Failed to send custom notification by role', { error, role });
      return false;
    }
  }
}
