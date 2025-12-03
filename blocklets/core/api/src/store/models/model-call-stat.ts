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

import nextId from '../../libs/next-id';
import { getDateUnixTimestamp } from '../../libs/timestamp';
import { sequelize } from '../sequelize';
import { DailyStats } from './types';

export default class ModelCallStat extends Model<
  InferAttributes<ModelCallStat>,
  InferCreationAttributes<ModelCallStat>
> {
  declare id: CreationOptional<string>;

  declare userDid: string;

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

  static async getHourlyStats(userDid: string, hourTimestamp: number): Promise<DailyStats> {
    // Part 1: Check if current hour - compute in real-time
    if (ModelCallStat.isCurrentHour(hourTimestamp)) {
      return ModelCallStat.computeHourlyStats(userDid, hourTimestamp);
    }

    // Part 2: Try to get existing stats
    const existingStat = await ModelCallStat.findExistingHourlyStats(userDid, hourTimestamp);
    if (existingStat) {
      return existingStat.stats;
    }

    // Part 3: Compute and save if not found
    return ModelCallStat.computeAndSaveHourlyStats(userDid, hourTimestamp);
  }

  private static isCurrentHour(hourTimestamp: number): boolean {
    const currentHour = Math.floor(Date.now() / 1000 / 3600) * 3600;
    return hourTimestamp >= currentHour;
  }

  private static async findExistingHourlyStats(userDid: string, hourTimestamp: number): Promise<ModelCallStat | null> {
    return ModelCallStat.findOne({
      where: {
        userDid,
        timestamp: hourTimestamp,
        timeType: 'hour',
      },
    });
  }

  static async computeAndSaveHourlyStats(userDid: string, hourTimestamp: number): Promise<DailyStats> {
    const stats = await ModelCallStat.computeHourlyStats(userDid, hourTimestamp);

    const hourKey = `${userDid}-${hourTimestamp}`;
    await ModelCallStat.create({
      id: hourKey,
      userDid,
      timestamp: hourTimestamp,
      timeType: 'hour',
      stats,
    });

    return stats;
  }

  private static buildTimeRangeCondition(userDid: string, startTime: number, endTime: number) {
    const whereClause = `WHERE "userDid" = :userDid
        AND "callTime" >= :startTime
        AND "callTime" <= :endTime`;
    const replacements = { userDid, startTime, endTime };
    return { whereClause, replacements };
  }

  private static getEmptyStats(): DailyStats {
    return {
      totalUsage: 0,
      totalCredits: 0,
      totalCalls: 0,
      successCalls: 0,
      byType: {},
    };
  }

  private static async executeStatsQueries(userDid: string, startTime: number, endTime: number): Promise<DailyStats> {
    const { whereClause, replacements } = this.buildTimeRangeCondition(userDid, startTime, endTime);

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
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls"
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
      byType,
    };
  }

  static async computeHourlyStats(userDid: string, hourTimestamp: number): Promise<DailyStats> {
    const startOfHour = hourTimestamp;
    const endOfHour = hourTimestamp + 3600 - 1; // 59:59 of the same hour

    return this.executeStatsQueries(userDid, startOfHour, endOfHour);
  }
}

ModelCallStat.init(ModelCallStat.GENESIS_ATTRIBUTES, {
  sequelize,
});
