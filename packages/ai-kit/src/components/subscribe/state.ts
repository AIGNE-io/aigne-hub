import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { AIKitServiceConfig, AppStatusResult, appStatus, setAppConfig } from '../../api/app';

export interface AIKitServiceStatus {
  app?: AppStatusResult;
  loading?: boolean;
  error?: Error;
  fetch: () => Promise<void>;
  setConfig: (config: AIKitServiceConfig) => Promise<void>;
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
    setConfig: async (config) => {
      const result = await setAppConfig(config);
      set((state) => {
        if (state.app) state.app.config = result;
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
