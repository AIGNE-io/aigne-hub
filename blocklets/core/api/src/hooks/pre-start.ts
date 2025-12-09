import '@blocklet/sdk/lib/error-handler';

import dotenv from 'dotenv-flow';

if (process.env.NODE_ENV === 'development') {
  dotenv.config();
}

(async () => {
  try {
    // Run database migrations
    await import('../store/migrate').then((m) => m.default());

    // Run credit system migration if needed (auto-checks internally)
    const { runCreditMigration } = await import('./credit-migration');
    await runCreditMigration();

    process.exit(0);
  } catch (err) {
    console.error('pre-start error', err);
    process.exit(1);
  }
})();
