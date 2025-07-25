import { passportsAllowUnsubscribeAIService, wallet } from '@api/libs/auth';
import logger from '@api/libs/logger';
import { cancelSubscription, recoverSubscription } from '@blocklet/aigne-hub/api/call/app';
import { CustomError } from '@blocklet/error';

export default {
  cancelSubscription: {
    action: 'cancel-subscription-ai-service',
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
          throw new CustomError(403, 'Only the owner or admin is allowed to unsubscribe the AI service');
        }
      } catch (error) {
        logger.error('cancel-subscription-ai-service verify passport error', { error });
        throw error;
      }

      await cancelSubscription({ useAIKitService: true });

      return {};
    },
  },
  recoverSubscription: {
    action: 'recover-subscription-ai-service',
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
          throw new CustomError(
            403,
            'Only the owner or admin is allowed to recover the subscription of the AI service'
          );
        }
      } catch (error) {
        logger.error('recover-subscription-ai-service verify passport error', { error });
        throw error;
      }

      await recoverSubscription({ useAIKitService: true });

      return {};
    },
  },
};
