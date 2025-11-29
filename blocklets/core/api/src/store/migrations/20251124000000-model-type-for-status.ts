import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  await safeApplyColumnChanges(queryInterface, {
    AiModelStatuses: [
      {
        name: 'type',
        field: { type: DataTypes.ENUM('chatCompletion', 'embedding', 'imageGeneration', 'video'), allowNull: true },
      },
    ],
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  await queryInterface.removeColumn('AiModelStatuses', 'type');
};
