import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  await safeApplyColumnChanges(queryInterface, {
    AiCredentials: [{ name: 'error', field: { type: DataTypes.STRING, allowNull: true } }],
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('AiCredentials', 'error');
};
