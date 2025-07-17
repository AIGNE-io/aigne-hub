import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { Worker } from 'snowflake-uuid';

import { sequelize } from '../sequelize';
import AiCredential from './ai-credential';

const idGenerator = new Worker();

const nextId = () => idGenerator.nextId().toString();

export type AIProviderType =
  | 'openai'
  | 'anthropic'
  | 'bedrock'
  | 'deepseek'
  | 'google'
  | 'ollama'
  | 'openrouter'
  | 'xai';

export default class AiProvider extends Model<InferAttributes<AiProvider>, InferCreationAttributes<AiProvider>> {
  declare id: CreationOptional<string>;

  declare name: AIProviderType;

  declare displayName: string;

  declare baseUrl?: string;

  declare region?: string;

  declare enabled: boolean;

  declare config?: object;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;

  declare createdBy?: string;

  public static readonly GENESIS_ATTRIBUTES = {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      defaultValue: nextId,
    },
    name: {
      type: DataTypes.STRING(50),
      allowNull: false,
      unique: true,
    },
    displayName: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    baseUrl: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    region: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    enabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    config: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    createdBy: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  };

  // 关联方法
  static associate(models: any) {
    // Existing associations
    AiProvider.hasMany(models.AiCredential, {
      foreignKey: 'providerId',
      as: 'credentials',
    });

    // New association for model rates
    AiProvider.hasMany(models.AiModelRate, {
      foreignKey: 'providerId',
      as: 'modelRates',
    });
  }

  // 获取启用的提供商
  static async getEnabledProviders(typeFilter?: string): Promise<AiProvider[]> {
    const where: any = { enabled: true };
    if (typeFilter) {
      where.type = typeFilter;
    }
    return AiProvider.findAll({
      where,
      include: [
        {
          model: AiCredential,
          as: 'credentials',
          where: { active: true },
          required: false,
        },
      ],
      order: [['displayName', 'ASC']],
    });
  }
}

AiProvider.init(AiProvider.GENESIS_ATTRIBUTES, { sequelize });
