import logger from '../logger';
import { NotificationManager } from './manager';
import { CreditGrantedNotificationTemplate } from './templates/credit-granted';

export async function handleCreditGranted(creditGrant: any, extraParams: any) {
  try {
    logger.info('handleCreditGranted', { creditGrant, extraParams });
    const template = new CreditGrantedNotificationTemplate({
      creditGrantId: creditGrant.id,
      creditGrant,
    });

    const context = await template.getContext();
    const { userDid } = context;

    const success = await NotificationManager.sendTemplateNotification(template, userDid);

    if (success) {
      logger.info('Credit granted notification sent successfully', {
        userDid,
        creditGrantId: creditGrant.id,
      });
    } else {
      logger.error('Failed to send credit granted notification', {
        userDid,
        creditGrantId: creditGrant.id,
      });
    }
  } catch (error) {
    logger.error('handleCreditGranted failed', { error, creditGrant, extraParams });
  }
}
