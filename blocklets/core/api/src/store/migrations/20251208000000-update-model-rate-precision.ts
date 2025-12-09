/* eslint-disable no-console */
import { DataTypes, Sequelize } from 'sequelize';

import { Migration } from '../migrate';

// Helper to safely change column for SQLite (which has issues with changeColumn and unique constraints)
async function safeChangeColumn(context: any, table: string, column: string, attributes: any): Promise<void> {
  const { sequelize } = context as { sequelize: Sequelize };
  const dialect = sequelize.getDialect();

  if (dialect === 'sqlite') {
    // SQLite stores DECIMAL as NUMERIC (REAL), precision is just metadata
    // Skip the actual column change to avoid table rebuild issues with unique constraints
    console.log(`safeChangeColumn: Skipping ${table}.${column} change for SQLite (precision is metadata only)`);
    return;
  }

  await context.changeColumn(table, column, attributes);
}

export const up: Migration = async ({ context }) => {
  await safeChangeColumn(context, 'AiModelRates', 'inputRate', {
    type: DataTypes.DECIMAL(20, 10),
    allowNull: false,
    defaultValue: 0,
  });

  await safeChangeColumn(context, 'AiModelRates', 'outputRate', {
    type: DataTypes.DECIMAL(20, 10),
    allowNull: false,
    defaultValue: 0,
  });

  console.log('update-model-rate-precision: Changed column precision to DECIMAL(20, 10)');
};

export const down: Migration = async ({ context }) => {
  await safeChangeColumn(context, 'AiModelRates', 'inputRate', {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
  });

  await safeChangeColumn(context, 'AiModelRates', 'outputRate', {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
  });

  console.log('update-model-rate-precision: Reverted column precision to DECIMAL(10, 4)');
};
