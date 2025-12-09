/* eslint-disable no-console */
import { DataTypes } from 'sequelize';

import { Migration } from '../migrate';

export const up: Migration = async ({ context }) => {
  await context.changeColumn('AiModelRates', 'inputRate', {
    type: DataTypes.DECIMAL(20, 10),
    allowNull: false,
    defaultValue: 0,
  });

  await context.changeColumn('AiModelRates', 'outputRate', {
    type: DataTypes.DECIMAL(20, 10),
    allowNull: false,
    defaultValue: 0,
  });

  console.log('update-model-rate-precision: Changed column precision to DECIMAL(20, 10)');
};

export const down: Migration = async ({ context }) => {
  await context.changeColumn('AiModelRates', 'inputRate', {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
  });

  await context.changeColumn('AiModelRates', 'outputRate', {
    type: DataTypes.DECIMAL(10, 4),
    allowNull: false,
    defaultValue: 0,
  });

  console.log('update-model-rate-precision: Reverted column precision to DECIMAL(10, 4)');
};
