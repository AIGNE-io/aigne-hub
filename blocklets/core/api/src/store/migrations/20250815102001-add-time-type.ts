import { DataTypes } from 'sequelize';

import { Migration } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  // Add timeType column to ModelCallStats table
  await queryInterface.addColumn('ModelCallStats', 'timeType', {
    type: DataTypes.ENUM('day', 'hour'),
    allowNull: false,
    defaultValue: 'day',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('ModelCallStats', 'timeType');
};
