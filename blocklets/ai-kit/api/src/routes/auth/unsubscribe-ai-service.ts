import { passportsAllowUnsubscribeAIService, wallet } from '@api/libs/auth';
import logger from '@api/libs/logger';
import { unsubscribe } from '@blocklet/ai-kit/api/call/app';

export default {
  action: 'unsubscribe-ai-service',
  claims: {
    verifiableCredential: async () => {
      return {
        type: 'verifiableCredential',
        trustedIssuers: [wallet.address],
      };
    },
  },
  onAuth: async ({ claims }: any) => {
    try {
      const { passport } = JSON.parse(JSON.parse(claims[0].presentation).verifiableCredential[0]).credentialSubject;

      if (!passportsAllowUnsubscribeAIService.includes(passport.name)) {
        throw new Error('Only the owner or admin is allowed to unsubscribe the AI service');
      }
    } catch (error) {
      logger.error('unsubscribe-ai-service verify passport error', { error });
      throw error;
    }

    await unsubscribe({ useAIKitService: true });

    return {};
  },
};
