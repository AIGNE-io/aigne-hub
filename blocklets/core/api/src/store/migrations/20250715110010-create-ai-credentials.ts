import type { Migration } from '../migrate';
import AiCredential from '../models/ai-credential';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('AiCredentials', AiCredential.GENESIS_ATTRIBUTES);

  // 添加索引
  await queryInterface.addIndex('AiCredentials', ['providerId', 'active'], {
    name: 'idx_provider_active',
  });

  await queryInterface.addIndex('AiCredentials', ['providerId'], {
    name: 'idx_provider_id',
  });

  await queryInterface.addIndex('AiCredentials', ['credentialType'], {
    name: 'idx_credential_type',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('AiCredentials');
};
