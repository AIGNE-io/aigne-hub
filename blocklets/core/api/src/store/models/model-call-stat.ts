import BigNumber from 'bignumber.js';
import pAll from 'p-all';
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Op,
  QueryTypes,
} from 'sequelize';
import { Worker } from 'snowflake-uuid';

import { getCurrentUnixTimestamp, getDateUnixTimestamp, getTodayString } from '../../libs/timestamp';
import { sequelize } from '../sequelize';
import { DailyStats } from './types';
import { generateCacheKey } from './utils';

const idGenerator = new Worker();
const nextId = () => idGenerator.nextId().toString();

export default class ModelCallStat extends Model<
  InferAttributes<ModelCallStat>,
  InferCreationAttributes<ModelCallStat>
> {
  declare id: CreationOptional<string>;

  declare userDid: string;

  declare timestamp: number;

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
    timestamp: {
      type: DataTypes.INTEGER,
      allowNull: false,
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

  static async getDailyStats(userDid: string, date: string): Promise<DailyStats> {
    // 使用 Unix 时间戳，简单高效
    const today = getTodayString();

    if (date === today) {
      return ModelCallStat.computeDailyStats(userDid, date);
    }

    // Convert date string to Unix timestamp (start of day UTC)
    const dateTimestamp = getDateUnixTimestamp(date);

    // 1. try to get existing stats
    const existingStat = await ModelCallStat.findOne({
      where: {
        userDid,
        timestamp: dateTimestamp,
      },
    });

    if (existingStat) {
      return existingStat.stats;
    }

    // 2. compute and save if not found
    const stats = await ModelCallStat.computeDailyStats(userDid, date);

    // 3. create stat record
    await ModelCallStat.create({
      id: generateCacheKey(userDid, date),
      userDid,
      timestamp: dateTimestamp,
      stats,
    });

    return stats;
  }

  static async computeDailyStats(userDid: string, date: string): Promise<DailyStats> {
    const startOfDay = Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000);
    const endOfDay = Math.floor(new Date(`${date}T23:59:59.999Z`).getTime() / 1000);

    // 查询总计数据
    const totalQuery = `
      SELECT 
        SUM("totalUsage") as "totalUsage",
        SUM("credits") as "totalCredits", 
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls"
      FROM "ModelCalls"
      WHERE "userDid" = :userDid 
        AND "callTime" >= :startOfDay 
        AND "callTime" <= :endOfDay
    `;

    // 查询按类型分组的数据
    const typeQuery = `
      SELECT 
        "type",
        SUM("totalUsage") as "totalUsage",
        SUM("credits") as "totalCredits", 
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls"
      FROM "ModelCalls"
      WHERE "userDid" = :userDid 
        AND "callTime" >= :startOfDay 
        AND "callTime" <= :endOfDay
        AND "type" IN ('chatCompletion', 'embedding', 'imageGeneration')
      GROUP BY "type"
    `;

    const [totalResults, typeResults] = await Promise.all([
      sequelize.query(totalQuery, {
        type: QueryTypes.SELECT,
        replacements: { userDid, startOfDay, endOfDay },
      }) as Promise<any[]>,
      sequelize.query(typeQuery, {
        type: QueryTypes.SELECT,
        replacements: { userDid, startOfDay, endOfDay },
      }) as Promise<any[]>,
    ]);

    const totalResult = totalResults[0] || {};

    // 使用 BigNumber 进行精确计算
    const totalCredits = new BigNumber(totalResult.totalCredits || '0');

    // 构建按类型的统计数据
    const byType: DailyStats['byType'] = {};
    typeResults.forEach((result: any) => {
      const type = result.type as keyof DailyStats['byType'];
      if (type === 'chatCompletion' || type === 'embedding' || type === 'imageGeneration') {
        const typeCredits = new BigNumber(result.totalCredits || '0');
        byType[type] = {
          totalUsage: parseInt(result.totalUsage || '0', 10),
          totalCredits: typeCredits.toNumber(),
          totalCalls: parseInt(result.totalCalls || '0', 10),
          successCalls: parseInt(result.successCalls || '0', 10),
        };
      }
    });

    return {
      totalUsage: parseInt(totalResult.totalUsage || '0', 10),
      totalCredits: totalCredits.toNumber(),
      totalCalls: parseInt(totalResult.totalCalls || '0', 10),
      successCalls: parseInt(totalResult.successCalls || '0', 10),
      byType,
    };
  }

  static async invalidateStats(userDid: string, date: string): Promise<void> {
    const dateTimestamp = getDateUnixTimestamp(date);
    await ModelCallStat.destroy({
      where: {
        userDid,
        timestamp: dateTimestamp,
      },
    });
  }

  static async invalidateTodayStats(userDid: string): Promise<void> {
    const today = getTodayString();
    await ModelCallStat.invalidateStats(userDid, today);
  }

  private static createPrecomputeTasks(userDid: string, dates: string[]) {
    return dates.map((date) => async () => {
      try {
        const dateTimestamp = getDateUnixTimestamp(date);

        // 检查是否已存在统计数据
        const existingStat = await ModelCallStat.findOne({
          where: { userDid, timestamp: dateTimestamp },
        });

        const stats = await ModelCallStat.computeDailyStats(userDid, date);

        if (existingStat) {
          // 更新现有统计
          await existingStat.update({ stats });
        } else {
          // 创建新统计
          await ModelCallStat.create({
            id: generateCacheKey(userDid, date),
            userDid,
            timestamp: dateTimestamp,
            stats,
          });
        }
      } catch (error) {
        console.warn(`Failed to precompute stats for ${userDid}:${date}`, error);
      }
    });
  }

  static async precomputeStats(userDid: string, days = 30): Promise<void> {
    const dates: string[] = [];
    const current = new Date();

    for (let i = 0; i < days; i++) {
      const date = new Date(current);
      date.setDate(current.getDate() - i);
      dates.push(date.toISOString().split('T')[0]!);
    }

    const tasks = ModelCallStat.createPrecomputeTasks(userDid, dates);
    await pAll(tasks, { concurrency: 3 });
  }

  static async precomputeForQuery(userDid: string, startTime: Date, endTime: Date): Promise<void> {
    const dates = ModelCallStat.generateDateRange(startTime, endTime);
    const tasks = ModelCallStat.createPrecomputeTasks(userDid, dates);
    await pAll(tasks, { concurrency: 3 });
  }

  static async scheduledPrecompute(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0]!;
    const yesterdayTimestamp = getDateUnixTimestamp(yesterdayStr);

    const activeUsers = (await sequelize.query(
      `
      SELECT DISTINCT "userDid" 
      FROM "ModelCalls" 
      WHERE "callTime" >= :sevenDaysAgo
    `,
      {
        type: QueryTypes.SELECT,
        replacements: {
          sevenDaysAgo: getCurrentUnixTimestamp() - 7 * 24 * 60 * 60,
        },
      }
    )) as any[];

    const tasks = activeUsers.map((user) => async () => {
      try {
        const stats = await ModelCallStat.computeDailyStats(user.userDid, yesterdayStr);
        await ModelCallStat.create({
          id: generateCacheKey(user.userDid, yesterdayStr),
          userDid: user.userDid,
          timestamp: yesterdayTimestamp,
          stats,
        });
      } catch (error) {
        console.warn(`Failed to precompute yesterday stats for ${user.userDid}`, error);
      }
    });

    await pAll(tasks, { concurrency: 5 });
  }

  static generateDateRange(startDate: Date, endDate: Date): string[] {
    const dates: string[] = [];
    const current = new Date(startDate);

    while (current <= endDate) {
      dates.push(current.toISOString().split('T')[0]!);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }

  static async cleanupOldStats(daysToKeep = 90): Promise<void> {
    const cutoffTimestamp = getCurrentUnixTimestamp() - daysToKeep * 24 * 60 * 60;

    await ModelCallStat.destroy({
      where: {
        timestamp: {
          [Op.lt]: cutoffTimestamp,
        },
      },
    });
  }
}

ModelCallStat.init(ModelCallStat.GENESIS_ATTRIBUTES, {
  sequelize,
});
