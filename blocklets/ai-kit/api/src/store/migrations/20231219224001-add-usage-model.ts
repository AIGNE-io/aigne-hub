import { DataTypes } from 'sequelize';

import type { Migration } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('Usages', 'model', { type: DataTypes.STRING });
  await queryInterface.addColumn('Usages', 'modelMetadata', { type: DataTypes.JSON });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('Usages', 'model');
  await queryInterface.removeColumn('Usages', 'modelMetadata');
};
