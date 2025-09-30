import { Migration, createIndexIfNotExists } from '../migrate';
import AiModelStatus from '../models/ai-model-status';

export const up: Migration = async ({ context }) => {
  await context.createTable('AiModelStatuses', AiModelStatus.GENESIS_ATTRIBUTES);

  createIndexIfNotExists(
    context,
    'AiModelStatuses',
    ['providerId', 'model'],
    'ai_model_statuses_provider_model_unique'
  );
};

export const down: Migration = async ({ context }) => {
  await context.removeIndex('AiModelStatuses', 'ai_model_statuses_provider_model_unique');
  await context.dropTable('AiModelStatuses');
};
