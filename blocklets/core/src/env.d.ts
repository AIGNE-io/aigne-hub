declare global {
  import type { WindowBlocklet } from '@blocklet/sdk';
  declare var blocklet: WindowBlocklet | undefined;
}

declare module '@arcblock/ux/*';
declare module '@arcblock/did-connect/*';
