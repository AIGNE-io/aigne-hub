import '@blocklet/sdk/lib/error-handler';

import dotenv from 'dotenv-flow';

if (process.env.NODE_ENV === 'development') {
  dotenv.config();
}

(async () => {
  try {
    await import('../store/migrate').then((m) => m.default());
    process.exit(0);
  } catch (err) {
    console.error('pre-start error', err);
    process.exit(1);
  }
})();
