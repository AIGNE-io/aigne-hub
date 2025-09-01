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

declare module '@abtnode/util/*';

declare module '@abtnode/cron';
declare module '@blocklet/logger' {
  function createLogger(name: string): typeof console;

  namespace createLogger {
    function getAccessLogStream(): any;
  }

  export default createLogger;
}

namespace Express {
  import { SessionUser } from '@blocklet/sdk/lib/util/login';

  interface Request {
    user?: SessionUser;

    appClient?: {
      appId: string;
      userDid: string;
    };
  }
}
