declare var blocklet:
  | {
      prefix: string;
      appId: string;
      appName: string;
      appLogo: string;
      appDescription: string;
      version: string;
      componentMountPoints: { title: string; name: string; did: string; mountPoint: string }[];
    }
  | undefined;

declare module '@arcblock/ux/*';
declare module '@arcblock/did-connect/*';
