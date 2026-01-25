import { DataTypes } from 'sequelize';

import { BLOCKLET_APP_PID } from '../../libs/env';
import { Migration, createIndexIfNotExists } from '../migrate';

/**
 * Combined migration for usage tracking feature:
 * 1. Create Projects table
 * 2. Update ModelCalls.duration precision
 * 3. Add index for ModelCalls GROUP BY appDid queries
 * 4. Allow null userDid in ModelCallStats
 * 5. Remove modelId from ModelCallStats and update indexes
 */
export const up: Migration = async ({ context: queryInterface }) => {
  // 1. Create Projects table
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

  // 2. Update duration precision to 1 decimal place (seconds)
  await queryInterface.changeColumn('ModelCalls', 'duration', {
    type: DataTypes.DECIMAL(10, 1),
    allowNull: true,
  });

  // 3. Add index to optimize GROUP BY appDid queries on ModelCalls table
  await createIndexIfNotExists(queryInterface, 'ModelCalls', ['userDid', 'appDid'], 'idx_model_calls_user_appdid');

  // 3.1 Normalize ModelCalls.appDid (null/empty -> default app did)
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

  // 4. Allow null userDid in ModelCallStats (for system-level stats)
  await queryInterface.changeColumn('ModelCallStats', 'userDid', {
    type: DataTypes.STRING,
    allowNull: true,
  });

  await createIndexIfNotExists(
    queryInterface,
    'ModelCallStats',
    ['timeType', 'timestamp', 'userDid', 'appDid'],
    'idx_model_call_stats_time_scope'
  );
};

export const down: Migration = async ({ context: queryInterface }) => {
  // Reverse 4: Disallow null userDid
  await queryInterface.changeColumn('ModelCallStats', 'userDid', {
    type: DataTypes.STRING,
    allowNull: false,
  });

  // Reverse 3: Remove ModelCalls index
  await queryInterface.removeIndex('ModelCalls', 'idx_model_calls_user_appdid');

  // Reverse 2: Revert duration precision back to integer
  await queryInterface.changeColumn('ModelCalls', 'duration', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });

  // Reverse 1: Drop the Projects table
  await queryInterface.dropTable('Projects');
};
