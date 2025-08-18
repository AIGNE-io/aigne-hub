import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context }) => {
  // Add timeType column to ModelCallStats table
  await safeApplyColumnChanges(context, {
    ModelCallStats: [
      { name: 'timeType', field: { type: DataTypes.ENUM('day', 'hour'), allowNull: false, defaultValue: 'day' } },
    ],
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('ModelCallStats', 'timeType');
};
