import { Migration, createIndexIfNotExists } from '../migrate';

/**
 * Codify the two emergency indexes that ops had to add by hand in production
 * to keep the analytics endpoints (usage/projects, usage/trends, user-stats)
 * responsive. Without this migration, fresh deployments and dev databases will
 * not have them.
 *
 * - idx_model_calls_time_model:        supports `user-stats` GROUP BY model
 * - idx_model_call_stats_type_time_app: supports `projects` / `trends`
 *                                       aggregation by appDid over a window.
 *
 * createIndexIfNotExists makes this idempotent: on the production box where
 * these indexes already exist, the migration is a no-op.
 */
export const up: Migration = async ({ context: queryInterface }) => {
  await createIndexIfNotExists(
    queryInterface,
    'ModelCalls',
    ['callTime', 'model'],
    'idx_model_calls_time_model'
  );

  await createIndexIfNotExists(
    queryInterface,
    'ModelCallStats',
    ['timeType', 'timestamp', 'appDid'],
    'idx_model_call_stats_type_time_app'
  );
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeIndex('ModelCalls', 'idx_model_calls_time_model');
  await queryInterface.removeIndex('ModelCallStats', 'idx_model_call_stats_type_time_app');
};
