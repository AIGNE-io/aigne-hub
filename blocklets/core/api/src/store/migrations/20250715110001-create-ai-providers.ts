import type { Migration } from '../migrate';
import AiProvider from '../models/ai-provider';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('AiProviders', AiProvider.GENESIS_ATTRIBUTES);

  // 添加索引
  await queryInterface.addIndex('AiProviders', ['name'], {
    unique: true,
    name: 'unique_provider_name',
  });

  await queryInterface.addIndex('AiProviders', ['enabled'], {
    name: 'idx_provider_enabled',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('AiProviders');
};
