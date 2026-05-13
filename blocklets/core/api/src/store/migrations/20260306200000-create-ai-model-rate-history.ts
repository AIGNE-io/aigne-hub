import { Migration, createIndexIfNotExists } from '../migrate';
import AiModelRateHistory from '../models/ai-model-rate-history';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('AiModelRateHistories', AiModelRateHistory.GENESIS_ATTRIBUTES);

  await createIndexIfNotExists(
    queryInterface,
    'AiModelRateHistories',
    ['providerId', 'model'],
    'idx_rate_history_provider_model'
  );

  await createIndexIfNotExists(queryInterface, 'AiModelRateHistories', ['detectedAt'], 'idx_rate_history_detected_at');
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('AiModelRateHistories');
};
