/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  // more env variables...
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module 'vite-plugin-blocklet';

declare module 'express-history-api-fallback';

declare module 'express-async-errors';

declare module '@abtnode/*';

declare module '@arcblock/ws';
declare module '@abtnode/cron';
declare module '@blocklet/logger' {
  function createLogger(name: string): typeof console;

  namespace createLogger {
    function getAccessLogStream(): any;
  }

  export default createLogger;
}

interface ModelCallContext {
  id: string;
  startTime: number;
  complete: (result: ModelCallResult) => Promise<void>;
  fail: (error: string, partialUsage?: Partial<UsageData>) => Promise<void>;
  updateCredentials: (providerId: string, credentialId: string, actualModel?: string) => Promise<void>;
}

interface UsageData {
  promptTokens: number;
  completionTokens: number;
  numberOfImageGeneration: number;
  credits: number;
  usageMetrics: Record<string, any>;
  metadata?: Record<string, any>;
}

interface ModelCallResult {
  promptTokens?: number;
  completionTokens?: number;
  numberOfImageGeneration?: number;
  credits?: number;
  usageMetrics?: Record<string, any>;
  metadata?: Record<string, any>;
}

namespace Express {
  import { SessionUser } from '@blocklet/sdk/lib/util/login';

  interface Request {
    user?: SessionUser;

    appClient?: {
      appId: string;
      userDid: string;
    };

    model?: string;
    provider?: string;
    credentialId?: string;

    modelCallContext?: ModelCallContext;
  }
}
