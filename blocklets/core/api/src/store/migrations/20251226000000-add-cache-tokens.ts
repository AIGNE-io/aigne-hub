import { DataTypes } from 'sequelize';

import { Migration, safeApplyColumnChanges } from '../migrate';

export const up: Migration = async ({ context }) => {
  await safeApplyColumnChanges(context, {
    Usages: [
      {
        name: 'cacheCreationInputTokens',
        field: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      },
      {
        name: 'cacheReadInputTokens',
        field: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
      },
    ],
  });
};

export const down: Migration = async ({ context }) => {
  await context.removeColumn('Usages', 'cacheCreationInputTokens');
  await context.removeColumn('Usages', 'cacheReadInputTokens');
};
