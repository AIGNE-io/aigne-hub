import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context }) => {
  await safeApplyColumnChanges(context, {
    AiModelRates: [{ name: 'modelMetadata', field: { type: DataTypes.JSON, allowNull: true } }],
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('AiModelRates', 'modelMetadata');
};
