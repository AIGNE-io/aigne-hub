import type { Migration } from '../migrate';
import AiModelRate from '../models/ai-model-rate';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('AiModelRates', AiModelRate.GENESIS_ATTRIBUTES);

  // Add unique constraint for provider-model-type combination
  await queryInterface.addConstraint('AiModelRates', {
    fields: ['providerId', 'model', 'type'],
    type: 'unique',
    name: 'unique_provider_model_type',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('AiModelRates');
};
