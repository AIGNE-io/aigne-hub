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

declare module '@blocklet/logger' {
  export default function createLogger(name: string): typeof console;
}

namespace Express {
  interface Request {
    user?: {
      did: string;
      role: string;
      fullName: string;
    };

    appClient?: {
      appId: string;
    };
  }
}
