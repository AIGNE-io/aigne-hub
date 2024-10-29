declare module '@arcblock/ux/*';

declare module '@blocklet/logger' {
  function createLogger(name: string): typeof console;

  namespace createLogger {
    function getAccessLogStream(): any;
  }

  export default createLogger;
}

declare var blocklet:
  | {
      prefix: string;
      appId: string;
      appName: string;
      appUrl: string;
      appLogo: string;
      appDescription: string;
      version: string;
      componentMountPoints: { title: string; name: string; did: string; mountPoint: string }[];
    }
  | undefined;
