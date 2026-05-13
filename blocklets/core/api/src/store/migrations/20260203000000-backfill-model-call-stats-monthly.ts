/* eslint-disable no-console */
import dayjs from '@api/libs/dayjs';
import { DataTypes } from 'sequelize';

import { Migration } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  const startedAt = Date.now();

  await queryInterface.changeColumn('ModelCallStats', 'timeType', {
    type: DataTypes.ENUM('day', 'hour', 'month'),
    allowNull: false,
    defaultValue: 'hour',
  });

  const { createMonthlyModelCallStats } = await import('../../crons/model-call-stats');

  const currentMonthStart = dayjs.utc().startOf('month');
  const startMonth = currentMonthStart.subtract(12, 'month');

  for (let i = 0; i < 12; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await createMonthlyModelCallStats(startMonth.add(i, 'month').unix());
  }

  const durationMs = Date.now() - startedAt;
  console.log('[backfill-model-call-monthly-stats] done', { durationMs, months: 12 });
};

export const down: Migration = async () => {
  // no-op: data backfill is irreversible
};
