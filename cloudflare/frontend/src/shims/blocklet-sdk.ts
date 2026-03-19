// Shim for @blocklet/sdk - provides WindowBlocklet type and runtime config
export interface WindowBlocklet {
  appId?: string;
  appName?: string;
  appUrl?: string;
  prefix?: string;
  groupPrefix?: string;
}

// Runtime config stub
const config = {
  appId: '',
  appName: 'AIGNE Hub',
  appUrl: '',
  prefix: '/',
  groupPrefix: '/',
};

export default config;
