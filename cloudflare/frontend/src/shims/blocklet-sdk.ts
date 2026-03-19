// Shim for @blocklet/sdk - provides WindowBlocklet type and runtime config
export interface WindowBlocklet {
  appId?: string;
  appName?: string;
  appUrl?: string;
  prefix?: string;
  groupPrefix?: string;
  preferences?: Record<string, unknown>;
}

// Runtime config stub
const config = {
  appId: '',
  appName: 'AIGNE Hub',
  appUrl: '',
  prefix: '/',
  groupPrefix: '/',
};

// Set window.blocklet for components that access it directly
if (typeof window !== 'undefined' && !window.blocklet) {
  (window as unknown as { blocklet: WindowBlocklet }).blocklet = {
    appId: '',
    appName: 'AIGNE Hub',
    appUrl: window.location.origin,
    prefix: '/',
    groupPrefix: '/',
    componentMountPoints: [],
    navigation: [],
    preferences: {
      creditBasedBillingEnabled: true,
      guestPlaygroundEnabled: false,
    },
  };
}

export default config;
