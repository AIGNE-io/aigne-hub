import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  await safeApplyColumnChanges(queryInterface, {
    Usages: [{ name: 'mediaDuration', field: { type: DataTypes.INTEGER, allowNull: true } }],
  });

  await queryInterface.changeColumn('ModelCalls', 'type', {
    type: DataTypes.ENUM('chatCompletion', 'embedding', 'imageGeneration', 'audioGeneration', 'video', 'custom'),
    allowNull: false,
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('Usages', 'mediaDuration');

  await queryInterface.changeColumn('ModelCalls', 'type', {
    type: DataTypes.ENUM('chatCompletion', 'embedding', 'imageGeneration', 'audioGeneration', 'video', 'custom'),
    allowNull: false,
  });
};
