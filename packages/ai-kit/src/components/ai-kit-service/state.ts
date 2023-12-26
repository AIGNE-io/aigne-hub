import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

import { AppStatusResult, appStatus, setAppConfig } from '../../api';
import { AIKitServiceConfig } from './config';

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
    setConfig: async (config: AIKitServiceConfig) => {
      const app = await setAppConfig(config);
      set((state) => {
        state.app = app;
      });
    },
  }))
);
