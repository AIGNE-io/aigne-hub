import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { AIKitServiceConfig, AppStatusResult, appStatus, setAppConfig } from '../../libs/app';

export interface AIKitServiceStatus {
  app?: AppStatusResult;
  loading?: boolean;
  error?: Error;
  fetch: () => Promise<void>;
  setConfig: (payload: AIKitServiceConfig) => Promise<void>;
}

export const useAIKitServiceStatus = create<AIKitServiceStatus>()(
  immer((set) => ({
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
    setConfig: async (payload: AIKitServiceConfig) => {
      const config = await setAppConfig(payload);
      set((state) => {
        state.app!.config = config;
      });
    },
  }))
);
