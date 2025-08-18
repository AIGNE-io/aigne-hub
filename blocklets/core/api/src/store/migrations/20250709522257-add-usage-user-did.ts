import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context }) => {
  await safeApplyColumnChanges(context, {
    Usages: [{ name: 'userDid', field: { type: DataTypes.STRING, allowNull: true } }],
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('Usages', 'userDid');
};
