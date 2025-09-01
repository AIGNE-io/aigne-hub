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

import { getCurrentUnixTimestamp } from '../../libs/timestamp';
import { sequelize } from '../sequelize';
import AiProvider from './ai-provider';
import { CallStatus, CallType, UsageMetrics } from './types';

const idGenerator = new Worker();
const nextId = () => idGenerator.nextId().toString();

export default class ModelCall extends Model<InferAttributes<ModelCall>, InferCreationAttributes<ModelCall>> {
  declare id: CreationOptional<string>;

  declare providerId: string;

  declare model: string;

  declare credentialId: string;

  declare type: CallType;

  declare totalUsage: number;

  declare usageMetrics?: UsageMetrics;

  declare credits: number;

  declare status: CallStatus;

  declare duration?: number;

  declare errorReason?: string;

  declare appDid?: string;

  declare userDid: string;

  declare requestId?: string;

  declare metadata?: Record<string, any>;

  declare callTime: CreationOptional<number>;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;

  public static readonly GENESIS_ATTRIBUTES = {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      defaultValue: nextId,
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    model: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    credentialId: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    type: {
      type: DataTypes.ENUM(
        'chatCompletion',
        'embedding',
        'imageGeneration',
        'audioGeneration',
        'videoGeneration',
        'custom'
      ),
      allowNull: false,
      defaultValue: 'chatCompletion',
    },
    totalUsage: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    usageMetrics: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    credits: {
      type: DataTypes.DECIMAL(20, 8),
      allowNull: false,
      defaultValue: 0,
    },
    status: {
      type: DataTypes.ENUM('processing', 'success', 'failed'),
      allowNull: false,
      defaultValue: 'processing',
    },
    duration: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    errorReason: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    appDid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    userDid: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    requestId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    metadata: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    callTime: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: getCurrentUnixTimestamp,
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

  static async getCallsByDateRange({
    userDid,
    startTime,
    endTime,
    limit = 100,
    offset = 0,
    search,
    status,
    model,
    providerId,
    appDid,
  }: {
    userDid?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
    search?: string;
    status?: 'success' | 'failed' | 'all';
    model?: string;
    providerId?: string;
    appDid?: string;
  }): Promise<{
    count: number;
    list: (ModelCall & { provider?: AiProvider })[];
  }> {
    const whereClause: any = {};

    if (userDid) {
      whereClause.userDid = userDid;
    }

    if (appDid) {
      whereClause.appDid = appDid;
    }

    if (startTime || endTime) {
      whereClause.callTime = {};
      if (startTime) whereClause.callTime[Op.gte] = Number(startTime);
      if (endTime) whereClause.callTime[Op.lte] = Number(endTime);
    }

    if (status && status !== 'all') {
      whereClause.status = status;
    }

    if (model) {
      whereClause.model = { [Op.like]: `%${model}%` };
    }

    if (providerId) {
      whereClause.providerId = providerId;
    }

    if (search) {
      whereClause[Op.or] = [{ model: { [Op.like]: `%${search}%` } }, { appDid: { [Op.like]: `%${search}%` } }];
    }

    const { rows, count } = await ModelCall.findAndCountAll({
      where: whereClause,
      order: [['callTime', 'DESC']],
      limit,
      offset,
      include: [
        {
          model: AiProvider,
          as: 'provider',
          attributes: ['id', 'name', 'displayName', 'baseUrl', 'region', 'enabled'],
          required: false,
        },
      ],
    });
    return {
      count,
      list: rows,
    };
  }

  static async getUsageStatsByDateRange({
    userDid,
    startTime,
    endTime,
  }: {
    userDid?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<{
    byType: { [key: string]: { totalUsage: number; totalCalls: number } };
    totalCalls: number;
  }> {
    const whereClause: any = {};

    if (userDid) {
      whereClause.userDid = userDid;
    }

    if (startTime || endTime) {
      whereClause.callTime = {};
      if (startTime) whereClause.callTime[Op.gte] = Number(startTime);
      if (endTime) whereClause.callTime[Op.lte] = Number(endTime);
    }

    const calls = await ModelCall.findAll({
      where: whereClause,
      raw: true,
    });

    const statsByType: { [key: string]: { totalUsage: number; totalCalls: number } } = {};
    let totalCalls = 0;

    calls.forEach((call: any) => {
      const type = call.type || 'unknown';
      if (!statsByType[type]) {
        statsByType[type] = { totalUsage: 0, totalCalls: 0 };
      }
      statsByType[type].totalUsage = new BigNumber(statsByType[type].totalUsage).plus(call.totalUsage || 0).toNumber();
      statsByType[type].totalCalls = new BigNumber(statsByType[type].totalCalls).plus(1).toNumber();
      totalCalls = new BigNumber(totalCalls).plus(1).toNumber();
    });

    return {
      byType: statsByType,
      totalCalls,
    };
  }

  static async getTotalCreditsByDateRange({
    userDid,
    startTime,
    endTime,
  }: {
    userDid?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<number> {
    const whereClause: any = {};

    if (userDid) {
      whereClause.userDid = userDid;
    }

    if (startTime || endTime) {
      whereClause.callTime = {};
      if (startTime) whereClause.callTime[Op.gte] = Number(startTime);
      if (endTime) whereClause.callTime[Op.lte] = Number(endTime);
    }

    const result = (await ModelCall.findOne({
      attributes: [[sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('credits')), 0), 'totalCredits']],
      where: whereClause,
      raw: true,
    })) as any;

    const totalCredits = new BigNumber(result?.totalCredits || '0');
    return totalCredits.toNumber();
  }

  static async getDailyUsageStats({
    userDid,
    startTime,
    endTime,
  }: {
    userDid?: string;
    startTime?: number;
    endTime?: number;
  }): Promise<
    Array<{
      date: string;
      timestamp: number;
      byType: { [key: string]: { totalUsage: number; totalCalls: number } };
      totalCredits: number;
      totalCalls: number;
    }>
  > {
    const whereClause: any = {};

    if (userDid) {
      whereClause.userDid = userDid;
    }

    if (startTime || endTime) {
      whereClause.callTime = {};
      if (startTime) whereClause.callTime[Op.gte] = Number(startTime);
      if (endTime) whereClause.callTime[Op.lte] = Number(endTime);
    }

    const calls = await ModelCall.findAll({
      where: whereClause,
      order: [['callTime', 'ASC']],
      raw: true,
    });

    const dailyStats = new Map<string, any>();

    calls.forEach((call: any) => {
      const date = new Date(call.callTime * 1000).toISOString().split('T')[0]!;
      const type = call.type || 'unknown';

      if (!dailyStats.has(date)) {
        const dayTimestamp = Math.floor(new Date(`${date}T00:00:00.000Z`).getTime() / 1000);
        dailyStats.set(date, {
          date,
          timestamp: dayTimestamp,
          byType: {},
          totalCredits: 0,
          totalCalls: 0,
          totalUsage: 0,
        });
      }

      const dayStats = dailyStats.get(date)!;
      if (!dayStats.byType[type]) {
        dayStats.byType[type] = { totalUsage: 0, totalCalls: 0 };
      }

      dayStats.byType[type].totalUsage = new BigNumber(dayStats.byType[type].totalUsage)
        .plus(call.totalUsage || 0)
        .toNumber();
      dayStats.byType[type].totalCalls = new BigNumber(dayStats.byType[type].totalCalls).plus(1).toNumber();
      dayStats.totalCredits = new BigNumber(dayStats.totalCredits).plus(call.credits || 0).toNumber();
      dayStats.totalCalls = new BigNumber(dayStats.totalCalls).plus(1).toNumber();
      dayStats.totalUsage = new BigNumber(dayStats.totalUsage).plus(call.totalUsage || 0).toNumber();
    });

    return Array.from(dailyStats.values()).sort((a, b) => a.date.localeCompare(b.date));
  }

  static async getModelUsageStats({
    userDid,
    startTime,
    endTime,
    limit = 10,
  }: {
    userDid?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<{
    list: Array<{
      providerId: string;
      provider: {
        id: string;
        name: string;
        displayName: string;
      };
      model: string;
      totalCalls: number;
    }>;
    totalModelCount: number;
  }> {
    const whereConditions: string[] = [];
    const replacements: any = { limit };

    if (userDid) {
      whereConditions.push('"userDid" = :userDid');
      replacements.userDid = userDid;
    }

    if (startTime) {
      whereConditions.push('"callTime" >= :startTime');
      replacements.startTime = Number(startTime);
    }

    if (endTime) {
      whereConditions.push('"callTime" <= :endTime');
      replacements.endTime = Number(endTime);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const topModelsQuery = `
      SELECT 
        "model",
        MIN("providerId") as "providerId",
        COUNT(*) as "totalCalls"
      FROM "ModelCalls" 
      ${whereClause}
      GROUP BY "model"
      ORDER BY COUNT(*) DESC
      LIMIT :limit
    `;

    const totalCountQuery = `
      SELECT COUNT(DISTINCT "model") as "totalModels"
      FROM "ModelCalls" 
      ${whereClause}
    `;

    const [topModelsResults, totalCountResults] = await Promise.all([
      sequelize.query(topModelsQuery, {
        type: QueryTypes.SELECT,
        replacements,
      }),
      sequelize.query(totalCountQuery, {
        type: QueryTypes.SELECT,
        replacements: { ...replacements, limit: undefined },
      }),
    ]);

    if (topModelsResults.length === 0) {
      return {
        list: [],
        totalModelCount: 0,
      };
    }

    const providerIds = [...new Set(topModelsResults.map((result: any) => result.providerId))];
    const providers = await AiProvider.findAll({
      where: {
        id: { [Op.in]: providerIds },
      },
    });

    const providerMap = new Map(providers.map((provider) => [provider.id, provider]));

    const list = (topModelsResults as any[]).map((result: any) => ({
      providerId: result.providerId,
      provider: {
        id: result.providerId,
        name: providerMap.get(result.providerId)?.name || result.providerId,
        displayName: providerMap.get(result.providerId)?.displayName || result.providerId,
      },
      model: result.model,
      totalCalls: parseInt(result.totalCalls || '0', 10),
    }));

    const totalModelCount = parseInt(((totalCountResults as any[])[0] as any)?.totalModels || '0', 10);

    return {
      list,
      totalModelCount,
    };
  }

  static async getModelUsageStatsLegacy({
    userDid,
    startTime,
    endTime,
    limit = 10,
  }: {
    userDid?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): Promise<
    Array<{
      providerId: string;
      model: string;
      type: CallType;
      totalUsage: number;
      totalCredits: number;
      totalCalls: number;
      successRate: number;
    }>
  > {
    const whereConditions: string[] = [];
    const replacements: any = { limit };

    if (userDid) {
      whereConditions.push('"userDid" = :userDid');
      replacements.userDid = userDid;
    }

    if (startTime) {
      whereConditions.push('"callTime" >= :startTime');
      replacements.startTime = Number(startTime);
    }

    if (endTime) {
      whereConditions.push('"callTime" <= :endTime');
      replacements.endTime = Number(endTime);
    }

    const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

    const query = `
      SELECT 
        "providerId", "model", "type",
        SUM("totalUsage") as "totalUsage",
        SUM("credits") as "totalCredits", 
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN "status" = 'success' THEN 1 ELSE 0 END) as "successCalls"
      FROM "ModelCalls"
      ${whereClause}
      GROUP BY "providerId", "model", "type"
      ORDER BY SUM("totalUsage") DESC
      LIMIT :limit
    `;

    const results = (await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements,
    })) as any[];

    return results.map((result: any) => {
      const totalCalls = parseInt(result.totalCalls, 10);
      const successCalls = parseInt(result.successCalls, 10);
      return {
        providerId: result.providerId,
        model: result.model,
        type: result.type as CallType,
        totalUsage: parseInt(result.totalUsage, 10),
        totalCredits: parseFloat(result.totalCredits || '0'),
        totalCalls,
        successRate: totalCalls > 0 ? Math.round((successCalls / totalCalls) * 10000) / 100 : 0,
      };
    });
  }

  static async getWeeklyComparison(userDid: string): Promise<{
    current: { totalUsage: number; totalCredits: number; totalCalls: number };
    previous: { totalUsage: number; totalCredits: number; totalCalls: number };
    growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
  }> {
    const now = new Date();
    const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    const currentWeekEnd = new Date(
      currentWeekStart.getFullYear(),
      currentWeekStart.getMonth(),
      currentWeekStart.getDate() + 6
    );

    const previousWeekStart = new Date(
      currentWeekStart.getFullYear(),
      currentWeekStart.getMonth(),
      currentWeekStart.getDate() - 7
    );
    const previousWeekEnd = new Date(
      previousWeekStart.getFullYear(),
      previousWeekStart.getMonth(),
      previousWeekStart.getDate() + 6
    );

    const currentStartTimestamp = Math.floor(currentWeekStart.getTime() / 1000);
    const currentEndTimestamp = Math.floor(currentWeekEnd.getTime() / 1000);
    const previousStartTimestamp = Math.floor(previousWeekStart.getTime() / 1000);
    const previousEndTimestamp = Math.floor(previousWeekEnd.getTime() / 1000);

    const [currentStats, previousStats, currentCredits, previousCredits] = await Promise.all([
      ModelCall.getUsageStatsByDateRange({
        userDid,
        startTime: currentStartTimestamp,
        endTime: currentEndTimestamp,
      }),
      ModelCall.getUsageStatsByDateRange({
        userDid,
        startTime: previousStartTimestamp,
        endTime: previousEndTimestamp,
      }),
      ModelCall.getTotalCreditsByDateRange({
        userDid,
        startTime: currentStartTimestamp,
        endTime: currentEndTimestamp,
      }),
      ModelCall.getTotalCreditsByDateRange({
        userDid,
        startTime: previousStartTimestamp,
        endTime: previousEndTimestamp,
      }),
    ]);

    const currentTotals = {
      totalUsage: Object.values(currentStats.byType).reduce(
        (sum, type) => new BigNumber(sum).plus(type.totalUsage || 0).toNumber(),
        0
      ),
      totalCredits: currentCredits,
      totalCalls: currentStats.totalCalls,
    };

    const previousTotals = {
      totalUsage: Object.values(previousStats.byType).reduce(
        (sum, type) => new BigNumber(sum).plus(type.totalUsage || 0).toNumber(),
        0
      ),
      totalCredits: previousCredits,
      totalCalls: previousStats.totalCalls,
    };

    const growth = {
      usageGrowth:
        previousTotals.totalUsage > 0
          ? new BigNumber(currentTotals.totalUsage)
              .minus(previousTotals.totalUsage)
              .div(previousTotals.totalUsage)
              .toNumber()
          : currentTotals.totalUsage > 0
            ? 1
            : 0,
      creditsGrowth:
        previousTotals.totalCredits > 0
          ? new BigNumber(currentTotals.totalCredits)
              .minus(previousTotals.totalCredits)
              .div(previousTotals.totalCredits)
              .toNumber()
          : currentTotals.totalCredits > 0
            ? 1
            : 0,
      callsGrowth:
        previousTotals.totalCalls > 0
          ? new BigNumber(currentTotals.totalCalls)
              .minus(previousTotals.totalCalls)
              .div(previousTotals.totalCalls)
              .toNumber()
          : currentTotals.totalCalls > 0
            ? 1
            : 0,
    };

    return {
      current: currentTotals,
      previous: previousTotals,
      growth,
    };
  }

  static async getMonthlyComparison(userDid: string): Promise<{
    current: { totalUsage: number; totalCredits: number; totalCalls: number };
    previous: { totalUsage: number; totalCredits: number; totalCalls: number };
    growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
  }> {
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const previousMonthStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 1, 1);
    const previousMonthEnd = new Date(previousMonthStart.getFullYear(), previousMonthStart.getMonth() + 1, 0);

    const currentStartTimestamp = Math.floor(currentMonthStart.getTime() / 1000);
    const currentEndTimestamp = Math.floor(currentMonthEnd.getTime() / 1000);
    const previousStartTimestamp = Math.floor(previousMonthStart.getTime() / 1000);
    const previousEndTimestamp = Math.floor(previousMonthEnd.getTime() / 1000);

    const [currentStats, previousStats, currentCredits, previousCredits] = await Promise.all([
      ModelCall.getUsageStatsByDateRange({
        userDid,
        startTime: currentStartTimestamp,
        endTime: currentEndTimestamp,
      }),
      ModelCall.getUsageStatsByDateRange({
        userDid,
        startTime: previousStartTimestamp,
        endTime: previousEndTimestamp,
      }),
      ModelCall.getTotalCreditsByDateRange({
        userDid,
        startTime: currentStartTimestamp,
        endTime: currentEndTimestamp,
      }),
      ModelCall.getTotalCreditsByDateRange({
        userDid,
        startTime: previousStartTimestamp,
        endTime: previousEndTimestamp,
      }),
    ]);

    const currentTotals = {
      totalUsage: Object.values(currentStats.byType).reduce(
        (sum, type) => new BigNumber(sum).plus(type.totalUsage || 0).toNumber(),
        0
      ),
      totalCredits: currentCredits,
      totalCalls: currentStats.totalCalls,
    };

    const previousTotals = {
      totalUsage: Object.values(previousStats.byType).reduce(
        (sum, type) => new BigNumber(sum).plus(type.totalUsage || 0).toNumber(),
        0
      ),
      totalCredits: previousCredits,
      totalCalls: previousStats.totalCalls,
    };

    const growth = {
      usageGrowth:
        previousTotals.totalUsage > 0
          ? new BigNumber(currentTotals.totalUsage)
              .minus(previousTotals.totalUsage)
              .div(previousTotals.totalUsage)
              .toNumber()
          : currentTotals.totalUsage > 0
            ? 1
            : 0,
      creditsGrowth:
        previousTotals.totalCredits > 0
          ? new BigNumber(currentTotals.totalCredits)
              .minus(previousTotals.totalCredits)
              .div(previousTotals.totalCredits)
              .toNumber()
          : currentTotals.totalCredits > 0
            ? 1
            : 0,
      callsGrowth:
        previousTotals.totalCalls > 0
          ? new BigNumber(currentTotals.totalCalls)
              .minus(previousTotals.totalCalls)
              .div(previousTotals.totalCalls)
              .toNumber()
          : currentTotals.totalCalls > 0
            ? 1
            : 0,
    };

    return {
      current: currentTotals,
      previous: previousTotals,
      growth,
    };
  }

  // Association method
  static associate(models: any) {
    // Belongs to AiProvider
    ModelCall.belongsTo(models.AiProvider, {
      foreignKey: 'providerId',
      as: 'provider',
    });

    // Belongs to AiCredential
    ModelCall.belongsTo(models.AiCredential, {
      foreignKey: 'credentialId',
      as: 'credential',
    });
  }
}

ModelCall.init(ModelCall.GENESIS_ATTRIBUTES, {
  sequelize,
});
