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
  }): Promise<{
    count: number;
    list: (ModelCall & { provider?: AiProvider })[];
  }> {
    const whereClause: any = {};

    if (userDid) {
      whereClause.userDid = userDid;
    }

    // 优化：使用 timestamp 进行高效的时间范围查询
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
      whereClause[Op.or] = [{ model: { [Op.like]: `%${search}%` } }];
    }

    const { rows, count } = await ModelCall.findAndCountAll({
      where: whereClause,
      order: [['callTime', 'DESC']], // 使用 timestamp 排序更高效
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

    // 使用 timestamp 进行高效查询
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
      statsByType[type].totalUsage += Number(call.totalUsage || 0);
      statsByType[type].totalCalls += 1;
      totalCalls += 1;
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

    // 使用 BigNumber 确保精确计算
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
        dailyStats.set(date, {
          date,
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
  }): Promise<
    Array<{
      providerId: string;
      provider: {
        id: string;
        name: string;
        displayName: string;
      };
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
        mc."providerId",
        mc."model",
        mc."type",
        ap."name" as "providerName",
        ap."displayName" as "providerDisplayName",
        SUM(mc."totalUsage") as "totalUsage",
        SUM(mc."credits") as "totalCredits",
        COUNT(*) as "totalCalls",
        SUM(CASE WHEN mc."status" = 'success' THEN 1 ELSE 0 END) as "successCalls"
      FROM "ModelCalls" mc
      LEFT JOIN "AiProviders" ap ON mc."providerId" = ap."id"
      ${whereClause.replace(/"(\w+)"/g, 'mc."$1"')}
      GROUP BY mc."providerId", mc."model", mc."type", ap."name", ap."displayName"
      ORDER BY SUM(mc."totalUsage") DESC
      LIMIT :limit
    `;

    const results = (await sequelize.query(query, {
      type: QueryTypes.SELECT,
      replacements,
    })) as any[];

    return results.map((result: any) => ({
      providerId: result.providerId,
      provider: {
        id: result.providerId,
        name: result.providerName,
        displayName: result.providerDisplayName,
      },
      model: result.model,
      type: result.type as CallType,
      totalUsage: parseInt(result.totalUsage || '0', 10),
      totalCredits: parseFloat(result.totalCredits || '0'),
      totalCalls: parseInt(result.totalCalls || '0', 10),
      successRate:
        parseInt(result.totalCalls || '0', 10) > 0
          ? Math.round((parseInt(result.successCalls || '0', 10) / parseInt(result.totalCalls || '0', 10)) * 10000) /
            100
          : 0,
    }));
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

  // 兜底的原始查询方法
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

  // 获取时间段对比数据（使用数据库缓存）
  static async getTimeComparisonStats({
    userDid,
    currentStart,
    currentEnd,
    previousStart,
    previousEnd,
  }: {
    userDid: string;
    currentStart: Date;
    currentEnd: Date;
    previousStart: Date;
    previousEnd: Date;
  }): Promise<{
    current: { totalUsage: number; totalCredits: number; totalCalls: number };
    previous: { totalUsage: number; totalCredits: number; totalCalls: number };
    growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
  }> {
    // 动态导入避免循环依赖
    const { default: ModelCallStat } = await import('./model-call-stat');

    // 生成当前和上一时间段的日期范围
    const currentDates = ModelCall.generateDateRange(currentStart, currentEnd);
    const previousDates = ModelCall.generateDateRange(previousStart, previousEnd);

    // 并行获取两个时间段的数据
    const [currentStatsArray, previousStatsArray] = await Promise.all([
      Promise.all(currentDates.map((date) => ModelCallStat.getDailyStats(userDid, date))),
      Promise.all(previousDates.map((date) => ModelCallStat.getDailyStats(userDid, date))),
    ]);

    // 聚合当前时间段数据
    const currentTotals = { totalUsage: 0, totalCredits: 0, totalCalls: 0 };
    currentStatsArray.forEach((dailyStats) => {
      currentTotals.totalUsage = new BigNumber(currentTotals.totalUsage).plus(dailyStats.totalUsage).toNumber();
      currentTotals.totalCredits = new BigNumber(currentTotals.totalCredits).plus(dailyStats.totalCredits).toNumber();
      currentTotals.totalCalls = new BigNumber(currentTotals.totalCalls).plus(dailyStats.totalCalls).toNumber();
    });

    // 聚合上一时间段数据
    const previousTotals = { totalUsage: 0, totalCredits: 0, totalCalls: 0 };
    previousStatsArray.forEach((dailyStats) => {
      previousTotals.totalUsage = new BigNumber(previousTotals.totalUsage).plus(dailyStats.totalUsage).toNumber();
      previousTotals.totalCredits = new BigNumber(previousTotals.totalCredits).plus(dailyStats.totalCredits).toNumber();
      previousTotals.totalCalls = new BigNumber(previousTotals.totalCalls).plus(dailyStats.totalCalls).toNumber();
    });

    // 计算增长率
    const growth = {
      usageGrowth:
        previousTotals.totalUsage > 0
          ? new BigNumber(currentTotals.totalUsage)
              .minus(previousTotals.totalUsage)
              .div(previousTotals.totalUsage)
              .toNumber()
          : 0,
      creditsGrowth:
        previousTotals.totalCredits > 0
          ? new BigNumber(currentTotals.totalCredits)
              .minus(previousTotals.totalCredits)
              .div(previousTotals.totalCredits)
              .toNumber()
          : 0,
      callsGrowth:
        previousTotals.totalCalls > 0
          ? new BigNumber(currentTotals.totalCalls)
              .minus(previousTotals.totalCalls)
              .div(previousTotals.totalCalls)
              .toNumber()
          : 0,
    };

    return {
      current: currentTotals,
      previous: previousTotals,
      growth,
    };
  }

  // 获取本周vs上周对比
  static async getWeeklyComparison(userDid: string): Promise<{
    current: { totalUsage: number; totalCredits: number; totalCalls: number };
    previous: { totalUsage: number; totalCredits: number; totalCalls: number };
    growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
  }> {
    // 统一使用 UTC 时间避免时区问题
    const now = new Date();
    const currentWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()); // 本周开始
    const currentWeekEnd = new Date(
      currentWeekStart.getFullYear(),
      currentWeekStart.getMonth(),
      currentWeekStart.getDate() + 6
    ); // 本周结束

    const previousWeekStart = new Date(
      currentWeekStart.getFullYear(),
      currentWeekStart.getMonth(),
      currentWeekStart.getDate() - 7
    ); // 上周开始
    const previousWeekEnd = new Date(
      previousWeekStart.getFullYear(),
      previousWeekStart.getMonth(),
      previousWeekStart.getDate() + 6
    ); // 上周结束

    return ModelCall.getTimeComparisonStats({
      userDid,
      currentStart: currentWeekStart,
      currentEnd: currentWeekEnd,
      previousStart: previousWeekStart,
      previousEnd: previousWeekEnd,
    });
  }

  // 获取本月vs上月对比
  static async getMonthlyComparison(userDid: string): Promise<{
    current: { totalUsage: number; totalCredits: number; totalCalls: number };
    previous: { totalUsage: number; totalCredits: number; totalCalls: number };
    growth: { usageGrowth: number; creditsGrowth: number; callsGrowth: number };
  }> {
    // 统一使用 UTC 时间避免时区问题
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1); // 本月开始
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0); // 本月结束

    const previousMonthStart = new Date(currentMonthStart.getFullYear(), currentMonthStart.getMonth() - 1, 1); // 上月开始
    const previousMonthEnd = new Date(previousMonthStart.getFullYear(), previousMonthStart.getMonth() + 1, 0); // 上月结束

    return ModelCall.getTimeComparisonStats({
      userDid,
      currentStart: currentMonthStart,
      currentEnd: currentMonthEnd,
      previousStart: previousMonthStart,
      previousEnd: previousMonthEnd,
    });
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
