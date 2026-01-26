import BigNumber from 'bignumber.js';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Op,
  QueryTypes,
  col,
  fn,
  literal,
} from 'sequelize';

import nextId from '../../libs/next-id';
import { pushProjectFetchJob } from '../../queue/projects';
import { sequelize } from '../sequelize';
import ModelCall from './model-call';
import Project from './project';
import { DailyStats } from './types';

const SECONDS_PER_HOUR = 3600;
const SECONDS_PER_DAY = 86400;

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

  static async calcDailyStats(userDid: string, appDid: string, dayTimestamp: number): Promise<void> {
    // Check if today - compute in real-time without cache write
    const currentDay = Math.floor(Date.now() / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    if (dayTimestamp >= currentDay) {
      return;
    }

    const existingDayStat = await ModelCallStat.findOne({
      where: {
        userDid,
        appDid,
        timestamp: dayTimestamp,
        timeType: 'day',
      },
    });
    if (existingDayStat) {
      return;
    }

    const stats = await ModelCallStat.getStatsByCalls(
      userDid,
      appDid,
      dayTimestamp,
      dayTimestamp + SECONDS_PER_DAY - 1
    );

    // Generate unique key including appDid
    const dayKey = `${userDid}-${appDid}-day-${dayTimestamp}`;

    await ModelCallStat.upsert({
      id: dayKey,
      userDid,
      appDid,
      timestamp: dayTimestamp,
      timeType: 'day',
      stats,
    });
  }

  /**
   * Get trends for multiple projects in a single query (cache-first)
   * This avoids per-project loops and heavy realtime aggregation for missing stats.
   */
  static async getProjectTrends(
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

    const { bucketSize, startBucket, endBucket } = ModelCallStat.getBucketRange(startTime, endTime, granularity);
    const projectKeys = appDidList;

    if (granularity === 'hour') {
      return ModelCallStat.getProjectTrendsByCalls(userDid, appDidList, startTime, endTime, granularity);
    }

    const timeType = 'day';
    const whereClause: any = {
      timestamp: { [Op.between]: [startBucket, endBucket] },
      timeType,
    };

    if (userDid !== undefined) {
      whereClause.userDid = userDid === null ? { [Op.not]: null } : userDid;
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
      const projectKey = appDid;
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
    const currentBucket = Math.floor(Date.now() / 1000 / bucketSize) * bucketSize;
    const realtimeEndBucket = Math.floor(endTime / bucketSize) * bucketSize;
    const realtimeBuckets =
      realtimeEndBucket < currentBucket
        ? []
        : await ModelCallStat.getProjectTrendsByCalls(
            userDid,
            appDidList,
            currentBucket,
            Math.min(endTime, currentBucket + bucketSize - 1),
            granularity
          );

    realtimeBuckets.forEach(({ timestamp, byProject }) => {
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

    return ModelCallStat.buildProjectTrendBuckets(trendsByTimestamp, projectKeys, startBucket, endBucket, bucketSize);
  }

  static async getTrendGroupByProjects({
    userDid,
    startTime,
    endTime,
    granularity = 'day',
  }: {
    userDid: string | null | undefined;
    startTime: number;
    endTime: number;
    granularity?: 'hour' | 'day';
  }): Promise<{
    projects: Array<{
      appDid: string;
      appName?: string;
      appLogo?: string;
      appUrl?: string;
      lastCallTime: number;
    }>;
    trends: Array<{
      timestamp: number;
      byProject: Record<
        string,
        { totalUsage: number; totalCredits: number; totalCalls: number; successCalls: number; avgDuration: number }
      >;
    }>;
    granularity: 'hour' | 'day';
  }> {
    const appDids = await ModelCallStat.getProjectAppDidsInRange(userDid, startTime, endTime, granularity === 'day');
    if (appDids.length === 0) {
      return { projects: [], trends: [], granularity };
    }

    const overallLastCallMap = await ModelCallStat.fetchOverallLastCall(appDids, userDid);
    const sortedAppDids = appDids.sort((a, b) => (overallLastCallMap.get(b) ?? 0) - (overallLastCallMap.get(a) ?? 0));

    const projects = await Project.findAll({
      where: { appDid: { [Op.in]: sortedAppDids } },
    });
    const projectMap = new Map(projects.map((project) => [project.appDid, project]));

    const projectList = sortedAppDids.map((appDid) => {
      const project = projectMap.get(appDid);
      if (!project) {
        pushProjectFetchJob(appDid);
      }
      return {
        appDid,
        appName: project?.appName || appDid || undefined,
        appLogo: project?.appLogo || undefined,
        appUrl: project?.appUrl || undefined,
        lastCallTime: overallLastCallMap.get(appDid) ?? 0,
      };
    });

    const trendBuckets = await ModelCallStat.getProjectTrends(userDid, sortedAppDids, startTime, endTime, granularity);

    const trends = trendBuckets.map(({ timestamp, byProject }) => {
      const normalizedByProject: Record<
        string,
        { totalUsage: number; totalCredits: number; totalCalls: number; successCalls: number; avgDuration: number }
      > = {};

      Object.entries(byProject).forEach(([appDidKey, stats]) => {
        normalizedByProject[appDidKey] = {
          totalUsage: stats.totalUsage,
          totalCredits: stats.totalCredits,
          totalCalls: stats.totalCalls,
          successCalls: stats.successCalls,
          avgDuration: stats.avgDuration || 0,
        };
      });

      return { timestamp, byProject: normalizedByProject };
    });

    return { projects: projectList, trends, granularity };
  }

  private static async getGlobalTrendByCalls(
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day'
  ): Promise<Array<{ timestamp: number; stats: DailyStats }>> {
    const { bucketSize, startBucket, endBucket } = ModelCallStat.getBucketRange(startTime, endTime, granularity);
    const bucketExpr = literal(`FLOOR("callTime" / ${bucketSize}) * ${bucketSize}`);
    const rows = (await ModelCall.findAll({
      attributes: [
        [bucketExpr, 'timestamp'],
        [fn('SUM', col('totalUsage')), 'totalUsage'],
        [fn('SUM', col('credits')), 'totalCredits'],
        [fn('COUNT', col('id')), 'totalCalls'],
        [fn('SUM', literal('CASE WHEN "status" = \'success\' THEN 1 ELSE 0 END')), 'successCalls'],
        [fn('SUM', literal('CASE WHEN "status" = \'success\' THEN "duration" ELSE 0 END')), 'totalDuration'],
        [fn('AVG', literal('CASE WHEN "status" = \'success\' THEN "duration" ELSE NULL END')), 'avgDuration'],
      ],
      where: {
        callTime: { [Op.between]: [startTime, endTime] },
      },
      group: [bucketExpr as any],
      order: [[bucketExpr, 'ASC']],
      raw: true,
    })) as unknown as Array<{
      timestamp: number | string;
      totalUsage: string | number;
      totalCredits: string | number;
      totalCalls: string | number;
      successCalls: string | number;
      totalDuration: string | number;
      avgDuration: string | number;
    }>;

    const statsMap = new Map<number, DailyStats>();
    rows.forEach((row) => {
      const timestamp = Number(row.timestamp);
      if (!Number.isFinite(timestamp)) return;
      statsMap.set(timestamp, ModelCallStat.buildStatsFromAggregateRow(row));
    });

    return ModelCallStat.buildStatsSeries(statsMap, startBucket, endBucket, bucketSize);
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

  private static async getProjectTrendsByCalls(
    userDid: string | null | undefined,
    appDids: string[],
    startTime: number,
    endTime: number,
    granularity: 'hour' | 'day'
  ): Promise<Array<{ timestamp: number; byProject: Record<string, DailyStats> }>> {
    if (!appDids.length) return [];

    const { bucketSize, startBucket, endBucket } = ModelCallStat.getBucketRange(startTime, endTime, granularity);
    const appDidList = appDids;

    const whereClause: any = {
      callTime: { [Op.between]: [startTime, endTime] },
    };
    if (userDid !== undefined) {
      whereClause.userDid = userDid === null ? { [Op.not]: null } : userDid;
    }

    if (appDidList.length) {
      whereClause.appDid = { [Op.in]: appDidList };
    }
    const bucketExpr = literal(`FLOOR("callTime" / ${bucketSize}) * ${bucketSize}`);
    const rows = (await ModelCall.findAll({
      attributes: [
        [bucketExpr, 'timestamp'],
        'appDid',
        [fn('SUM', col('totalUsage')), 'totalUsage'],
        [fn('SUM', col('credits')), 'totalCredits'],
        [fn('COUNT', col('id')), 'totalCalls'],
        [fn('SUM', literal('CASE WHEN "status" = \'success\' THEN 1 ELSE 0 END')), 'successCalls'],
        [fn('SUM', literal('CASE WHEN "status" = \'success\' THEN "duration" ELSE 0 END')), 'totalDuration'],
        [fn('AVG', literal('CASE WHEN "status" = \'success\' THEN "duration" ELSE NULL END')), 'avgDuration'],
      ],
      where: whereClause,
      group: [bucketExpr as any, 'appDid'],
      order: [[bucketExpr, 'ASC']],
      raw: true,
    })) as unknown as Array<{
      timestamp: number | string;
      appDid: string | null;
      totalUsage: string | number;
      totalCredits: string | number;
      totalCalls: string | number;
      successCalls: string | number;
      totalDuration: string | number;
      avgDuration: string | number;
    }>;

    const result = new Map<number, Record<string, DailyStats>>();
    rows.forEach((row) => {
      const timestamp = Number(row.timestamp);
      if (!Number.isFinite(timestamp)) return;
      const { appDid } = row;
      if (!appDid) return;
      const projectKey = appDid;
      const stats = ModelCallStat.buildStatsFromAggregateRow(row);

      if (!result.has(timestamp)) {
        result.set(timestamp, {});
      }
      result.get(timestamp)![projectKey] = stats;
    });

    return ModelCallStat.buildProjectTrendBuckets(result, appDidList, startBucket, endBucket, bucketSize);
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
      return ModelCallStat.getGlobalTrendByCalls(startTime, endTime, granularity);
    }

    const { bucketSize, startBucket, endBucket } = ModelCallStat.getBucketRange(startTime, endTime, 'day');
    const timeType = 'day';
    const currentDay = Math.floor(Date.now() / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    const statsEnd = Math.min(endBucket, currentDay - SECONDS_PER_DAY);

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
      const realtimeEnd = Math.min(endTime, currentDay + SECONDS_PER_DAY - 1);
      const realtime = await ModelCallStat.getGlobalTrendByCalls(currentDay, realtimeEnd, 'day');
      realtime.forEach((entry) => {
        const existing = statsMap.get(entry.timestamp);
        if (existing) {
          statsMap.set(entry.timestamp, ModelCallStat.mergeTrendStats(existing, entry.stats));
        } else {
          statsMap.set(entry.timestamp, entry.stats);
        }
      });
    }

    return ModelCallStat.buildStatsSeries(statsMap, startBucket, endBucket, bucketSize);
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
      sortBy?: 'totalCalls' | 'totalCredits';
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
    const currentDay = Math.floor(Date.now() / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    const statsStart = Math.floor(startTime / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    const statsEnd = Math.min(Math.floor(endTime / SECONDS_PER_DAY) * SECONDS_PER_DAY, currentDay - SECONDS_PER_DAY);
    const statsByApp = new Map<string, DailyStats>();

    if (statsStart <= statsEnd) {
      const whereConditions: string[] = [
        '"timeType" = :timeType',
        '"timestamp" >= :statsStart',
        '"timestamp" <= :statsEnd',
        '"appDid" IS NOT NULL',
      ];
      const replacements: Record<string, any> = {
        timeType: 'day',
        statsStart,
        statsEnd,
      };

      // Admin query: aggregate across per-user stats only (exclude global aggregates)
      // User query: filter by specific userDid
      if (userDid !== undefined) {
        if (userDid === null) {
          whereConditions.push('"userDid" IS NOT NULL');
        } else {
          whereConditions.push('"userDid" = :userDid');
          replacements.userDid = userDid;
        }
      }

      const query = `
        SELECT
          "appDid" as "appDid",
          SUM(COALESCE(CAST(json_extract("stats",'$.totalUsage') AS INTEGER), 0)) as "totalUsage",
          SUM(COALESCE(CAST(json_extract("stats",'$.totalCredits') AS REAL), 0)) as "totalCredits",
          SUM(COALESCE(CAST(json_extract("stats",'$.totalCalls') AS INTEGER), 0)) as "totalCalls",
          SUM(COALESCE(CAST(json_extract("stats",'$.successCalls') AS INTEGER), 0)) as "successCalls",
          SUM(COALESCE(CAST(json_extract("stats",'$.totalDuration') AS REAL), 0)) as "totalDuration"
        FROM "ModelCallStats"
        WHERE ${whereConditions.join(' AND ')}
        GROUP BY "appDid"
      `;

      const rows = (await sequelize.query(query, {
        type: QueryTypes.SELECT,
        replacements,
      })) as Array<{
        appDid: string | null;
        totalUsage: string | number;
        totalCredits: string | number;
        totalCalls: string | number;
        successCalls: string | number;
        totalDuration: string | number;
      }>;

      rows.forEach((row) => {
        const { appDid } = row;
        if (!appDid) return;
        statsByApp.set(appDid, ModelCallStat.buildStatsFromAggregateRow(row));
      });
    }

    if (endTime >= currentDay) {
      const currentStart = Math.max(startTime, currentDay);
      const currentEnd = Math.min(endTime, currentDay + SECONDS_PER_DAY - 1);
      const whereClause: any = {
        callTime: { [Op.between]: [currentStart, currentEnd] },
      };
      if (userDid !== undefined) {
        whereClause.userDid = userDid === null ? { [Op.not]: null } : userDid;
      }

      const rows = (await ModelCall.findAll({
        attributes: [
          'appDid',
          [fn('COUNT', col('id')), 'totalCalls'],
          [fn('SUM', col('credits')), 'totalCredits'],
          [fn('SUM', col('totalUsage')), 'totalUsage'],
          [fn('SUM', literal('CASE WHEN "status" = \'success\' THEN 1 ELSE 0 END')), 'successCalls'],
          [fn('SUM', literal('CASE WHEN "status" = \'success\' THEN "duration" ELSE 0 END')), 'totalDuration'],
          [fn('AVG', literal('CASE WHEN "status" = \'success\' THEN "duration" ELSE NULL END')), 'avgDuration'],
          [fn('MAX', col('callTime')), 'lastCallTime'],
        ],
        where: whereClause,
        group: ['appDid'],
        raw: true,
      })) as unknown as Array<{
        appDid: string | null;
        totalCalls: string;
        totalCredits: string;
        totalUsage: string;
        successCalls: string;
        totalDuration: string;
        avgDuration: string;
        lastCallTime: number;
      }>;

      rows.forEach((row) => {
        const { appDid } = row;
        if (!appDid) return;
        const target = statsByApp.get(appDid) || ModelCallStat.getEmptyStats();
        const realtimeStats = ModelCallStat.buildStatsFromAggregateRow(row);
        statsByApp.set(appDid, ModelCallStat.mergeTrendStats(target, realtimeStats));
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
        lastCallTime: 0,
      };
    });

    const sortedProjects = projectList.sort((a, b) => {
      const aValue = sortBy === 'totalCredits' ? a.stats.totalCredits : a.stats.totalCalls;
      const bValue = sortBy === 'totalCredits' ? b.stats.totalCredits : b.stats.totalCalls;
      return orderDirection === 'ASC' ? aValue - bValue : bValue - aValue;
    });

    const total = sortedProjects.length;
    const offset = (page - 1) * pageSize;
    const pagedProjects = sortedProjects.slice(offset, offset + pageSize);

    const pageAppDids = pagedProjects.map((project) => project.appDid).filter(Boolean) as string[];
    const overallMap = await ModelCallStat.fetchOverallLastCall(pageAppDids, userDid);
    if (overallMap.size > 0) {
      pagedProjects.forEach((project) => {
        if (!project.appDid) return;
        const overallLastCall = overallMap.get(project.appDid);
        if (overallLastCall !== undefined) {
          project.lastCallTime = overallLastCall;
        }
      });
    }

    return {
      projects: pagedProjects,
      total,
      page,
      pageSize,
    };
  }

  static async fetchOverallLastCall(appDids: string[], userDid: string | null | undefined) {
    if (!appDids.length) return new Map<string, number>();
    const whereClause: any = { appDid: { [Op.in]: appDids } };
    if (userDid !== undefined) {
      whereClause.userDid = userDid === null ? { [Op.not]: null } : userDid;
    }

    const overallRows = (await ModelCall.findAll({
      attributes: ['appDid', [fn('MAX', col('callTime')), 'lastCallTime']],
      where: whereClause,
      group: ['appDid'],
      raw: true,
    })) as unknown as Array<{ appDid: string | null; lastCallTime: number | string | null }>;

    const overallMap = new Map<string, number>();
    overallRows.forEach((row) => {
      if (!row.appDid) return;
      const lastCallTime = Number(row.lastCallTime || 0);
      if (Number.isFinite(lastCallTime) && lastCallTime > 0) {
        overallMap.set(row.appDid, lastCallTime);
      }
    });

    return overallMap;
  }

  private static async getProjectAppDidsInRange(
    userDid: string | null | undefined,
    startTime: number,
    endTime: number,
    includeDailyStats: boolean
  ): Promise<string[]> {
    const queryByCallsRange = async (rangeStart: number, rangeEnd: number) => {
      const whereClause: any = {
        callTime: { [Op.between]: [rangeStart, rangeEnd] },
      };
      if (userDid !== undefined) {
        whereClause.userDid = userDid === null ? { [Op.not]: null } : userDid;
      }

      const rows = (await ModelCall.findAll({
        attributes: ['appDid'],
        where: whereClause,
        group: ['appDid'],
        raw: true,
      })) as Array<{ appDid: string | null }>;

      return rows.map((row) => row.appDid).filter((appDid): appDid is string => !!appDid && appDid.length > 0);
    };

    if (!includeDailyStats) {
      return Array.from(new Set(await queryByCallsRange(startTime, endTime)));
    }

    const startBucket = Math.floor(startTime / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    const endBucket = Math.floor(endTime / SECONDS_PER_DAY) * SECONDS_PER_DAY;
    const currentDay = Math.floor(Date.now() / 1000 / SECONDS_PER_DAY) * SECONDS_PER_DAY;

    const statsWhere: any = {
      timeType: 'day',
      timestamp: { [Op.between]: [startBucket, endBucket] },
    };
    if (userDid !== undefined) {
      statsWhere.userDid = userDid === null ? { [Op.not]: null } : userDid;
    }

    const statsRows = (await ModelCallStat.findAll({
      attributes: ['appDid'],
      where: statsWhere,
      group: ['appDid'],
      raw: true,
    })) as Array<{ appDid: string | null }>;

    const statsAppDids = statsRows
      .map((row) => row.appDid)
      .filter((appDid): appDid is string => !!appDid && appDid.length > 0);

    const realtimeAppDids: string[] = [];
    if (endTime >= currentDay) {
      const realtimeStart = Math.max(startTime, currentDay);
      const realtimeEnd = endTime;
      realtimeAppDids.push(...(await queryByCallsRange(realtimeStart, realtimeEnd)));
    }

    return Array.from(new Set([...statsAppDids, ...realtimeAppDids]));
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

  static async getStatsByCalls(
    userDid: string | null | undefined,
    appDid: string | null | undefined,
    startTime: number,
    endTime: number
  ): Promise<DailyStats> {
    const whereClause: any = {
      callTime: { [Op.between]: [startTime, endTime] },
    };
    if (userDid !== undefined) {
      whereClause.userDid = userDid === null ? { [Op.not]: null } : userDid;
    }
    if (appDid === null) {
      whereClause.appDid = { [Op.is]: null };
    } else if (appDid !== undefined) {
      whereClause.appDid = appDid;
    }

    const totalRows = (await ModelCall.findAll({
      attributes: [
        [fn('SUM', col('totalUsage')), 'totalUsage'],
        [fn('SUM', col('credits')), 'totalCredits'],
        [fn('COUNT', col('id')), 'totalCalls'],
        [fn('SUM', literal('CASE WHEN "status" = \'success\' THEN 1 ELSE 0 END')), 'successCalls'],
        [fn('SUM', literal('CASE WHEN "status" = \'success\' THEN "duration" ELSE 0 END')), 'totalDuration'],
        [fn('AVG', literal('CASE WHEN "status" = \'success\' THEN "duration" ELSE NULL END')), 'avgDuration'],
      ],
      where: whereClause,
      raw: true,
    })) as any[];

    const totalRow = totalRows[0] || {};
    return ModelCallStat.buildStatsFromAggregateRow(totalRow);
  }

  private static getBucketRange(startTime: number, endTime: number, granularity: 'hour' | 'day') {
    const bucketSize = granularity === 'hour' ? SECONDS_PER_HOUR : SECONDS_PER_DAY;
    return {
      bucketSize,
      startBucket: Math.floor(startTime / bucketSize) * bucketSize,
      endBucket: Math.floor(endTime / bucketSize) * bucketSize,
    };
  }

  private static buildStatsFromAggregateRow(row: {
    totalUsage?: string | number;
    totalCredits?: string | number;
    totalCalls?: string | number;
    successCalls?: string | number;
    totalDuration?: string | number;
    avgDuration?: string | number;
  }): DailyStats {
    const totalUsage = parseInt(String(row.totalUsage ?? '0'), 10);
    const totalCredits = new BigNumber(row.totalCredits || '0').toNumber();
    const totalCalls = parseInt(String(row.totalCalls ?? '0'), 10);
    const successCalls = parseInt(String(row.successCalls ?? '0'), 10);
    const totalDuration = row.totalDuration === undefined ? 0 : parseFloat(String(row.totalDuration ?? '0'));

    let avgDuration = 0;
    if (row.avgDuration !== undefined && row.avgDuration !== null) {
      avgDuration = Math.round(parseFloat(String(row.avgDuration ?? '0')) * 10) / 10;
    } else if (successCalls > 0 && totalDuration) {
      avgDuration = Math.round((totalDuration / successCalls) * 10) / 10;
    }

    return {
      totalUsage,
      totalCredits,
      totalCalls,
      successCalls,
      totalDuration,
      avgDuration,
      byType: {},
    };
  }

  private static buildProjectTrendBuckets(
    trendsByTimestamp: Map<number, Record<string, DailyStats>>,
    projectKeys: string[],
    startBucket: number,
    endBucket: number,
    bucketSize: number
  ): Array<{ timestamp: number; byProject: Record<string, DailyStats> }> {
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

  private static buildStatsSeries(
    statsMap: Map<number, DailyStats>,
    startBucket: number,
    endBucket: number,
    bucketSize: number
  ): Array<{ timestamp: number; stats: DailyStats }> {
    const result: Array<{ timestamp: number; stats: DailyStats }> = [];
    for (let bucket = startBucket; bucket <= endBucket; bucket += bucketSize) {
      result.push({
        timestamp: bucket,
        stats: statsMap.get(bucket) || ModelCallStat.getEmptyStats(),
      });
    }
    return result;
  }
}

ModelCallStat.init(ModelCallStat.GENESIS_ATTRIBUTES, {
  sequelize,
});
