import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context }) => {
  await safeApplyColumnChanges(context, {
    Usages: [
      { name: 'model', field: { type: DataTypes.STRING } },
      { name: 'modelParams', field: { type: DataTypes.JSON } },
      { name: 'appId', field: { type: DataTypes.STRING } },
      { name: 'type', field: { type: DataTypes.STRING } },
      { name: 'usageReportStatus', field: { type: DataTypes.STRING } },
      { name: 'usedCredits', field: { type: DataTypes.DECIMAL } },
      { name: 'numberOfImageGeneration', field: { type: DataTypes.INTEGER } },
    ],
  });
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
