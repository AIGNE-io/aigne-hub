declare module '@arcblock/ux/*';

declare module '@blocklet/logger' {
  function createLogger(name: string): typeof console;

  namespace createLogger {
    function getAccessLogStream(): any;
  }

  export default createLogger;
}

declare global {
  import type { WindowBlocklet } from '@blocklet/sdk';
  declare var blocklet: WindowBlocklet | undefined;
}
