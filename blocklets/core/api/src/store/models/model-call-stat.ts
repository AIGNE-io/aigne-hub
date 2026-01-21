import BigNumber from 'bignumber.js';
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Op, QueryTypes } from 'sequelize';

import nextId from '../../libs/next-id';
import { sequelize } from '../sequelize';
import { DailyStats } from './types';

export default class ModelCallStat extends Model<
  InferAttributes<ModelCallStat>,
  InferCreationAttributes<ModelCallStat>
> {
  declare id: CreationOptional<string>;

  declare userDid: string;

  declare appDid: CreationOptional<string | null>;

  declare modelId: CreationOptional<string | null>;

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
      allowNull: false,
    },
    appDid: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Project ID - null for user-level aggregation',
    },
    modelId: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Model ID - for quick model aggregation queries',
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
   * Get user-level hourly stats (appDid = null)
   */
  static async getHourlyStats(userDid: string, hourTimestamp: number): Promise<DailyStats> {
    return ModelCallStat.getHourlyStatsInternal(userDid, null, null, hourTimestamp);
  }

  /**
   * Get project-level hourly stats (appDid = specific value)
   */
  static async getHourlyStatsByApp(
    userDid: string,
    appDid: string,
    hourTimestamp: number
  ): Promise<DailyStats> {
    return ModelCallStat.getHourlyStatsInternal(userDid, appDid, null, hourTimestamp);
  }

  /**
   * Get model-level hourly stats
   */
  static async getHourlyStatsByModel(
    userDid: string,
    appDid: string | null,
    modelId: string,
    hourTimestamp: number
  ): Promise<DailyStats> {
    return ModelCallStat.getHourlyStatsInternal(userDid, appDid, modelId, hourTimestamp);
  }

  /**
   * Internal method: unified handling of user-level, project-level, and model-level aggregation
   */
  private static async getHourlyStatsInternal(
    userDid: string,
    appDid: string | null,
    modelId: string | null,
    hourTimestamp: number
  ): Promise<DailyStats> {
    // Part 1: Check if current hour - compute in real-time
    if (ModelCallStat.isCurrentHour(hourTimestamp)) {
      return ModelCallStat.computeHourlyStats(userDid, appDid, modelId, hourTimestamp);
    }

    // Part 2: Try to get existing stats
    const existingStat = await ModelCallStat.findExistingHourlyStats(userDid, appDid, modelId, hourTimestamp);
    if (existingStat) {
      return existingStat.stats;
    }

    // Part 3: Compute and save if not found
    return ModelCallStat.computeAndSaveHourlyStats(userDid, appDid, modelId, hourTimestamp);
  }

  private static isCurrentHour(hourTimestamp: number): boolean {
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;
    return hourTimestamp >= currentHour;
  }

  private static async findExistingHourlyStats(
    userDid: string,
    appDid: string | null,
    modelId: string | null,
    hourTimestamp: number
  ): Promise<ModelCallStat | null> {
    const whereClause: any = {
      userDid,
      timestamp: hourTimestamp,
      timeType: 'hour',
    };

    // Handle null values for appDid and modelId
    if (appDid === null) {
      whereClause.appDid = { [Op.is]: null };
    } else {
      whereClause.appDid = appDid;
    }

    if (modelId === null) {
      whereClause.modelId = { [Op.is]: null };
    } else {
      whereClause.modelId = modelId;
    }

    return ModelCallStat.findOne({ where: whereClause });
  }

  static async computeAndSaveHourlyStats(
    userDid: string,
    appDid: string | null,
    modelId: string | null,
    hourTimestamp: number
  ): Promise<DailyStats> {
    const stats = await ModelCallStat.computeHourlyStats(userDid, appDid, modelId, hourTimestamp);

    // Generate unique key including appDid and modelId
    const appPart = appDid ? `-${appDid}` : '';
    const modelPart = modelId ? `-${modelId}` : '';
    const hourKey = `${userDid}${appPart}${modelPart}-${hourTimestamp}`;

    try {
      await ModelCallStat.create({
        id: hourKey,
        userDid,
        appDid,
        modelId,
        timestamp: hourTimestamp,
        timeType: 'hour',
        stats,
      });
    } catch (error: any) {
      // Handle duplicate key error (race condition)
      if (error.name === 'SequelizeUniqueConstraintError') {
        const existing = await ModelCallStat.findExistingHourlyStats(userDid, appDid, modelId, hourTimestamp);
        if (existing) {
          return existing.stats;
        }
      }
      throw error;
    }

    return stats;
  }

  /**
   * Get aggregated stats for a time range (merging multiple hours)
   */
  static async getAggregatedStats(
    userDid: string,
    appDid: string | null,
    startTime: number,
    endTime: number
  ): Promise<DailyStats> {
    // Calculate hour range
    const startHour = Math.floor(startTime / 3600) * 3600;
    const endHour = Math.floor(endTime / 3600) * 3600;
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;

    // Build where clause for appDid
    const whereClause: any = {
      userDid,
      timestamp: { [Op.between]: [startHour, endHour] },
      timeType: 'hour',
      modelId: { [Op.is]: null }, // Only get aggregated stats, not model-level
    };

    if (appDid === null) {
      whereClause.appDid = { [Op.is]: null };
    } else {
      whereClause.appDid = appDid;
    }

    // Get all pre-aggregated hourly stats
    const hourlyStats = await ModelCallStat.findAll({
      where: whereClause,
      order: [['timestamp', 'ASC']],
    });

    const statsList: DailyStats[] = hourlyStats.map((s) => s.stats);

    // If time range includes current hour, compute it in real-time
    if (endHour >= currentHour) {
      const currentHourStats = await ModelCallStat.computeHourlyStats(userDid, appDid, null, currentHour);
      statsList.push(currentHourStats);
    }

    // Merge all hourly stats
    return ModelCallStat.mergeStats(statsList);
  }

  /**
   * Get trends data with specified granularity
   */
  static async getTrends(
    userDid: string,
    appDid: string | null,
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day' = 'day'
  ): Promise<Array<{ timestamp: number; stats: DailyStats }>> {
    const startHour = Math.floor(startTime / 3600) * 3600;
    const endHour = Math.floor(endTime / 3600) * 3600;
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;

    // Build where clause
    const whereClause: any = {
      userDid,
      timestamp: { [Op.between]: [startHour, endHour] },
      timeType: 'hour',
      modelId: { [Op.is]: null },
    };

    if (appDid === null) {
      whereClause.appDid = { [Op.is]: null };
    } else {
      whereClause.appDid = appDid;
    }

    const hourlyStats = await ModelCallStat.findAll({
      where: whereClause,
      order: [['timestamp', 'ASC']],
    });

    // If granularity is 'hour', return directly
    if (granularity === 'hour') {
      const result = hourlyStats.map((s) => ({
        timestamp: s.timestamp,
        stats: s.stats,
      }));

      // Add current hour if needed
      if (endHour >= currentHour) {
        const currentStats = await ModelCallStat.computeHourlyStats(userDid, appDid, null, currentHour);
        result.push({ timestamp: currentHour, stats: currentStats });
      }

      return result;
    }

    // For 'day' granularity, group by day
    const dayMap = new Map<number, DailyStats[]>();
    hourlyStats.forEach((s) => {
      const dayTimestamp = Math.floor(s.timestamp / 86400) * 86400;
      if (!dayMap.has(dayTimestamp)) {
        dayMap.set(dayTimestamp, []);
      }
      dayMap.get(dayTimestamp)!.push(s.stats);
    });

    // Add current hour to today if needed
    if (endHour >= currentHour) {
      const todayTimestamp = Math.floor(currentHour / 86400) * 86400;
      const currentStats = await ModelCallStat.computeHourlyStats(userDid, appDid, null, currentHour);
      if (!dayMap.has(todayTimestamp)) {
        dayMap.set(todayTimestamp, []);
      }
      dayMap.get(todayTimestamp)!.push(currentStats);
    }

    // Merge stats for each day
    return Array.from(dayMap.entries())
      .sort(([a], [b]) => a - b)
      .map(([timestamp, statsList]) => ({
        timestamp,
        stats: ModelCallStat.mergeStats(statsList),
      }));
  }

  /**
   * Get projects list with aggregated stats
   */
  static async getProjects(
    userDid: string,
    startTime: number,
    endTime: number
  ): Promise<Array<{ appDid: string; stats: DailyStats; lastCallTime: number }>> {
    const startHour = Math.floor(startTime / 3600) * 3600;
    const endHour = Math.floor(endTime / 3600) * 3600;

    // Get all unique appDids from ModelCalls in the time range
    const appsQuery = `
      SELECT DISTINCT "appDid", MAX("callTime") as "lastCallTime"
      FROM "ModelCalls"
      WHERE "userDid" = :userDid
        AND "callTime" >= :startTime
        AND "callTime" <= :endTime
        AND "appDid" IS NOT NULL
      GROUP BY "appDid"
    `;

    const apps = (await sequelize.query(appsQuery, {
      type: QueryTypes.SELECT,
      replacements: { userDid, startTime, endTime },
    })) as Array<{ appDid: string; lastCallTime: number }>;

    // Get aggregated stats for each app
    const result = await Promise.all(
      apps.map(async (app) => {
        const stats = await ModelCallStat.getAggregatedStats(userDid, app.appDid, startHour, endHour);
        return {
          appDid: app.appDid,
          stats,
          lastCallTime: app.lastCallTime,
        };
      })
    );

    return result;
  }

  /**
   * Get model distribution for a project
   */
  static async getModelDistribution(
    userDid: string,
    appDid: string,
    startTime: number,
    endTime: number
  ): Promise<Array<{ model: string; calls: number; percentage: number }>> {
    const query = `
      SELECT "model", COUNT(*) as "calls"
      FROM "ModelCalls"
      WHERE "userDid" = :userDid
        AND "appDid" = :appDid
        AND "callTime" >= :startTime
        AND "callTime" <= :endTime
      GROUP BY "model"
      ORDER BY "calls" DESC
    `;

    const results = (await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements: { userDid, appDid, startTime, endTime },
    })) as Array<{ model: string; calls: string }>;

    const totalCalls = results.reduce((sum, r) => sum + parseInt(r.calls, 10), 0);

    return results.map((r) => ({
      model: r.model,
      calls: parseInt(r.calls, 10),
      percentage: totalCalls > 0 ? (parseInt(r.calls, 10) / totalCalls) * 100 : 0,
    }));
  }

  /**
   * Merge multiple stats objects
   */
  static mergeStats(statsList: DailyStats[]): DailyStats {
    if (statsList.length === 0) {
      return ModelCallStat.getEmptyStats();
    }

    const merged: DailyStats = ModelCallStat.getEmptyStats();
    const allDurations: number[] = [];

    statsList.forEach((stats) => {
      merged.totalUsage += stats.totalUsage;
      merged.totalCredits += stats.totalCredits;
      merged.totalCalls += stats.totalCalls;
      merged.successCalls += stats.successCalls;
      merged.totalDuration = (merged.totalDuration || 0) + (stats.totalDuration || 0);

      // Collect duration buckets for P95 calculation
      if (stats.durationBuckets) {
        allDurations.push(...stats.durationBuckets);
      }

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
      merged.avgDuration = Math.round(merged.totalDuration / merged.successCalls);
    }

    // Calculate P95 from collected durations
    if (allDurations.length > 0) {
      allDurations.sort((a, b) => a - b);
      const p95Index = Math.floor(allDurations.length * 0.95);
      merged.p95Duration = allDurations[Math.min(p95Index, allDurations.length - 1)];
    }

    return merged;
  }

  private static buildTimeRangeCondition(
    userDid: string,
    appDid: string | null,
    modelId: string | null,
    startTime: number,
    endTime: number
  ) {
    let whereClause = `WHERE "userDid" = :userDid
        AND "callTime" >= :startTime
        AND "callTime" <= :endTime`;

    const replacements: any = { userDid, startTime, endTime };

    if (appDid !== null) {
      whereClause += ` AND "appDid" = :appDid`;
      replacements.appDid = appDid;
    }

    if (modelId !== null) {
      whereClause += ` AND "model" = :modelId`;
      replacements.modelId = modelId;
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
      p95Duration: 0,
      durationBuckets: [],
      byType: {},
    };
  }

  private static async executeStatsQueries(
    userDid: string,
    appDid: string | null,
    modelId: string | null,
    startTime: number,
    endTime: number
  ): Promise<DailyStats> {
    const { whereClause, replacements } = this.buildTimeRangeCondition(userDid, appDid, modelId, startTime, endTime);

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

    // Get durations for P95 calculation (limit to successful calls)
    const durationQuery = `
      SELECT "duration"
      FROM "ModelCalls"
      ${whereClause}
        AND "status" = 'success'
        AND "duration" IS NOT NULL
      ORDER BY "duration" ASC
    `;

    const [totalResults, typeResults, durationResults] = await Promise.all([
      sequelize.query(totalQuery, {
        type: QueryTypes.SELECT,
        replacements,
      }) as Promise<any[]>,
      sequelize.query(typeQuery, {
        type: QueryTypes.SELECT,
        replacements,
      }) as Promise<any[]>,
      sequelize.query(durationQuery, {
        type: QueryTypes.SELECT,
        replacements,
      }) as Promise<any[]>,
    ]);

    const totalResult = totalResults[0] || {};
    const totalCredits = new BigNumber(totalResult.totalCredits || '0');
    const durations = durationResults.map((r: any) => parseInt(r.duration || '0', 10)).filter((d) => d > 0);

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

    // Calculate P95
    let p95Duration = 0;
    if (durations.length > 0) {
      const p95Index = Math.floor(durations.length * 0.95);
      p95Duration = durations[Math.min(p95Index, durations.length - 1)];
    }

    return {
      totalUsage: parseInt(totalResult.totalUsage || '0', 10),
      totalCredits: totalCredits.toNumber(),
      totalCalls: parseInt(totalResult.totalCalls || '0', 10),
      successCalls: parseInt(totalResult.successCalls || '0', 10),
      totalDuration: parseInt(totalResult.totalDuration || '0', 10),
      avgDuration: Math.round(parseFloat(totalResult.avgDuration || '0')),
      p95Duration,
      durationBuckets: durations,
      byType,
    };
  }

  static async computeHourlyStats(
    userDid: string,
    appDid: string | null,
    modelId: string | null,
    hourTimestamp: number
  ): Promise<DailyStats> {
    const startOfHour = hourTimestamp;
    const endOfHour = hourTimestamp + 3600 - 1; // 59:59 of the same hour

    return this.executeStatsQueries(userDid, appDid, modelId, startOfHour, endOfHour);
  }
}

ModelCallStat.init(ModelCallStat.GENESIS_ATTRIBUTES, {
  sequelize,
});
