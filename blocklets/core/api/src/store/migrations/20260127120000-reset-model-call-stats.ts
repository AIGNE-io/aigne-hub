/* eslint-disable no-console */
import { Migration } from '../migrate';

export const up: Migration = async ({ context: queryInterface }) => {
  const startedAt = Date.now();
  console.log('[reset-model-call-stats] clearing ModelCallStats...');
  await queryInterface.sequelize.query('DELETE FROM "ModelCallStats"');

  const { createModelCallStats } = await import('../../crons/model-call-stats');

  const nowSeconds = Math.floor(Date.now() / 1000);
  const currentHour = Math.floor(nowSeconds / 3600) * 3600;

  const endHour = currentHour - 3600;
  const endDate = new Date(endHour * 1000);

  const startDate = new Date(endDate);
  startDate.setMonth(startDate.getMonth() - 3);
  const startHour = Math.floor(startDate.getTime() / 1000 / 3600) * 3600;

  const endTime = endHour + 3600 - 1;
  const totalHours = Math.floor((endTime - startHour) / 3600) + 1;
  console.log(
    `[reset-model-call-stats] backfilling ${totalHours} hours from ${new Date(
      startHour * 1000
    ).toISOString()} to ${new Date(endHour * 1000).toISOString()}`
  );

  for (let hour = startHour; hour <= endHour; hour += 86400) {
    const rangeStart = hour;
    const rangeEnd = Math.min(hour + 86400 - 1, endTime);
    await createModelCallStats(rangeStart, rangeEnd, undefined, true);
  }

  const durationMs = Date.now() - startedAt;
  console.log(`[reset-model-call-stats] done in ${durationMs}ms`);
};

export const down: Migration = async () => {
  // no-op: data rebuild is irreversible
};
