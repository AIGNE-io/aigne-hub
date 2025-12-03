import { Migration, createIndexIfNotExists } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  await createIndexIfNotExists(
    queryInterface,
    'ModelCallStats',
    ['userDid', 'timeType', 'timestamp'],
    'idx_model_call_stats_user_type_time'
  );

  await createIndexIfNotExists(
    queryInterface,
    'ModelCallStats',
    ['timeType', 'timestamp'],
    'idx_model_call_stats_type_time'
  );

  await createIndexIfNotExists(queryInterface, 'ModelCalls', ['userDid', 'callTime'], 'idx_model_calls_user_time');
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeIndex('ModelCallStats', 'idx_model_call_stats_user_type_time');
  await queryInterface.removeIndex('ModelCallStats', 'idx_model_call_stats_type_time');
  await queryInterface.removeIndex('ModelCalls', 'idx_model_calls_user_time');
};
