declare global {
  import type { WindowBlocklet } from '@blocklet/sdk';
  declare var blocklet: WindowBlocklet | undefined;
}

declare module '@arcblock/ux/*';
declare module '@arcblock/did-connect-react/*';
declare module '*.svg' {
  import React from 'react';
  const SVG: React.VFC<React.SVGProps<SVGSVGElement>>;
  export { ReactComponent };
  export default SVG;
}
