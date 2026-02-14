/**
 * Integration test setup helpers.
 *
 * NOTE: All mock.module() calls live in preload.ts and must be loaded
 * via `bun test --preload helpers/preload.ts` before this file.
 *
 * This file provides:
 *   - DB swap helpers (sequelize method swap pattern)
 *   - Seed data helpers
 *   - Express app factory
 *   - Cache clearing
 *   - fire-and-forget wait helper
 */

import 'express-async-errors';

import { clearCreditCache, clearCustomerCache, clearMeterCache } from '@api/libs/payment';
import { clearAllRotationCache } from '@api/libs/provider-rotation';
import { clearModelRateCache } from '@api/providers';
import { clearProviderCache } from '@api/providers/models';
import v2Router from '@api/routes/v2';
import { initialize as initializeModels } from '@api/store/models';
import AiCredential from '@api/store/models/ai-credential';
import { clearCredentialListCache } from '@api/store/models/ai-credential';
import AiModelRate from '@api/store/models/ai-model-rate';
import AiProvider from '@api/store/models/ai-provider';
import ModelCall from '@api/store/models/model-call';
import Usage from '@api/store/models/usage';
import { sequelize as globalSequelize } from '@api/store/sequelize';
import { CustomError, getStatusFromError } from '@blocklet/error';
import express from 'express';
import { Sequelize } from 'sequelize';

// Set up model associations (hasMany, belongsTo, etc.)
initializeModels(globalSequelize);

// ─── DB swap helpers ─────────────────────────────────────────────────────────

export async function createTestDB() {
  const testSequelize = new Sequelize({
    dialect: 'sqlite',
    storage: ':memory:',
    logging: false,
  });

  await testSequelize.query('pragma journal_mode = WAL;');
  await testSequelize.query('pragma synchronous = normal;');

  // Save originals
  const originals = {
    query: globalSequelize.query.bind(globalSequelize),
    transaction: globalSequelize.transaction.bind(globalSequelize),
    getConnection: globalSequelize.connectionManager.getConnection.bind(globalSequelize.connectionManager),
    releaseConnection: globalSequelize.connectionManager.releaseConnection.bind(globalSequelize.connectionManager),
  };

  // Swap global → test
  (globalSequelize as any).query = testSequelize.query.bind(testSequelize);
  (globalSequelize as any).transaction = testSequelize.transaction.bind(testSequelize);
  (globalSequelize.connectionManager as any).getConnection = testSequelize.connectionManager.getConnection.bind(
    testSequelize.connectionManager
  );
  (globalSequelize.connectionManager as any).releaseConnection = testSequelize.connectionManager.releaseConnection.bind(
    testSequelize.connectionManager
  );

  // Sync all models — use globalSequelize because models are .init()'d against it.
  // The swap above redirects its queries to testSequelize.
  await globalSequelize.sync({ force: true });

  return {
    testSequelize,
    restore: () => {
      (globalSequelize as any).query = originals.query;
      (globalSequelize as any).transaction = originals.transaction;
      (globalSequelize.connectionManager as any).getConnection = originals.getConnection;
      (globalSequelize.connectionManager as any).releaseConnection = originals.releaseConnection;
    },
  };
}

// ─── Seed data ───────────────────────────────────────────────────────────────

export async function seedTestData(mockProviderUrl: string) {
  const providerA = await AiProvider.create({
    name: 'openai' as any,
    displayName: 'Mock OpenAI',
    enabled: true,
    baseUrl: `${mockProviderUrl}/v1`,
  });

  await AiCredential.create({
    providerId: providerA.id,
    name: 'test-key-a',
    credentialValue: { api_key: 'enc:sk-test-a' },
    credentialType: 'api_key',
    active: true,
    usageCount: 0,
    weight: 100,
  });

  await AiModelRate.create({
    providerId: providerA.id,
    model: 'gpt-5-mini',
    modelDisplay: 'GPT-5 Mini',
    type: 'chatCompletion' as any,
    inputRate: 0.001,
    outputRate: 0.002,
  });

  return { providerA };
}

/**
 * Seed a second provider for retry tests.
 * Uses "openrouter" because getSupportedProviders('gpt-5-mini') returns
 * ["openai", "openrouter", "poe"], so both providers are valid for retry.
 */
export async function seedSecondProvider(mockProviderUrl: string) {
  const providerB = await AiProvider.create({
    name: 'openrouter' as any,
    displayName: 'Mock OpenRouter',
    enabled: true,
    baseUrl: `${mockProviderUrl}/v1`,
  });

  await AiCredential.create({
    providerId: providerB.id,
    name: 'test-key-b',
    credentialValue: { api_key: 'enc:sk-test-b' },
    credentialType: 'api_key',
    active: true,
    usageCount: 0,
    weight: 100,
  });

  await AiModelRate.create({
    providerId: providerB.id,
    model: 'gpt-5-mini',
    modelDisplay: 'GPT-5 Mini',
    type: 'chatCompletion' as any,
    inputRate: 0.001,
    outputRate: 0.002,
  });

  return { providerB };
}

// ─── Express app factory ─────────────────────────────────────────────────────

export function createTestApp() {
  const app = express();
  app.use(express.json({ limit: '30mb' }));
  app.use('/api/v2', v2Router);
  // Error handler matching production (index.ts)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((error: any, req: any, res: any, _next: any) => {
    // If response is already finished (e.g. processChatCompletion called res.end()),
    // we cannot write anymore. Just log and return.
    if (res.writableEnded || res.finished) {
      return;
    }

    const errorData = { message: error.message };

    if (!res.headersSent) {
      let statusCode = error?.statusCode || error?.status || 500;
      if (error instanceof CustomError) {
        statusCode = getStatusFromError(error);
      }
      res.status(statusCode).json({ error: errorData });
    } else if (res.writable) {
      res.write(JSON.stringify({ error: errorData }));
      res.end();
    }
  });
  return app;
}

// ─── Cache clearing ─────────────────────────────────────────────────────────

export function clearAllCaches() {
  clearCredentialListCache();
  clearAllRotationCache();
  clearModelRateCache();
  clearProviderCache();
  clearCustomerCache();
  clearCreditCache();
  clearMeterCache();
}

// ─── fire-and-forget wait ────────────────────────────────────────────────────

export async function waitForFireAndForget(ms = 800) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

// Re-export models for convenience in tests
export { AiProvider, AiCredential, AiModelRate, ModelCall, Usage };
