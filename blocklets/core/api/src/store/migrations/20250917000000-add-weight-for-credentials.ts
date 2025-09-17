import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  await safeApplyColumnChanges(queryInterface, {
    AiCredentials: [{ name: 'weight', field: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 100 } }],
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('AiCredentials', 'weight');
};
