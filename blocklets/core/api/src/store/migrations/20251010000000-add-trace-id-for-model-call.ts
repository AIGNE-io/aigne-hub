import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  await safeApplyColumnChanges(queryInterface, {
    ModelCalls: [{ name: 'traceId', field: { type: DataTypes.STRING, allowNull: true } }],
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('ModelCalls', 'traceId');
};
