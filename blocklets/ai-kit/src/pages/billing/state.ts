import { AIKitServiceConfig, AppStatusResult, appStatus, setAppConfig, unsubscribe } from '@blocklet/ai-kit/api';
import { TSubscriptionExpanded } from '@blocklet/payment-js';
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

export interface AIKitServiceStatus {
  // FIXME: remove `{ subscription?: TSubscriptionExpanded }` after issue (https://github.com/sequelize/sequelize/issues/16268) fixed
  app?: Omit<AppStatusResult, 'subscription'> & { subscription?: TSubscriptionExpanded };
  loading?: boolean;
  error?: Error;
  fetch: () => Promise<void>;
  unsubscribe: () => Promise<void>;
  setConfig: (payload: AIKitServiceConfig) => Promise<void>;
  computed: {
    isSubscriptionAvailable?: boolean;
  };
}

export const useAIKitServiceStatus = create<AIKitServiceStatus>()(
  immer((set, get) => ({
    loading: true,
    fetch: async () => {
      set((state) => {
        state.loading = true;
      });
      try {
        const app = await appStatus();
        set((state) => {
          state.app = app;
          state.error = undefined;
          state.loading = false;
        });
      } catch (error) {
        set((state) => {
          state.error = error;
          state.loading = false;
        });
      }
    },
    unsubscribe: async () => {
      await unsubscribe();
      await get().fetch();
    },
    setConfig: async (payload: AIKitServiceConfig) => {
      const config = await setAppConfig(payload);
      set((state) => {
        state.app!.config = config;
      });
    },
    computed: {
      get isSubscriptionAvailable() {
        const subscription = get().app?.subscription;
        return subscription && ['active', 'trialing'].includes(subscription.status);
      },
    },
  }))
);
