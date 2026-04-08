// Shim for @blocklet/sdk - provides WindowBlocklet type and runtime config
export interface WindowBlocklet {
  appId?: string;
  appName?: string;
  appUrl?: string;
  appLogo?: string;
  prefix?: string;
  groupPrefix?: string;
  preferences?: Record<string, unknown>;
  navigation?: unknown[];
  [key: string]: unknown;
}

// Runtime config stub
const config = {
  appId: '',
  appName: 'AIGNE Hub',
  appUrl: '',
  prefix: '/',
  groupPrefix: '/',
};

// CF mode navigation — used when blocklet-service returns empty navigation.
// Matches blocklet.yml structure so the real @blocklet/ui-react Header can render nav menu.
const CF_NAVIGATION = [
  {
    id: 'home',
    title: { en: 'Home', zh: '首页' },
    link: '/',
    section: ['header'],
    role: ['owner', 'admin', 'member', 'guest'],
  },
  {
    id: 'settings',
    title: { en: 'Console', zh: '控制台' },
    icon: 'ion:settings-outline',
    link: '/config',
    section: ['header'],
    role: ['admin', 'owner'],
  },
  {
    id: 'usage',
    title: { en: 'Usage', zh: '用量' },
    icon: 'ion:analytics-outline',
    link: '/usage',
    section: ['header'],
    role: ['admin', 'owner'],
  },
  {
    id: 'playground',
    title: { en: 'Playground', zh: '沙盒' },
    icon: 'carbon:run',
    link: '/playground',
    section: ['header'],
    role: ['owner', 'admin', 'member'],
  },
  {
    id: 'pricing',
    title: { en: 'Pricing', zh: '定价' },
    icon: 'ion:pricetag-outline',
    link: '/pricing',
    section: ['header'],
    role: ['owner', 'admin', 'member', 'guest'],
  },
  {
    id: 'apiKeys',
    title: 'API Keys',
    icon: 'ion:key-outline',
    link: '/api-keys',
    section: ['header'],
    role: ['owner', 'admin', 'member'],
  },
];

// Merge CF-specific defaults into window.blocklet (set by /__blocklet__.js)
// Do NOT overwrite values already set by blocklet-service.
if (typeof window !== 'undefined') {
  const wb = (window as unknown as { blocklet: WindowBlocklet }).blocklet || {};

  // Ensure essential fields exist
  if (!wb.appName) wb.appName = 'AIGNE Hub';
  if (!wb.prefix) wb.prefix = '/';
  if (!wb.groupPrefix) wb.groupPrefix = '/';
  if (!wb.appUrl) wb.appUrl = window.location.origin;

  // Provide CF mode navigation if blocklet-service returned empty array
  if (!wb.navigation || (Array.isArray(wb.navigation) && wb.navigation.length === 0)) {
    wb.navigation = CF_NAVIGATION;
  }

  // Ensure preferences
  if (!wb.preferences) wb.preferences = {};
  if (wb.preferences.creditBasedBillingEnabled === undefined) {
    wb.preferences.creditBasedBillingEnabled = true;
  }
  if (wb.preferences.guestPlaygroundEnabled === undefined) {
    wb.preferences.guestPlaygroundEnabled = true;
  }

  (window as unknown as { blocklet: WindowBlocklet }).blocklet = wb;
}

export default config;
