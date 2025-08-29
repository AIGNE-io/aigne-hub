import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { Worker } from 'snowflake-uuid';

import { sequelize } from '../sequelize';

const idGenerator = new Worker();

const nextId = () => idGenerator.nextId().toString();

export enum ModelErrorType {
  INVALID_API_KEY = 'Invalid API Key',
  NO_CREDITS_AVAILABLE = 'No Credits Available',
  EXPIRED_CREDENTIAL = 'Expired Credential',
  MODEL_NOT_FOUND = 'Model Not Found',
  MODEL_UNAVAILABLE = 'Model Unavailable',
  RATE_LIMIT_EXCEEDED = 'Rate Limit Exceeded',
  QUOTA_EXCEEDED = 'Quota Exceeded',
  NETWORK_TIMEOUT = 'Network Timeout',
  CONNECTION_ERROR = 'Connection Error',
  NO_CREDENTIALS = 'No Credentials',
  UNKNOWN_ERROR = 'Unknown Error',
}

export interface ModelError {
  code: ModelErrorType;
  message: string;
}

export default class AiModelStatus extends Model<
  InferAttributes<AiModelStatus>,
  InferCreationAttributes<AiModelStatus>
> {
  declare id: CreationOptional<string>;

  declare providerId: string;

  declare model: string;

  declare available: boolean;

  declare error?: ModelError;

  declare responseTime?: number;

  declare lastChecked: Date;

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
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    available: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    error: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    responseTime: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    lastChecked: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
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

  static associate(models: any) {
    AiModelStatus.belongsTo(models.AiProvider, {
      foreignKey: 'providerId',
      as: 'provider',
    });
  }

  static async getModelStatus(
    providerId: string,
    model: string,
    trustWindowMs: number = 3600000
  ): Promise<AiModelStatus | null> {
    const status = await AiModelStatus.findOne({
      where: { providerId, model },
    });

    if (!status) {
      return null;
    }

    const now = new Date();
    const timeSinceLastCheck = now.getTime() - status.lastChecked.getTime();

    if (timeSinceLastCheck > trustWindowMs) {
      return null;
    }

    return status;
  }

  static async upsertModelStatus({
    providerId,
    model,
    available,
    error,
    responseTime,
  }: {
    providerId: string;
    model: string;
    available: boolean;
    error?: ModelError;
    responseTime?: number;
  }): Promise<AiModelStatus> {
    const [status] = await AiModelStatus.findOrCreate({
      where: { providerId, model },
      defaults: {
        providerId,
        model,
        available,
        error,
        responseTime,
        lastChecked: new Date(),
      },
    });

    await status.update({
      available,
      error,
      responseTime,
      lastChecked: new Date(),
    });

    return status;
  }
}

AiModelStatus.init(AiModelStatus.GENESIS_ATTRIBUTES, { sequelize });
