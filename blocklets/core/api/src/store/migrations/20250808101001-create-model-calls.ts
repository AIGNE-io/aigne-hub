import { Migration, createIndexIfNotExists } from '../migrate';
import ModelCall from '../models/model-call';
import ModelCallStat from '../models/model-call-stat';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.createTable('ModelCalls', ModelCall.GENESIS_ATTRIBUTES);
  await queryInterface.createTable('ModelCallStats', ModelCallStat.GENESIS_ATTRIBUTES);

  await createIndexIfNotExists(queryInterface, 'ModelCalls', ['callTime'], 'idx_model_calls_call_time');
  await createIndexIfNotExists(queryInterface, 'ModelCalls', ['userDid'], 'idx_model_calls_user_did');
  await createIndexIfNotExists(
    queryInterface,
    'ModelCalls',
    ['userDid', 'callTime', 'status'],
    'idx_model_calls_user_time_status'
  );
  await createIndexIfNotExists(
    queryInterface,
    'ModelCalls',
    ['userDid', 'providerId', 'model', 'type'],
    'idx_model_calls_user_provider_model'
  );

  await createIndexIfNotExists(queryInterface, 'ModelCallStats', ['userDid', 'timestamp'], 'uk_user_date');
  await createIndexIfNotExists(queryInterface, 'ModelCallStats', ['userDid'], 'idx_model_call_stats_user_did');
  await createIndexIfNotExists(queryInterface, 'ModelCallStats', ['timestamp'], 'idx_model_call_stats_stat_date');
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.dropTable('ModelCalls');
  await queryInterface.dropTable('ModelCallStats');
};
