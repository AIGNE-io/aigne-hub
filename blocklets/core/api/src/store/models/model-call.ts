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
import { getCurrentUnixTimestamp } from '../../libs/timestamp';
import { sequelize } from '../sequelize';
import AiProvider from './ai-provider';
import { CallStatus, CallType, UsageMetrics } from './types';

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

  declare appDid: string | null;

  declare userDid: string;

  declare requestId?: string;

  declare metadata?: Record<string, any>;

  declare callTime: CreationOptional<number>;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;

  declare traceId?: string;

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
      type: DataTypes.ENUM('chatCompletion', 'embedding', 'imageGeneration', 'audioGeneration', 'video', 'custom'),
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
      type: DataTypes.DECIMAL(10, 1),
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
    traceId: {
      type: DataTypes.STRING,
      allowNull: true,
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
    type,
    minDurationSeconds,
    searchFields,
    attributes,
    includeProvider = true,
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
    appDid?: string | null;
    type?: string;
    minDurationSeconds?: number;
    searchFields?: string[] | string;
    attributes?: string[];
    includeProvider?: boolean;
  }): Promise<{
    count: number;
    list: (ModelCall & { provider?: AiProvider })[];
  }> {
    const whereClause: any = {};
    const andConditions: any[] = [];

    if (userDid) {
      whereClause.userDid = userDid;
    }

    if (appDid !== undefined) {
      if (appDid === null) {
        andConditions.push({ [Op.or]: [{ appDid: { [Op.is]: null } }, { appDid: '' }] });
      } else if (appDid) {
        whereClause.appDid = appDid;
      }
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

    if (type) {
      whereClause.type = type;
    }

    if (minDurationSeconds !== undefined) {
      whereClause.duration = { [Op.gte]: Number(minDurationSeconds) };
    }

    if (search) {
      const searchFieldMap: Record<string, any> = {
        model: { model: { [Op.like]: `%${search}%` } },
        traceId: { traceId: { [Op.like]: `%${search}%` } },
        id: { id: { [Op.like]: `%${search}%` } },
        userDid: { userDid: { [Op.like]: `%${search}%` } },
      };

      const normalizedFields = Array.isArray(searchFields)
        ? searchFields
        : typeof searchFields === 'string'
          ? searchFields.split(',')
          : [];

      const cleanedFields = normalizedFields.map((field) => field.trim()).filter(Boolean);
      const activeFields = cleanedFields.length > 0 ? cleanedFields : Object.keys(searchFieldMap);

      const searchClauses = activeFields.map((field) => searchFieldMap[field]).filter(Boolean);

      if (searchClauses.length > 0) {
        andConditions.push({ [Op.or]: searchClauses });
      }
    }

    if (andConditions.length > 0) {
      whereClause[Op.and] = (whereClause[Op.and] || []).concat(andConditions);
    }

    const queryOptions: any = {
      where: whereClause,
      order: [['callTime', 'DESC']],
      limit,
      offset,
    };

    if (attributes && attributes.length > 0) {
      queryOptions.attributes = attributes;
    }

    if (includeProvider) {
      queryOptions.include = [
        {
          model: AiProvider,
          as: 'provider',
          attributes: ['id', 'name', 'displayName', 'baseUrl', 'region', 'enabled'],
          required: false,
        },
      ];
    }

    const { rows, count } = await ModelCall.findAndCountAll(queryOptions);
    return {
      count,
      list: rows,
    };
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
