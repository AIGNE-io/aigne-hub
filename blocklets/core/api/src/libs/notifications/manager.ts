import BlockletNotification from '@blocklet/sdk/lib/service/notification';
import { TNotification } from '@blocklet/sdk/lib/types/notification';

import logger from '../logger';
import { BaseNotificationTemplate, BaseNotificationTemplateType } from './templates/base';

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
    userDid: string,
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
}
