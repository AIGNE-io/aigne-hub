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
import { Worker } from 'snowflake-uuid';

import { getDateUnixTimestamp, getTodayString } from '../../libs/timestamp';
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
    const today = getTodayString();

    if (date === today) {
      return ModelCallStat.computeDailyStats(userDid, date);
    }

    // Convert date string to Unix timestamp range (start and end of day UTC)
    const startOfDay = getDateUnixTimestamp(date);
    const endOfDay = startOfDay + 24 * 60 * 60 - 2; // 23:59:59 of the same day

    // 1. try to get existing stats within the day range
    const existingStat = await ModelCallStat.findOne({
      where: {
        userDid,
        timestamp: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay,
        },
      },
    });

    if (existingStat) {
      return existingStat.stats;
    }

    // 2. compute and save if not found
    const stats = await ModelCallStat.computeDailyStats(userDid, date);

    // 3. create stat record with start of day timestamp for consistency
    await ModelCallStat.create({
      id: generateCacheKey(userDid, date),
      userDid,
      timestamp: startOfDay,
      stats,
    });

    return stats;
  }

  static async computeDailyStats(userDid: string, date: string): Promise<DailyStats> {
    const startOfDay = Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000);
    const endOfDay = Math.floor(new Date(`${date}T23:59:59.999Z`).getTime() / 1000);

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

    const totalCredits = new BigNumber(totalResult.totalCredits || '0');

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
    const startOfDay = getDateUnixTimestamp(date);
    const endOfDay = startOfDay + 24 * 60 * 60 - 1; // 23:59:59 of the same day

    await ModelCallStat.destroy({
      where: {
        userDid,
        timestamp: {
          [Op.gte]: startOfDay,
          [Op.lte]: endOfDay,
        },
      },
    });
  }
}

ModelCallStat.init(ModelCallStat.GENESIS_ATTRIBUTES, {
  sequelize,
});
