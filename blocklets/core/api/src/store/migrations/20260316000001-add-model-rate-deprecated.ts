import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context }) => {
  await safeApplyColumnChanges(context, {
    AiModelRates: [
      { name: 'deprecated', field: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false } },
      { name: 'deprecatedAt', field: { type: DataTypes.DATE, allowNull: true } },
      { name: 'deprecatedReason', field: { type: DataTypes.STRING(100), allowNull: true } },
    ],
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('AiModelRates', 'deprecated');
  await context.removeColumn('AiModelRates', 'deprecatedAt');
  await context.removeColumn('AiModelRates', 'deprecatedReason');
};
