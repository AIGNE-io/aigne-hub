import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context }) => {
  await safeApplyColumnChanges(context, {
    ModelCalls: [
      { name: 'ttfb', field: { type: DataTypes.DECIMAL(10, 1), allowNull: true } },
      { name: 'providerTtfb', field: { type: DataTypes.DECIMAL(10, 1), allowNull: true } },
    ],
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('ModelCalls', 'ttfb');
  await context.removeColumn('ModelCalls', 'providerTtfb');
};
