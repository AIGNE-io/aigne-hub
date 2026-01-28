import { DataTypes } from 'sequelize';

import { BLOCKLET_APP_PID } from '../../libs/env';
import { Migration, createIndexIfNotExists, safeApplyColumnChanges } from '../migrate';

/**
 * Combined migration for usage tracking feature:
 * 1. ModelCallStats: add appDid, allow null userDid, add indexes
 * 2. Projects: create table
 * 3. ModelCalls: update duration, add indexes, normalize appDid
 */
export const up: Migration = async ({ context: queryInterface }) => {
  // 1. ModelCallStats: add appDid column
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
    ],
  });

  // 1.1 ModelCallStats: allow null userDid (for system-level stats)
  await queryInterface.changeColumn('ModelCallStats', 'userDid', {
    type: DataTypes.STRING,
    allowNull: true,
  });

  // 1.2 ModelCallStats: index
  await createIndexIfNotExists(
    queryInterface,
    'ModelCallStats',
    ['timeType', 'timestamp', 'userDid', 'appDid'],
    'idx_model_call_stats_time_scope'
  );

  // 2. Projects: create table
  await queryInterface.createTable('Projects', {
    appDid: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      comment: 'Blocklet DID - unique identifier for the project',
    },
    appName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Application name from blocklet metadata',
    },
    appLogo: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Application logo URL',
    },
    appUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Application URL',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  });

  await createIndexIfNotExists(queryInterface, 'Projects', ['appDid'], 'idx_projects_app_did');

  // 3. ModelCalls: update duration precision to 1 decimal place (seconds)
  await queryInterface.changeColumn('ModelCalls', 'duration', {
    type: DataTypes.DECIMAL(10, 1),
    allowNull: true,
  });

  // 3.1 ModelCalls: indexes for app-level queries
  await createIndexIfNotExists(queryInterface, 'ModelCalls', ['appDid', 'callTime'], 'idx_model_calls_app_time');
  await createIndexIfNotExists(
    queryInterface,
    'ModelCalls',
    ['userDid', 'appDid', 'callTime'],
    'idx_model_calls_user_app_time'
  );

  // 3.2 ModelCalls: normalize appDid (null/empty -> default app did)
  const defaultAppDid = BLOCKLET_APP_PID;
  if (defaultAppDid) {
    await queryInterface.sequelize.query(
      `
      UPDATE "ModelCalls"
      SET "appDid" = :defaultAppDid
      WHERE "appDid" IS NULL OR TRIM("appDid") = '' OR "appDid" = 'null'
      `,
      { replacements: { defaultAppDid } }
    );
  }
};

export const down: Migration = async ({ context: queryInterface }) => {
  // Reverse 3: ModelCalls indexes
  await queryInterface.removeIndex('ModelCalls', 'idx_model_calls_app_time');
  await queryInterface.removeIndex('ModelCalls', 'idx_model_calls_user_app_time');

  // Reverse 3: duration precision back to integer
  await queryInterface.changeColumn('ModelCalls', 'duration', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });

  // Reverse 2: Drop the Projects table
  await queryInterface.dropTable('Projects');

  // Reverse 1: ModelCallStats indexes
  await queryInterface.removeIndex('ModelCallStats', 'idx_model_call_stats_time_scope');

  // Reverse 1: disallow null userDid
  await queryInterface.changeColumn('ModelCallStats', 'userDid', {
    type: DataTypes.STRING,
    allowNull: false,
  });

  // Reverse 1: remove appDid column
  await queryInterface.removeColumn('ModelCallStats', 'appDid');
};
