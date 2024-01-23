import { walletHandler } from '@api/libs/auth';
import { Router } from 'express';

import unsubscribeAIService from './unsubscribe-ai-service';

export async function initAuthRouter(router: Router) {
  walletHandler.attach({ app: router, ...unsubscribeAIService.cancelSubscription });
  walletHandler.attach({ app: router, ...unsubscribeAIService.recoverSubscription });
}
