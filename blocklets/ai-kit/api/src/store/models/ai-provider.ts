import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { Worker } from 'snowflake-uuid';

import { sequelize } from '../sequelize';

const idGenerator = new Worker();

const nextId = () => idGenerator.nextId().toString();

export type AIProviderType =
  | 'openai'
  | 'anthropic'
  | 'bedrock'
  | 'deepseek'
  | 'google'
  | 'ollama'
  | 'openRouter'
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
    AiProvider.hasMany(models.AiCredential, {
      foreignKey: 'providerId',
      as: 'credentials',
    });
  }

  // 获取启用的提供商
  static async getEnabledProviders(): Promise<AiProvider[]> {
    return AiProvider.findAll({
      where: { enabled: true },
      include: [
        {
          association: 'credentials',
          where: { active: true },
          required: false,
        },
      ],
      order: [['displayName', 'ASC']],
    });
  }

  // 根据名称获取提供商
  static async getByName(name: AIProviderType): Promise<AiProvider | null> {
    return AiProvider.findOne({
      where: { name },
      include: [
        {
          association: 'credentials',
          where: { active: true },
          required: false,
        },
      ],
    });
  }
}

AiProvider.init(AiProvider.GENESIS_ATTRIBUTES, { sequelize });
