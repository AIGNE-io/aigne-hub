import BigNumber from 'bignumber.js';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Op,
  QueryTypes,
} from 'sequelize';

import logger from '../../libs/logger';
import nextId from '../../libs/next-id';
import { pushProjectFetchJob } from '../../queue/projects';
import { sequelize } from '../sequelize';
import Project from './project';
import { DailyStats } from './types';

export default class ModelCallStat extends Model<
  InferAttributes<ModelCallStat>,
  InferCreationAttributes<ModelCallStat>
> {
  declare id: CreationOptional<string>;

  declare userDid: string | null;

  declare appDid: CreationOptional<string | null>;

  declare timestamp: number;

  declare timeType: 'day' | 'hour';

  declare stats: DailyStats;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;

  public static readonly GENESIS_ATTRIBUTES = {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      defaultValue: nextId,
    },
    userDid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    appDid: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Project ID',
    },
    timestamp: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    timeType: {
      type: DataTypes.ENUM('day', 'hour'),
      allowNull: false,
      defaultValue: 'day',
    },
    stats: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  };

  /**
   * Get project-level daily stats (appDid = specific value)
   */
  static async getDailyStatsByApp(
    userDid: string | null,
    appDid: string | null | undefined,
    dayTimestamp: number
  ): Promise<DailyStats> {
    return ModelCallStat.getDailyStatsInternal(userDid, appDid, dayTimestamp);
  }

  /**
   * Get project-level hourly stats (appDid = specific value)
   */
  static async getHourlyStatsByApp(
    userDid: string | null,
    appDid: string | null | undefined,
    hourTimestamp: number
  ): Promise<DailyStats> {
    return ModelCallStat.getHourlyStatsInternal(userDid, appDid, hourTimestamp);
  }

  /**
   * Internal method: unified handling of daily aggregation
   */
  private static async getDailyStatsInternal(
    userDid: string | null,
    appDid: string | null | undefined,
    dayTimestamp: number
  ): Promise<DailyStats> {
    // Part 1: Check if today - compute in real-time
    if (ModelCallStat.isCurrentDay(dayTimestamp)) {
      return ModelCallStat.computeDailyStats(userDid, appDid, dayTimestamp);
    }

    // Part 2: Try to get existing day stats
    const existingDayStat = await ModelCallStat.findExistingDayStats(userDid, appDid, dayTimestamp);
    if (existingDayStat) {
      return existingDayStat.stats;
    }

    // Part 3: Try to merge from hour stats (for backward compatibility)
    const dayStart = dayTimestamp;

    const whereClause: any = {
      userDid,
      timestamp: { [Op.between]: [dayStart, dayStart + 86399] },
      timeType: 'hour',
    };

    ModelCallStat.applyStatsAppDidCondition(whereClause, appDid);

    const hourlyStats = await ModelCallStat.findAll({ where: whereClause });

    if (hourlyStats.length > 0) {
      // Merge hour stats into day stats
      return ModelCallStat.mergeStats(hourlyStats.map((s) => s.stats));
    }

    // Part 4: Compute and save if not found
    return ModelCallStat.computeAndSaveDailyStats(userDid, appDid, dayTimestamp);
  }

  /**
   * Internal method: unified handling of project-level aggregation
   */
  private static async getHourlyStatsInternal(
    userDid: string | null,
    appDid: string | null | undefined,
    hourTimestamp: number
  ): Promise<DailyStats> {
    // Part 1: Check if current hour - compute in real-time
    if (ModelCallStat.isCurrentHour(hourTimestamp)) {
      return ModelCallStat.computeHourlyStats(userDid, appDid, hourTimestamp);
    }

    // Part 2: Try to get existing stats
    const existingStat = await ModelCallStat.findExistingHourlyStats(userDid, appDid, hourTimestamp);
    if (existingStat) {
      return existingStat.stats;
    }

    // Part 3: Compute and save if not found (lazy loading)
    return ModelCallStat.computeAndSaveHourlyStats(userDid, appDid, hourTimestamp);
  }

  private static isCurrentHour(hourTimestamp: number): boolean {
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;
    return hourTimestamp >= currentHour;
  }

  private static isCurrentDay(dayTimestamp: number): boolean {
    const currentDay = Math.floor(Date.now() / 1000 / 86400) * 86400;
    return dayTimestamp >= currentDay;
  }

  private static async findExistingDayStats(
    userDid: string | null,
    appDid: string | null | undefined,
    dayTimestamp: number
  ): Promise<ModelCallStat | null> {
    const whereClause: any = {
      userDid,
      timestamp: dayTimestamp,
      timeType: 'day',
    };

    ModelCallStat.applyStatsAppDidCondition(whereClause, appDid);

    return ModelCallStat.findOne({ where: whereClause });
  }

  private static async findExistingHourlyStats(
    userDid: string | null,
    appDid: string | null | undefined,
    hourTimestamp: number
  ): Promise<ModelCallStat | null> {
    const whereClause: any = {
      userDid,
      timestamp: hourTimestamp,
      timeType: 'hour',
    };

    ModelCallStat.applyStatsAppDidCondition(whereClause, appDid);

    return ModelCallStat.findOne({ where: whereClause });
  }

  static async computeAndSaveDailyStats(
    userDid: string | null,
    appDid: string | null | undefined,
    dayTimestamp: number
  ): Promise<DailyStats> {
    const stats = await ModelCallStat.computeDailyStats(userDid, appDid, dayTimestamp);

    // Generate unique key including appDid
    const appPart = appDid ? `-${appDid}` : '';
    const dayKey = `${userDid}${appPart}-day-${dayTimestamp}`;

    try {
      await ModelCallStat.create({
        id: dayKey,
        userDid,
        appDid: appDid ?? null,
        timestamp: dayTimestamp,
        timeType: 'day',
        stats,
      });
    } catch (error: any) {
      // Handle duplicate key error (race condition)
      if (error.name === 'SequelizeUniqueConstraintError') {
        const existing = await ModelCallStat.findExistingDayStats(userDid, appDid, dayTimestamp);
        if (existing) {
          return existing.stats;
        }
      }
      throw error;
    }

    return stats;
  }

  static async computeAndSaveHourlyStats(
    userDid: string | null,
    appDid: string | null | undefined,
    hourTimestamp: number
  ): Promise<DailyStats> {
    const stats = await ModelCallStat.computeHourlyStats(userDid, appDid, hourTimestamp);
    if (stats.totalCalls === 0) {
      return stats;
    }

    // Generate unique key including appDid
    const appPart = appDid ? `-${appDid}` : '';
    const hourKey = `${userDid}${appPart}-${hourTimestamp}`;

    try {
      await ModelCallStat.create({
        id: hourKey,
        userDid,
        appDid: appDid ?? null,
        timestamp: hourTimestamp,
        timeType: 'hour',
        stats,
      });
    } catch (error: any) {
      // Handle duplicate key error (race condition)
      if (error.name === 'SequelizeUniqueConstraintError') {
        const existing = await ModelCallStat.findExistingHourlyStats(userDid, appDid, hourTimestamp);
        if (existing) {
          return existing.stats;
        }
      }
      throw error;
    }

    return stats;
  }

  /**
   * Get user-level aggregated stats across all projects (no cache write)
   */
  static async getUserAggregatedStats(userDid: string, startTime: number, endTime: number): Promise<DailyStats> {
    return ModelCallStat.executeStatsQueries(userDid, undefined, startTime, endTime);
  }

  /**
   * Get aggregated stats for a time range (past days use daily aggregation, current day uses realtime)
   */
  static async getAggregatedStats(
    userDid: string | null,
    appDid: string | null | undefined,
    startTime: number,
    endTime: number
  ): Promise<DailyStats> {
    const safeStart = Math.min(startTime, endTime);
    const safeEnd = Math.max(startTime, endTime);
    const startDay = Math.floor(safeStart / 86400) * 86400;
    const endDay = Math.floor(safeEnd / 86400) * 86400;
    const currentDay = Math.floor(Date.now() / 1000 / 86400) * 86400;

    let fullStartDay = startDay;
    if (safeStart > startDay) {
      fullStartDay = startDay + 86400;
    }

    let fullEndDay = endDay;
    if (safeEnd < endDay + 86400 - 1) {
      fullEndDay = endDay - 86400;
    }

    fullEndDay = Math.min(fullEndDay, currentDay - 86400);

    const statsList: DailyStats[] = [];

    // Aggregate full past days via daily stats
    if (fullStartDay <= fullEndDay) {
      const dayTrends = await ModelCallStat.getTrendsDaily(userDid, appDid, fullStartDay, fullEndDay);
      statsList.push(...dayTrends.map((trend) => trend.stats));
    }

    const ranges: Array<{ start: number; end: number }> = [];
    if (fullStartDay <= fullEndDay) {
      const preEnd = Math.min(safeEnd, fullStartDay - 1);
      if (safeStart <= preEnd) {
        ranges.push({ start: safeStart, end: preEnd });
      }

      const postStart = Math.max(safeStart, fullEndDay + 86400);
      if (postStart <= safeEnd) {
        ranges.push({ start: postStart, end: safeEnd });
      }
    } else {
      ranges.push({ start: safeStart, end: safeEnd });
    }

    // Partial days or current day: realtime calculation (no cache write)
    for (const range of ranges) {
      if (range.start > range.end) continue;
      const stats = await ModelCallStat.executeStatsQueries(userDid, appDid, range.start, range.end);
      statsList.push(stats);
    }

    return ModelCallStat.mergeStats(statsList);
  }

  /**
   * Get trends data with specified granularity
   */
  static async getTrends(
    userDid: string | null,
    appDid: string | null | undefined,
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day' = 'day'
  ): Promise<Array<{ timestamp: number; stats: DailyStats }>> {
    if (granularity === 'hour') {
      // Hour granularity: use lazy loading
      return ModelCallStat.getTrendsHourly(userDid, appDid, startTime, endTime);
    }

    // Day granularity: prioritize day stats, fallback to merged hour stats
    return ModelCallStat.getTrendsDaily(userDid, appDid, startTime, endTime);
  }

  /**
   * Get trends for multiple projects in a single query (cache-first)
   * This avoids per-project loops and heavy realtime aggregation for missing stats.
   */
  static async getProjectTrendsBatch(
    userDid: string | null | undefined,
    appDids: Array<string | null | undefined>,
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day' = 'day'
  ): Promise<Array<{ timestamp: number; byProject: Record<string, DailyStats> }>> {
    const appDidList = Array.from(
      new Set(appDids.filter((appDid): appDid is string => typeof appDid === 'string' && appDid.length > 0))
    );
    if (appDidList.length === 0) {
      return [];
    }

    const bucketSize = granularity === 'hour' ? 3600 : 86400;
    const startBucket = Math.floor(startTime / bucketSize) * bucketSize;
    const endBucket = Math.floor(endTime / bucketSize) * bucketSize;
    const projectKeys = appDidList.map((appDid) => ModelCallStat.getProjectKey(appDid));

    if (granularity === 'hour') {
      const trendsByTimestamp = await ModelCallStat.getRealtimeProjectTrendsRange(
        userDid,
        appDidList,
        startTime,
        endTime,
        granularity
      );

      const result: Array<{ timestamp: number; byProject: Record<string, DailyStats> }> = [];
      for (let bucket = startBucket; bucket <= endBucket; bucket += bucketSize) {
        const byProject = trendsByTimestamp.get(bucket) || {};
        projectKeys.forEach((projectKey) => {
          if (!byProject[projectKey]) {
            byProject[projectKey] = ModelCallStat.getEmptyStats();
          }
        });
        result.push({ timestamp: bucket, byProject });
      }

      return result;
    }

    const timeType = 'day';
    const whereClause: any = {
      timestamp: { [Op.between]: [startBucket, endBucket] },
      timeType,
    };

    if (userDid === null) {
      whereClause.userDid = { [Op.not]: null };
    } else if (userDid !== undefined) {
      whereClause.userDid = userDid;
    }

    if (appDidList.length) {
      whereClause.appDid = { [Op.in]: appDidList };
    }

    const rows = await ModelCallStat.findAll({
      where: whereClause,
      order: [['timestamp', 'ASC']],
      raw: true,
    });

    const trendsByTimestamp = new Map<number, Record<string, DailyStats>>();

    rows.forEach((row: any) => {
      const timestamp = Number(row.timestamp);
      if (!Number.isFinite(timestamp)) return;

      const { appDid } = row;
      if (!appDid) return;
      const projectKey = ModelCallStat.getProjectKey(appDid);
      const stats = ModelCallStat.parseStats(row.stats);
      const prepared = ModelCallStat.prepareTrendStats(stats);

      if (!trendsByTimestamp.has(timestamp)) {
        trendsByTimestamp.set(timestamp, {});
      }

      const existing = trendsByTimestamp.get(timestamp)![projectKey];
      if (existing) {
        trendsByTimestamp.get(timestamp)![projectKey] = ModelCallStat.mergeTrendStats(existing, prepared);
      } else {
        trendsByTimestamp.get(timestamp)![projectKey] = prepared;
      }
    });

    // Merge current bucket realtime stats (cache-only for historical data)
    const realtimeMap = await ModelCallStat.getRealtimeProjectTrends(
      userDid,
      appDidList,
      startTime,
      endTime,
      granularity
    );

    realtimeMap.forEach((byProject, timestamp) => {
      if (!trendsByTimestamp.has(timestamp)) {
        trendsByTimestamp.set(timestamp, {});
      }
      const target = trendsByTimestamp.get(timestamp)!;
      Object.entries(byProject).forEach(([projectKey, stats]) => {
        const existing = target[projectKey];
        if (existing) {
          target[projectKey] = ModelCallStat.mergeTrendStats(existing, stats);
        } else {
          target[projectKey] = stats;
        }
      });
    });

    const result: Array<{ timestamp: number; byProject: Record<string, DailyStats> }> = [];
    for (let bucket = startBucket; bucket <= endBucket; bucket += bucketSize) {
      const byProject = trendsByTimestamp.get(bucket) || {};
      projectKeys.forEach((projectKey) => {
        if (!byProject[projectKey]) {
          byProject[projectKey] = ModelCallStat.getEmptyStats();
        }
      });
      result.push({ timestamp: bucket, byProject });
    }

    return result;
  }

  /**
   * Get hourly trends (lazy loading)
   */
  private static async getTrendsHourly(
    userDid: string | null,
    appDid: string | null | undefined,
    startTime: number,
    endTime: number
  ): Promise<Array<{ timestamp: number; stats: DailyStats }>> {
    const startHour = Math.floor(startTime / 3600) * 3600;
    const endHour = Math.floor(endTime / 3600) * 3600;
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;

    const result: Array<{ timestamp: number; stats: DailyStats }> = [];

    for (let hour = startHour; hour <= endHour; hour += 3600) {
      if (hour >= currentHour) {
        // Current hour: compute in real-time
        const stats = await ModelCallStat.computeHourlyStats(userDid, appDid, hour);
        result.push({ timestamp: hour, stats });
      } else {
        // Past hour: use lazy loading (check cache first, then compute and save)
        const stats = await ModelCallStat.getHourlyStatsInternal(userDid, appDid, hour);
        result.push({ timestamp: hour, stats });
      }
    }

    return result;
  }

  /**
   * Get daily trends from day stats
   */
  private static async getTrendsDaily(
    userDid: string | null,
    appDid: string | null | undefined,
    startTime: number,
    endTime: number
  ): Promise<Array<{ timestamp: number; stats: DailyStats }>> {
    const startDay = Math.floor(startTime / 86400) * 86400;
    const endDay = Math.floor(endTime / 86400) * 86400;
    const currentDay = Math.floor(Date.now() / 1000 / 86400) * 86400;

    // Step 1: Batch query all day stats in the range
    const whereClause: any = {
      timestamp: { [Op.between]: [startDay, endDay] },
      timeType: 'day',
    };
    if (userDid === null) {
      whereClause.userDid = { [Op.not]: null };
    } else if (userDid !== undefined) {
      whereClause.userDid = userDid;
    }
    ModelCallStat.applyStatsAppDidCondition(whereClause, appDid);

    const dayStats = await ModelCallStat.findAll({
      where: whereClause,
      order: [['timestamp', 'ASC']],
    });

    // Create a map of existing day stats (merge duplicates for admin aggregation)
    const dayStatsMap = new Map<number, DailyStats>();
    dayStats.forEach((stat) => {
      const existing = dayStatsMap.get(stat.timestamp);
      if (existing) {
        dayStatsMap.set(stat.timestamp, ModelCallStat.mergeStats([existing, stat.stats]));
      } else {
        dayStatsMap.set(stat.timestamp, stat.stats);
      }
    });

    // Step 2: Build result array
    const result: Array<{ timestamp: number; stats: DailyStats }> = [];
    for (let day = startDay; day <= endDay; day += 86400) {
      if (day >= currentDay) {
        // Today or future: compute in real-time
        const stats = await ModelCallStat.computeDailyStats(userDid, appDid, day);
        result.push({ timestamp: day, stats });
      } else {
        // Past day: get from map (day stats or empty)
        const stats = dayStatsMap.get(day) || ModelCallStat.getEmptyStats();
        result.push({ timestamp: day, stats });
      }
    }

    return result;
  }

  /**
   * Get user-level trends across all projects (no cache write)
   */
  static async getUserTrends(
    userDid: string,
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day' = 'day'
  ): Promise<Array<{ timestamp: number; stats: DailyStats }>> {
    const bucketSize = granularity === 'hour' ? 3600 : 86400;
    const startBucket = Math.floor(startTime / bucketSize) * bucketSize;
    const endBucket = Math.floor(endTime / bucketSize) * bucketSize;

    const query = `
      SELECT
        FLOOR("callTime" / ${bucketSize}) * ${bucketSize} as "timestamp",
        SUM("totalUsage") as "totalUsage",
        SUM("credits") as "totalCredits",
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls",
        SUM(CASE WHEN "status" = 'success' THEN "duration" ELSE 0 END) as "totalDuration",
        AVG(CASE WHEN "status" = 'success' THEN "duration" ELSE NULL END) as "avgDuration"
      FROM "ModelCalls"
      WHERE "userDid" = :userDid
        AND "callTime" >= :startTime
        AND "callTime" <= :endTime
      GROUP BY "timestamp"
      ORDER BY "timestamp" ASC
    `;

    const rows = (await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: { userDid, startTime, endTime },
    })) as Array<{
      timestamp: number | string;
      totalUsage: string | number | null;
      totalCredits: string | number | null;
      totalCalls: string | number | null;
      successCalls: string | number | null;
      totalDuration: string | number | null;
      avgDuration: string | number | null;
    }>;

    const statsMap = new Map<number, DailyStats>();
    rows.forEach((row) => {
      const timestamp = Number(row.timestamp);
      if (!Number.isFinite(timestamp)) return;

      const totalCredits = new BigNumber(row.totalCredits || '0').toNumber();
      const totalUsage = parseInt(String(row.totalUsage || '0'), 10);
      const totalCalls = parseInt(String(row.totalCalls || '0'), 10);
      const successCalls = parseInt(String(row.successCalls || '0'), 10);
      const totalDuration = parseFloat(String(row.totalDuration || '0'));
      const avgDuration = Math.round(parseFloat(String(row.avgDuration || '0')) * 10) / 10;

      statsMap.set(timestamp, {
        totalUsage,
        totalCredits,
        totalCalls,
        successCalls,
        totalDuration,
        avgDuration,
        byType: {},
      });
    });

    const result: Array<{ timestamp: number; stats: DailyStats }> = [];
    for (let bucket = startBucket; bucket <= endBucket; bucket += bucketSize) {
      result.push({
        timestamp: bucket,
        stats: statsMap.get(bucket) || ModelCallStat.getEmptyStats(),
      });
    }

    return result;
  }

  private static async getGlobalTrendsRealtime(
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day'
  ): Promise<Array<{ timestamp: number; stats: DailyStats }>> {
    const bucketSize = granularity === 'hour' ? 3600 : 86400;
    const startBucket = Math.floor(startTime / bucketSize) * bucketSize;
    const endBucket = Math.floor(endTime / bucketSize) * bucketSize;

    const query = `
      SELECT
        FLOOR("callTime" / ${bucketSize}) * ${bucketSize} as "timestamp",
        SUM("totalUsage") as "totalUsage",
        SUM("credits") as "totalCredits",
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls",
        SUM(CASE WHEN "status" = 'success' THEN "duration" ELSE 0 END) as "totalDuration",
        AVG(CASE WHEN "status" = 'success' THEN "duration" ELSE NULL END) as "avgDuration"
      FROM "ModelCalls"
      WHERE "callTime" >= :startTime
        AND "callTime" <= :endTime
      GROUP BY "timestamp"
      ORDER BY "timestamp" ASC
    `;

    const realtimeQueryStart = Date.now();
    const rows = (await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: { startTime, endTime },
    })) as Array<{
      timestamp: number | string;
      totalUsage: string | number | null;
      totalCredits: string | number | null;
      totalCalls: string | number | null;
      successCalls: string | number | null;
      totalDuration: string | number | null;
      avgDuration: string | number | null;
    }>;
    logger.info('ModelCallStat global trends realtime SQL', {
      elapsedMs: Date.now() - realtimeQueryStart,
      startTime,
      endTime,
      bucketSize,
      rowCount: rows.length,
    });

    const statsMap = new Map<number, DailyStats>();
    rows.forEach((row) => {
      const timestamp = Number(row.timestamp);
      if (!Number.isFinite(timestamp)) return;

      const totalCredits = new BigNumber(row.totalCredits || '0').toNumber();
      const totalUsage = parseInt(String(row.totalUsage || '0'), 10);
      const totalCalls = parseInt(String(row.totalCalls || '0'), 10);
      const successCalls = parseInt(String(row.successCalls || '0'), 10);
      const totalDuration = parseFloat(String(row.totalDuration || '0'));
      const avgDuration = Math.round(parseFloat(String(row.avgDuration || '0')) * 10) / 10;

      statsMap.set(timestamp, {
        totalUsage,
        totalCredits,
        totalCalls,
        successCalls,
        totalDuration,
        avgDuration,
        byType: {},
      });
    });

    const result: Array<{ timestamp: number; stats: DailyStats }> = [];
    for (let bucket = startBucket; bucket <= endBucket; bucket += bucketSize) {
      result.push({
        timestamp: bucket,
        stats: statsMap.get(bucket) || ModelCallStat.getEmptyStats(),
      });
    }

    return result;
  }

  private static parseStats(raw: any): DailyStats {
    if (!raw) return ModelCallStat.getEmptyStats();
    if (typeof raw === 'string') {
      try {
        return JSON.parse(raw) as DailyStats;
      } catch (error) {
        return ModelCallStat.getEmptyStats();
      }
    }
    return raw as DailyStats;
  }

  private static getProjectKey(appDid: string): string {
    return appDid;
  }

  private static prepareTrendStats(stats: DailyStats): DailyStats {
    return {
      totalUsage: stats.totalUsage || 0,
      totalCredits: stats.totalCredits || 0,
      totalCalls: stats.totalCalls || 0,
      successCalls: stats.successCalls || 0,
      totalDuration: stats.totalDuration || 0,
      avgDuration: stats.avgDuration || 0,
      byType: {},
    };
  }

  private static mergeTrendStats(target: DailyStats, source: DailyStats): DailyStats {
    const merged: DailyStats = {
      totalUsage: target.totalUsage + source.totalUsage,
      totalCredits: target.totalCredits + source.totalCredits,
      totalCalls: target.totalCalls + source.totalCalls,
      successCalls: target.successCalls + source.successCalls,
      totalDuration: (target.totalDuration || 0) + (source.totalDuration || 0),
      avgDuration: 0,
      byType: {},
    };

    if (merged.successCalls > 0 && merged.totalDuration) {
      merged.avgDuration = Math.round((merged.totalDuration / merged.successCalls) * 10) / 10;
    }

    return merged;
  }

  private static async getRealtimeProjectTrends(
    userDid: string | null | undefined,
    appDids: string[],
    _startTime: number,
    endTime: number,
    granularity: 'hour' | 'day'
  ): Promise<Map<number, Record<string, DailyStats>>> {
    if (!appDids.length) return new Map();

    const bucketSize = granularity === 'hour' ? 3600 : 86400;
    const currentBucket = Math.floor(Date.now() / 1000 / bucketSize) * bucketSize;
    const endBucket = Math.floor(endTime / bucketSize) * bucketSize;

    if (endBucket < currentBucket) {
      return new Map();
    }

    const appDidList = appDids;

    const replacements: Record<string, any> = {
      startTime: currentBucket,
      endTime: Math.min(endTime, currentBucket + bucketSize - 1),
    };

    const whereConditions: string[] = ['"callTime" >= :startTime', '"callTime" <= :endTime'];
    if (userDid === null) {
      whereConditions.unshift('"userDid" IS NOT NULL');
    } else if (userDid !== undefined) {
      whereConditions.unshift('"userDid" = :userDid');
      replacements.userDid = userDid;
    }

    if (appDidList.length) {
      whereConditions.push('"appDid" IN (:appDids)');
      replacements.appDids = appDidList;
    }

    const query = `
      SELECT
        FLOOR("callTime" / ${bucketSize}) * ${bucketSize} as "timestamp",
        "appDid" as "appDid",
        SUM("totalUsage") as "totalUsage",
        SUM("credits") as "totalCredits",
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls",
        SUM(CASE WHEN "status" = 'success' THEN "duration" ELSE 0 END) as "totalDuration",
        AVG(CASE WHEN "status" = 'success' THEN "duration" ELSE NULL END) as "avgDuration"
      FROM "ModelCalls"
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY "timestamp", "appDid"
      ORDER BY "timestamp" ASC
    `;

    const rows = (await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements,
    })) as Array<{
      timestamp: number | string;
      appDid: string | null;
      totalUsage: string | number | null;
      totalCredits: string | number | null;
      totalCalls: string | number | null;
      successCalls: string | number | null;
      totalDuration: string | number | null;
      avgDuration: string | number | null;
    }>;

    const result = new Map<number, Record<string, DailyStats>>();
    rows.forEach((row) => {
      const timestamp = Number(row.timestamp);
      if (!Number.isFinite(timestamp)) return;
      const { appDid } = row;
      if (!appDid) return;
      const projectKey = ModelCallStat.getProjectKey(appDid);
      const totalCredits = new BigNumber(row.totalCredits || '0').toNumber();
      const totalUsage = parseInt(String(row.totalUsage || '0'), 10);
      const totalCalls = parseInt(String(row.totalCalls || '0'), 10);
      const successCalls = parseInt(String(row.successCalls || '0'), 10);
      const totalDuration = parseFloat(String(row.totalDuration || '0'));
      const avgDuration = Math.round(parseFloat(String(row.avgDuration || '0')) * 10) / 10;

      const stats: DailyStats = {
        totalUsage,
        totalCredits,
        totalCalls,
        successCalls,
        totalDuration,
        avgDuration,
        byType: {},
      };

      if (!result.has(timestamp)) {
        result.set(timestamp, {});
      }
      result.get(timestamp)![projectKey] = stats;
    });

    return result;
  }

  private static async getRealtimeProjectTrendsRange(
    userDid: string | null | undefined,
    appDids: string[],
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day'
  ): Promise<Map<number, Record<string, DailyStats>>> {
    if (!appDids.length) return new Map();

    const bucketSize = granularity === 'hour' ? 3600 : 86400;
    const appDidList = appDids;

    const replacements: Record<string, any> = {
      startTime,
      endTime,
    };

    const whereConditions: string[] = ['"callTime" >= :startTime', '"callTime" <= :endTime'];
    if (userDid === null) {
      whereConditions.unshift('"userDid" IS NOT NULL');
    } else if (userDid !== undefined) {
      whereConditions.unshift('"userDid" = :userDid');
      replacements.userDid = userDid;
    }

    if (appDidList.length) {
      whereConditions.push('"appDid" IN (:appDids)');
      replacements.appDids = appDidList;
    }

    const query = `
      SELECT
        FLOOR("callTime" / ${bucketSize}) * ${bucketSize} as "timestamp",
        "appDid" as "appDid",
        SUM("totalUsage") as "totalUsage",
        SUM("credits") as "totalCredits",
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls",
        SUM(CASE WHEN "status" = 'success' THEN "duration" ELSE 0 END) as "totalDuration",
        AVG(CASE WHEN "status" = 'success' THEN "duration" ELSE NULL END) as "avgDuration"
      FROM "ModelCalls"
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY "timestamp", "appDid"
      ORDER BY "timestamp" ASC
    `;

    const rows = (await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements,
    })) as Array<{
      timestamp: number | string;
      appDid: string | null;
      totalUsage: string | number | null;
      totalCredits: string | number | null;
      totalCalls: string | number | null;
      successCalls: string | number | null;
      totalDuration: string | number | null;
      avgDuration: string | number | null;
    }>;

    const result = new Map<number, Record<string, DailyStats>>();
    rows.forEach((row) => {
      const timestamp = Number(row.timestamp);
      if (!Number.isFinite(timestamp)) return;
      const { appDid } = row;
      if (!appDid) return;
      const projectKey = ModelCallStat.getProjectKey(appDid);
      const totalCredits = new BigNumber(row.totalCredits || '0').toNumber();
      const totalUsage = parseInt(String(row.totalUsage || '0'), 10);
      const totalCalls = parseInt(String(row.totalCalls || '0'), 10);
      const successCalls = parseInt(String(row.successCalls || '0'), 10);
      const totalDuration = parseFloat(String(row.totalDuration || '0'));
      const avgDuration = Math.round(parseFloat(String(row.avgDuration || '0')) * 10) / 10;

      const stats: DailyStats = {
        totalUsage,
        totalCredits,
        totalCalls,
        successCalls,
        totalDuration,
        avgDuration,
        byType: {},
      };

      if (!result.has(timestamp)) {
        result.set(timestamp, {});
      }
      result.get(timestamp)![projectKey] = stats;
    });

    return result;
  }

  /**
   * Get global trends across all users (admin only)
   * Aggregates from per-user daily stats for performance
   */
  static async getGlobalTrends(
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day' = 'day'
  ): Promise<Array<{ timestamp: number; stats: DailyStats }>> {
    if (granularity === 'hour') {
      return ModelCallStat.getGlobalTrendsRealtime(startTime, endTime, granularity);
    }

    const bucketSize = 86400;
    const startBucket = Math.floor(startTime / bucketSize) * bucketSize;
    const endBucket = Math.floor(endTime / bucketSize) * bucketSize;
    const timeType = 'day';
    const currentDay = Math.floor(Date.now() / 1000 / 86400) * 86400;
    const statsEnd = Math.min(endBucket, currentDay - 86400);

    // Aggregate from per-user stats (avoid relying on global aggregates)
    const rows =
      statsEnd >= startBucket
        ? await ModelCallStat.findAll({
            where: {
              timestamp: { [Op.between]: [startBucket, statsEnd] },
              timeType,
              userDid: { [Op.not]: null },
            },
            order: [['timestamp', 'ASC']],
            raw: true,
          })
        : [];

    const statsMap = new Map<number, DailyStats>();
    rows.forEach((row: any) => {
      const timestamp = Number(row.timestamp);
      if (!Number.isFinite(timestamp)) return;
      const stats = ModelCallStat.parseStats(row.stats);
      const prepared = ModelCallStat.prepareTrendStats(stats);
      const existing = statsMap.get(timestamp);
      if (existing) {
        statsMap.set(timestamp, ModelCallStat.mergeTrendStats(existing, prepared));
      } else {
        statsMap.set(timestamp, prepared);
      }
    });

    if (endBucket >= currentDay) {
      const realtimeEnd = Math.min(endTime, currentDay + bucketSize - 1);
      const realtime = await ModelCallStat.getGlobalTrendsRealtime(currentDay, realtimeEnd, 'day');
      realtime.forEach((entry) => {
        const existing = statsMap.get(entry.timestamp);
        if (existing) {
          statsMap.set(entry.timestamp, ModelCallStat.mergeTrendStats(existing, entry.stats));
        } else {
          statsMap.set(entry.timestamp, entry.stats);
        }
      });
    }

    const result: Array<{ timestamp: number; stats: DailyStats }> = [];
    for (let bucket = startBucket; bucket <= endBucket; bucket += bucketSize) {
      result.push({
        timestamp: bucket,
        stats: statsMap.get(bucket) || ModelCallStat.getEmptyStats(),
      });
    }

    return result;
  }

  /**
   * Get projects list with aggregated stats
   * This method uses optimized SQL to calculate stats directly without triggering cache population
   */
  static async getProjects(
    userDid: string | null | undefined,
    startTime: number,
    endTime: number,
    options?: {
      page?: number;
      pageSize?: number;
      sortBy?: 'totalCalls' | 'totalCredits' | 'lastCallTime';
      sortOrder?: 'asc' | 'desc';
      rangeDays?: number;
    }
  ): Promise<{
    projects: Array<{
      appDid: string | null;
      appName?: string;
      appLogo?: string;
      appUrl?: string;
      stats: DailyStats;
      lastCallTime: number;
    }>;
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = options?.page || 1;
    const pageSize = Math.min(options?.pageSize || 20, 100);
    const sortBy = options?.sortBy || 'totalCalls';
    const rawSortOrder = options?.sortOrder;
    const sortOrder = rawSortOrder === 'asc' || rawSortOrder === 'desc' ? rawSortOrder : 'desc';
    const orderDirection = sortOrder === 'asc' ? 'ASC' : 'DESC';
    const rangeSeconds = Math.max(0, endTime - startTime);
    const rangeDays = options?.rangeDays ?? Math.max(1, Math.ceil(rangeSeconds / 86400));

    if (rangeDays <= 1) {
      // Step 1: Fast query to get project list with complete stats for sorting/pagination
      const sortColumn =
        sortBy === 'totalCalls' ? 'totalCalls' : sortBy === 'totalCredits' ? 'totalCredits' : 'lastCallTime';

      const whereConditions = ['"callTime" >= :startTime', '"callTime" <= :endTime'];
      const replacements: Record<string, any> = { startTime, endTime };
      if (userDid === null) {
        whereConditions.unshift('"userDid" IS NOT NULL');
      } else if (userDid !== undefined) {
        whereConditions.unshift('"userDid" = :userDid');
        replacements.userDid = userDid;
      }
      const whereClause = whereConditions.join(' AND ');

      const query = `
      WITH project_calls AS (
        SELECT
          "appDid" as "appDid",
          COUNT(*) as "totalCalls",
          SUM("credits") as "totalCredits",
          SUM("totalUsage") as "totalUsage",
          SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls",
          AVG(CASE WHEN "status" = 'success' THEN "duration" ELSE NULL END) as "avgDuration",
          MAX("callTime") as "lastCallTime"
        FROM "ModelCalls"
        WHERE ${whereClause}
        GROUP BY "appDid"
        HAVING "appDid" IS NOT NULL
      ),
      total_count AS (
        SELECT COUNT(*) as total FROM project_calls
      )
      SELECT
        pc."appDid",
        pc."totalCalls",
        pc."totalCredits",
        pc."totalUsage",
        pc."successCalls",
        pc."avgDuration",
        pc."lastCallTime",
        tc.total
      FROM project_calls pc
      CROSS JOIN total_count tc
      ORDER BY pc."${sortColumn}" ${orderDirection}
      LIMIT :limit OFFSET :offset
    `;

      const limit = pageSize;
      const offset = (page - 1) * pageSize;

      const results = (await sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements: { ...replacements, limit, offset },
      })) as Array<{
        appDid: string | null;
        totalCalls: string;
        totalCredits: string;
        totalUsage: string;
        successCalls: string;
        avgDuration: string | null;
        lastCallTime: number;
        total: string;
      }>;

      if (results.length === 0) {
        return { projects: [], total: 0, page, pageSize };
      }

      const total = parseInt(results[0]!.total, 10);

      // Step 2: Get project info for the paginated appDids
      const appDids = results.map((r) => r.appDid).filter(Boolean) as string[];
      const projects = appDids.length
        ? await Project.findAll({
            where: { appDid: { [Op.in]: appDids } },
          })
        : [];

      const projectMap = new Map(projects.map((p) => [p.appDid, p]));

      // Step 3: Build project list
      const projectList = await Promise.all(
        results.map(async (result) => {
          const { appDid } = result;
          const project = appDid ? projectMap.get(appDid) : undefined;

          // If project info not found, push to queue
          if (!project && appDid) {
            pushProjectFetchJob(appDid);
          }

          const totalCredits = new BigNumber(result.totalCredits || '0');

          const stats: DailyStats = {
            totalUsage: parseInt(result.totalUsage || '0', 10),
            totalCredits: totalCredits.toNumber(),
            totalCalls: parseInt(result.totalCalls || '0', 10),
            successCalls: parseInt(result.successCalls || '0', 10),
            totalDuration: 0,
            avgDuration: Math.round(parseFloat(result.avgDuration || '0') * 10) / 10,
            byType: {},
          };

          return {
            appDid,
            appName: project?.appName || appDid || undefined,
            appLogo: project?.appLogo || undefined,
            appUrl: project?.appUrl || undefined,
            stats,
            lastCallTime: result.lastCallTime,
          };
        })
      );

      return {
        projects: projectList,
        total,
        page,
        pageSize,
      };
    }

    const currentDay = Math.floor(Date.now() / 1000 / 86400) * 86400;
    const statsStart = Math.floor(startTime / 86400) * 86400;
    const statsEnd = Math.min(Math.floor(endTime / 86400) * 86400, currentDay - 86400);
    const statsByApp = new Map<string, DailyStats>();
    const lastCallByApp = new Map<string, number>();

    if (statsStart <= statsEnd) {
      const whereClause: any = {
        timestamp: { [Op.between]: [statsStart, statsEnd] },
        timeType: 'day',
      };

      // Admin query: aggregate across per-user stats only (exclude global aggregates)
      // User query: filter by specific userDid
      if (userDid === null) {
        whereClause.userDid = { [Op.not]: null };
      } else if (userDid !== undefined) {
        whereClause.userDid = userDid;
      }

      const rows = await ModelCallStat.findAll({
        where: whereClause,
        order: [['timestamp', 'ASC']],
        raw: true,
      });

      rows.forEach((row: any) => {
        const { appDid } = row;
        if (!appDid) return;
        const stats = ModelCallStat.parseStats(row.stats);
        const target = statsByApp.get(appDid) || ModelCallStat.getEmptyStats();
        const timestamp = Number(row.timestamp);

        target.totalUsage += stats.totalUsage || 0;
        target.totalCredits += stats.totalCredits || 0;
        target.totalCalls += stats.totalCalls || 0;
        target.successCalls += stats.successCalls || 0;
        target.totalDuration = (target.totalDuration || 0) + (stats.totalDuration || 0);

        if (target.successCalls > 0 && target.totalDuration) {
          target.avgDuration = Math.round((target.totalDuration / target.successCalls) * 10) / 10;
        }

        statsByApp.set(appDid, target);

        if (Number.isFinite(timestamp)) {
          if ((stats.totalCalls || 0) > 0) {
            const approximateLastCall = timestamp + 86399;
            const existing = lastCallByApp.get(appDid) || 0;
            if (approximateLastCall > existing) {
              lastCallByApp.set(appDid, approximateLastCall);
            }
          }
        }
      });
    }

    if (endTime >= currentDay) {
      const currentStart = Math.max(startTime, currentDay);
      const currentEnd = Math.min(endTime, currentDay + 86400 - 1);
      const whereConditions = ['"callTime" >= :startTime', '"callTime" <= :endTime'];
      const replacements: Record<string, any> = { startTime: currentStart, endTime: currentEnd };
      if (userDid === null) {
        whereConditions.unshift('"userDid" IS NOT NULL');
      } else if (userDid !== undefined) {
        whereConditions.unshift('"userDid" = :userDid');
        replacements.userDid = userDid;
      }

      const query = `
        SELECT
          "appDid" as "appDid",
          COUNT(*) as "totalCalls",
          SUM("credits") as "totalCredits",
          SUM("totalUsage") as "totalUsage",
          SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls",
          SUM(CASE WHEN "status" = 'success' THEN "duration" ELSE 0 END) as "totalDuration",
          AVG(CASE WHEN "status" = 'success' THEN "duration" ELSE NULL END) as "avgDuration",
          MAX("callTime") as "lastCallTime"
        FROM "ModelCalls"
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY "appDid"
      `;

      const rows = (await sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements,
      })) as Array<{
        appDid: string | null;
        totalCalls: string;
        totalCredits: string;
        totalUsage: string;
        successCalls: string;
        totalDuration: string | null;
        avgDuration: string | null;
        lastCallTime: number | null;
      }>;

      rows.forEach((row) => {
        const { appDid } = row;
        if (!appDid) return;
        const target = statsByApp.get(appDid) || ModelCallStat.getEmptyStats();
        const totalCredits = new BigNumber(row.totalCredits || '0').toNumber();
        const totalUsage = parseInt(String(row.totalUsage || '0'), 10);
        const totalCalls = parseInt(String(row.totalCalls || '0'), 10);
        const successCalls = parseInt(String(row.successCalls || '0'), 10);
        const totalDuration = parseFloat(String(row.totalDuration || '0'));

        target.totalUsage += totalUsage;
        target.totalCredits += totalCredits;
        target.totalCalls += totalCalls;
        target.successCalls += successCalls;
        target.totalDuration = (target.totalDuration || 0) + totalDuration;

        if (target.successCalls > 0 && target.totalDuration) {
          target.avgDuration = Math.round((target.totalDuration / target.successCalls) * 10) / 10;
        }

        statsByApp.set(appDid, target);

        const lastCallTime = Number(row.lastCallTime || 0);
        if (Number.isFinite(lastCallTime) && lastCallTime > 0) {
          const existing = lastCallByApp.get(appDid) || 0;
          if (lastCallTime > existing) {
            lastCallByApp.set(appDid, lastCallTime);
          }
        }
      });
    }

    const appDids = Array.from(statsByApp.keys());
    const projects = appDids.length
      ? await Project.findAll({
          where: { appDid: { [Op.in]: appDids } },
        })
      : [];

    const projectMap = new Map(projects.map((p) => [p.appDid, p]));

    const projectList = Array.from(statsByApp.entries()).map(([appDid, stats]) => {
      const project = projectMap.get(appDid);
      if (!project) {
        pushProjectFetchJob(appDid);
      }

      return {
        appDid,
        appName: project?.appName || appDid || undefined,
        appLogo: project?.appLogo || undefined,
        appUrl: project?.appUrl || undefined,
        stats,
        lastCallTime: lastCallByApp.get(appDid) || 0,
      };
    });

    const sortedProjects = projectList.sort((a, b) => {
      const aValue =
        sortBy === 'lastCallTime'
          ? a.lastCallTime
          : sortBy === 'totalCredits'
            ? a.stats.totalCredits
            : a.stats.totalCalls;
      const bValue =
        sortBy === 'lastCallTime'
          ? b.lastCallTime
          : sortBy === 'totalCredits'
            ? b.stats.totalCredits
            : b.stats.totalCalls;
      return orderDirection === 'ASC' ? aValue - bValue : bValue - aValue;
    });

    const total = sortedProjects.length;
    const offset = (page - 1) * pageSize;
    const pagedProjects = sortedProjects.slice(offset, offset + pageSize);

    return {
      projects: pagedProjects,
      total,
      page,
      pageSize,
    };
  }

  /**
   * Merge multiple stats objects
   */
  static mergeStats(statsList: DailyStats[]): DailyStats {
    if (statsList.length === 0) {
      return ModelCallStat.getEmptyStats();
    }

    const merged: DailyStats = ModelCallStat.getEmptyStats();

    statsList.forEach((stats) => {
      merged.totalUsage += stats.totalUsage;
      merged.totalCredits += stats.totalCredits;
      merged.totalCalls += stats.totalCalls;
      merged.successCalls += stats.successCalls;
      merged.totalDuration = (merged.totalDuration || 0) + (stats.totalDuration || 0);

      // Merge byType
      Object.keys(stats.byType).forEach((type) => {
        const callType = type as keyof DailyStats['byType'];
        const typeStats = stats.byType[callType];
        if (typeStats) {
          if (!merged.byType[callType]) {
            merged.byType[callType] = { totalUsage: 0, totalCredits: 0, totalCalls: 0, successCalls: 0 };
          }
          merged.byType[callType]!.totalUsage += typeStats.totalUsage;
          merged.byType[callType]!.totalCredits += typeStats.totalCredits;
          merged.byType[callType]!.totalCalls += typeStats.totalCalls;
          merged.byType[callType]!.successCalls += typeStats.successCalls;
        }
      });
    });

    // Calculate average duration
    if (merged.successCalls > 0 && merged.totalDuration) {
      merged.avgDuration = Math.round((merged.totalDuration / merged.successCalls) * 10) / 10;
    }

    return merged;
  }

  private static applyStatsAppDidCondition(whereClause: Record<string, any>, appDid?: string | null) {
    if (appDid === undefined) return;
    whereClause.appDid = appDid;
  }

  private static buildTimeRangeCondition(
    userDid: string | null | undefined,
    appDid: string | null | undefined,
    startTime: number,
    endTime: number
  ) {
    const whereConditions = ['"callTime" >= :startTime', '"callTime" <= :endTime'];
    const replacements: any = { startTime, endTime };
    if (userDid === null) {
      whereConditions.unshift('"userDid" IS NOT NULL');
    } else if (userDid !== undefined) {
      whereConditions.unshift('"userDid" = :userDid');
      replacements.userDid = userDid;
    }
    let whereClause = `WHERE ${whereConditions.join('\n        AND ')}`;

    if (appDid === null) {
      whereClause += ' AND "appDid" IS NULL';
    } else if (appDid !== undefined) {
      whereClause += ' AND "appDid" = :appDid';
      replacements.appDid = appDid;
    }

    return { whereClause, replacements };
  }

  static getEmptyStats(): DailyStats {
    return {
      totalUsage: 0,
      totalCredits: 0,
      totalCalls: 0,
      successCalls: 0,
      totalDuration: 0,
      avgDuration: 0,
      byType: {},
    };
  }

  private static async executeStatsQueries(
    userDid: string | null | undefined,
    appDid: string | null | undefined,
    startTime: number,
    endTime: number
  ): Promise<DailyStats> {
    const { whereClause, replacements } = this.buildTimeRangeCondition(userDid, appDid, startTime, endTime);

    const countQuery = `
      SELECT COUNT(*) as count
      FROM "ModelCalls"
      ${whereClause}
    `;

    const countResults = await sequelize.query(countQuery, {
      type: QueryTypes.SELECT,
      replacements,
    });

    const count = parseInt((countResults[0] as any)?.count || '0', 10);
    if (count === 0) {
      return this.getEmptyStats();
    }

    const totalQuery = `
      SELECT
        SUM("totalUsage") as "totalUsage",
        SUM("credits") as "totalCredits",
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls",
        SUM(CASE WHEN "status" = 'success' THEN "duration" ELSE 0 END) as "totalDuration",
        AVG(CASE WHEN "status" = 'success' THEN "duration" ELSE NULL END) as "avgDuration"
      FROM "ModelCalls"
      ${whereClause}
    `;

    const typeQuery = `
      SELECT
        "type",
        SUM("totalUsage") as "totalUsage",
        SUM("credits") as "totalCredits",
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls"
      FROM "ModelCalls"
      ${whereClause}
      GROUP BY "type"
    `;

    const [totalResults, typeResults] = await Promise.all([
      sequelize.query(totalQuery, {
        type: QueryTypes.SELECT,
        replacements,
      }) as Promise<any[]>,
      sequelize.query(typeQuery, {
        type: QueryTypes.SELECT,
        replacements,
      }) as Promise<any[]>,
    ]);

    const totalResult = totalResults[0] || {};
    const totalCredits = new BigNumber(totalResult.totalCredits || '0');
    const byType: DailyStats['byType'] = {};
    typeResults.forEach((result: any) => {
      const type = result.type as keyof DailyStats['byType'];
      const typeCredits = new BigNumber(result.totalCredits || '0');
      byType[type] = {
        totalUsage: parseInt(result.totalUsage || '0', 10),
        totalCredits: typeCredits.toNumber(),
        totalCalls: parseInt(result.totalCalls || '0', 10),
        successCalls: parseInt(result.successCalls || '0', 10),
      };
    });

    return {
      totalUsage: parseInt(totalResult.totalUsage || '0', 10),
      totalCredits: totalCredits.toNumber(),
      totalCalls: parseInt(totalResult.totalCalls || '0', 10),
      successCalls: parseInt(totalResult.successCalls || '0', 10),
      totalDuration: parseFloat(totalResult.totalDuration || '0'),
      avgDuration: Math.round(parseFloat(totalResult.avgDuration || '0') * 10) / 10,
      byType,
    };
  }

  /**
   * Get project stats directly without triggering cache population
   * Used for single project detail page where we only need totals, not daily breakdown
   */
  static async getProjectStats(
    userDid: string | null | undefined,
    appDid: string | null | undefined,
    startTime: number,
    endTime: number
  ): Promise<DailyStats> {
    return this.executeStatsQueries(userDid, appDid, startTime, endTime);
  }

  static async computeDailyStats(
    userDid: string | null,
    appDid: string | null | undefined,
    dayTimestamp: number
  ): Promise<DailyStats> {
    const startOfDay = dayTimestamp;
    const endOfDay = dayTimestamp + 86400 - 1; // 23:59:59 of the same day

    return this.executeStatsQueries(userDid, appDid, startOfDay, endOfDay);
  }

  static async computeHourlyStats(
    userDid: string | null,
    appDid: string | null | undefined,
    hourTimestamp: number
  ): Promise<DailyStats> {
    const startOfHour = hourTimestamp;
    const endOfHour = hourTimestamp + 3600 - 1; // 59:59 of the same hour

    return this.executeStatsQueries(userDid, appDid, startOfHour, endOfHour);
  }
}

ModelCallStat.init(ModelCallStat.GENESIS_ATTRIBUTES, {
  sequelize,
});
