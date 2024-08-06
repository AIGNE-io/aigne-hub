declare module '@arcblock/ux/*';

declare module '@blocklet/logger' {
  export default function createLogger(name: string): typeof console;
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
