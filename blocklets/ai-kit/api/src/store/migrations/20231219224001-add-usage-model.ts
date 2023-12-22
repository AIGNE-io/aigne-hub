import { DataTypes } from 'sequelize';

import type { Migration } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  await queryInterface.addColumn('Usages', 'model', { type: DataTypes.STRING });
  await queryInterface.addColumn('Usages', 'modelParams', { type: DataTypes.JSON });
  await queryInterface.addColumn('Usages', 'appId', { type: DataTypes.STRING });
  await queryInterface.addColumn('Usages', 'type', { type: DataTypes.STRING });
  await queryInterface.addColumn('Usages', 'usageReportStatus', { type: DataTypes.STRING });
  await queryInterface.addColumn('Usages', 'usedCredits', { type: DataTypes.DECIMAL });
  await queryInterface.addColumn('Usages', 'numberOfImageGeneration', { type: DataTypes.INTEGER });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('Usages', 'model');
  await queryInterface.removeColumn('Usages', 'modelParams');
  await queryInterface.removeColumn('Usages', 'appId');
  await queryInterface.removeColumn('Usages', 'type');
  await queryInterface.removeColumn('Usages', 'usageReportStatus');
  await queryInterface.removeColumn('Usages', 'usedCredits');
  await queryInterface.removeColumn('Usages', 'numberOfImageGeneration');
};
