import { DataTypes } from 'sequelize';

import { Migration, createIndexIfNotExists, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  // Add appDid and modelId columns to ModelCallStats
  await safeApplyColumnChanges(queryInterface, {
    ModelCallStats: [
      {
        name: 'appDid',
        field: {
          type: DataTypes.STRING,
          allowNull: true,
          comment: 'Project ID - null for user-level aggregation',
        },
      },
      {
        name: 'modelId',
        field: {
          type: DataTypes.STRING,
          allowNull: true,
          comment: 'Model ID - for quick model aggregation queries',
        },
      },
    ],
  });

  // Create composite index for user + app + time queries
  await createIndexIfNotExists(
    queryInterface,
    'ModelCallStats',
    ['userDid', 'appDid', 'timestamp', 'timeType'],
    'idx_model_call_stats_user_app_time'
  );

  // Create index for model aggregation queries
  await createIndexIfNotExists(
    queryInterface,
    'ModelCallStats',
    ['userDid', 'modelId', 'timestamp'],
    'idx_model_call_stats_user_model_time'
  );

  // Create index for appDid queries
  await createIndexIfNotExists(queryInterface, 'ModelCallStats', ['appDid'], 'idx_model_call_stats_app_did');

  // Add index on ModelCalls for appDid queries (if not exists)
  await createIndexIfNotExists(queryInterface, 'ModelCalls', ['appDid'], 'idx_model_calls_app_did');

  // Add composite index for user + app + time on ModelCalls
  await createIndexIfNotExists(
    queryInterface,
    'ModelCalls',
    ['userDid', 'appDid', 'callTime'],
    'idx_model_calls_user_app_time'
  );
};

export const down: Migration = async ({ context: queryInterface }) => {
  // Remove indexes
  await queryInterface.removeIndex('ModelCallStats', 'idx_model_call_stats_user_app_time');
  await queryInterface.removeIndex('ModelCallStats', 'idx_model_call_stats_user_model_time');
  await queryInterface.removeIndex('ModelCallStats', 'idx_model_call_stats_app_did');
  await queryInterface.removeIndex('ModelCalls', 'idx_model_calls_app_did');
  await queryInterface.removeIndex('ModelCalls', 'idx_model_calls_user_app_time');

  // Remove columns
  await queryInterface.removeColumn('ModelCallStats', 'appDid');
  await queryInterface.removeColumn('ModelCallStats', 'modelId');
};
