/**
 * Preload script for integration tests.
 *
 * ALL mock.module() calls must live here so they take effect before
 * any import chain is resolved by the bun test runner.
 *
 * Load via: bun test --preload <this-file> ...
 */
import { mock } from 'bun:test';

// ─── Fix @aigne subpath exports (bun can't resolve without .js) ─────────────

mock.module('@aigne/core/utils/type-utils', () => require('@aigne/core/utils/type-utils.js'));
mock.module('@aigne/core/utils/camelize', () => require('@aigne/core/utils/camelize.js'));
mock.module('@aigne/transport/http-server/index', () => require('@aigne/transport/http-server/index.js'));

// ─── Mock external @blocklet SDKs ───────────────────────────────────────────

mock.module('@blocklet/sdk/lib/middlewares/session', () => ({
  sessionMiddleware: (_opts?: any) => (_req: any, _res: any, next: any) => {
    _req.user = { did: 'test-user-did', fullName: 'Test User' };
    next();
  },
}));

mock.module('@blocklet/sdk/lib/config', () => {
  const EventEmitter = require('events');
  const emitter = new EventEmitter();
  return {
    default: {
      env: {
        dataDir: '/tmp/aigne-hub-test',
        appUrl: 'http://localhost:3000',
        mode: 'development',
        preferences: {
          creditBasedBillingEnabled: false,
          creditPrefix: '',
        },
      },
      components: [],
      events: emitter,
      Events: { envUpdate: 'envUpdate' },
    },
    getComponents: () => [],
  };
});

mock.module('@blocklet/env', () => ({
  blockletEnv: { appPid: 'test-app-pid' },
}));

mock.module('@blocklet/sdk', () => ({
  getComponentMountPoint: () => '/payment',
  getUrl: () => 'http://localhost:3000',
  config: {
    env: {
      dataDir: '/tmp/aigne-hub-test',
      appUrl: 'http://localhost:3000',
      mode: 'development',
      preferences: {},
    },
    components: [],
  },
}));

mock.module('@blocklet/sdk/lib/env', () => ({
  env: { dataDir: '/tmp/aigne-hub-test' },
}));

mock.module('@blocklet/sdk/lib/security', () => ({
  default: {
    encrypt: (v: string) => `enc:${v}`,
    decrypt: (v: string) => (v.startsWith('enc:') ? v.slice(4) : v),
  },
}));

mock.module('@blocklet/sdk/lib/wallet', () => ({
  getWallet: () => ({ address: 'test-wallet-address', toJSON: () => ({}) }),
}));

mock.module('@blocklet/sdk/lib/wallet-authenticator', () => ({
  WalletAuthenticator: class {
    constructor() {}
  },
}));

mock.module('@blocklet/sdk/lib/wallet-handler', () => ({
  WalletHandlers: class {
    constructor() {}
  },
}));

mock.module('@blocklet/sdk/lib/service/blocklet', () => ({
  BlockletService: class {
    constructor() {}
  },
}));

mock.module('@blocklet/logger', () => {
  const noop = (..._args: any[]) => {};
  const loggerInstance: any = Object.assign(noop, {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    child: () => loggerInstance,
  });
  const createLogger = () => loggerInstance;
  createLogger.getAccessLogStream = () => ({ write: noop });
  return { default: createLogger };
});

mock.module('@blocklet/payment-js', () => ({
  default: {
    meters: { retrieve: async () => null, list: async () => ({ data: [] }) },
    customers: { retrieve: async () => null, create: async () => ({ id: 'cust-test' }) },
    creditGrants: { list: async () => ({ data: [] }) },
    meterEvents: { create: async () => ({}) },
    prices: { list: async () => ({ data: [] }) },
    subscriptions: { list: async () => ({ data: [] }) },
    checkout: { sessions: { create: async () => ({}) } },
  },
}));

mock.module('@blocklet/constant', () => ({
  BlockletStatus: { running: 'running', stopped: 'stopped' },
}));

mock.module('@blocklet/sdk/lib/component', () => ({
  call: async () => ({}),
  getUrl: () => 'http://localhost:3000',
  getRelativeUrl: () => '/',
  getComponentMountPoint: () => null,
  getComponentWebEndpoint: () => null,
  waitForComponentRunning: async () => true,
  getResourceExportDir: () => '/tmp',
  getReleaseExportDir: () => '/tmp',
  getResources: () => [],
  getPackResources: () => [],
  default: {},
}));

mock.module('@arcblock/did-connect-storage-nedb', () => ({
  default: class {
    constructor() {}
  },
}));
