import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';

import nextId from '../../libs/next-id';
import { sequelize } from '../sequelize';
import { CallType } from './types';

export enum ModelErrorType {
  INVALID_ARGUMENT = 'Invalid Argument',
  INVALID_API_KEY = 'Invalid API Key',
  NO_CREDITS_AVAILABLE = 'No Credits Available',
  EXPIRED_CREDENTIAL = 'Expired Credential',
  CONTENT_POLICY_VIOLATION = 'Content Policy Violation',
  REGION_RESTRICTION = 'Region Restriction',
  TEMPORARY_BLOCK = 'Temporary Block',
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

  declare type?: Omit<CallType, 'custom' | 'audioGeneration'>;

  declare available: boolean;

  declare error?: ModelError | null;

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
    type: {
      type: DataTypes.ENUM('chatCompletion', 'embedding', 'imageGeneration', 'video'),
      allowNull: true,
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

  static async upsertModelStatus({
    providerId,
    model,
    available,
    error,
    responseTime,
    type,
  }: {
    providerId: string;
    model: string;
    available: boolean;
    error?: ModelError | null;
    responseTime?: number;
    type?: Omit<CallType, 'custom' | 'audioGeneration'>;
  }): Promise<AiModelStatus> {
    const [status] = await AiModelStatus.findOrCreate({
      where: { providerId, model, type },
      defaults: {
        providerId,
        model,
        available,
        error,
        responseTime,
        lastChecked: new Date(),
        type,
      },
    });

    await status.update({
      available,
      error,
      responseTime,
      lastChecked: new Date(),
      type,
    });

    return status;
  }
}

AiModelStatus.init(AiModelStatus.GENESIS_ATTRIBUTES, { sequelize });
