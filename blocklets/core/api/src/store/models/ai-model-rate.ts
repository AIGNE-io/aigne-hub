import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { Worker } from 'snowflake-uuid';

import { sequelize } from '../sequelize';

const idGenerator = new Worker();

const nextId = () => idGenerator.nextId().toString();

export type RateType = 'chatCompletion' | 'embedding' | 'imageGeneration';

export default class AiModelRate extends Model<InferAttributes<AiModelRate>, InferCreationAttributes<AiModelRate>> {
  declare id: CreationOptional<string>;

  declare providerId: string;

  declare model: string;

  declare modelDisplay: string;

  declare description?: string;

  declare type: RateType;

  declare inputRate: number;

  declare outputRate: number;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;

  declare unitCosts?: {
    input: number;
    output: number;
  };

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
    modelDisplay: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    description: {
      type: DataTypes.STRING(100),
      allowNull: true,
    },
    type: {
      type: DataTypes.ENUM('text', 'image', 'embedding'),
      allowNull: false,
    },
    unitCosts: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    inputRate: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
    },
    outputRate: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: false,
      defaultValue: 0,
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

  // Association method
  static associate(models: any) {
    // Belongs to AiProvider
    AiModelRate.belongsTo(models.AiProvider, {
      foreignKey: 'providerId',
      as: 'provider',
    });
  }

  // Get rates for a specific model
  static async getRatesForModel(providerId: string, model: string): Promise<AiModelRate[]> {
    return AiModelRate.findAll({
      where: { providerId, model },
    });
  }

  // Get rate for a specific model and type
  static async getRateForModelType(providerId: string, model: string, type: RateType): Promise<AiModelRate | null> {
    return AiModelRate.findOne({
      where: { providerId, model, type },
    });
  }

  static getDefaultModelDisplay(model: string): string {
    const modelDisplay = model.split('/').pop();
    if (modelDisplay) {
      return modelDisplay.replace(/-/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
    }
    return model;
  }
}

AiModelRate.init(AiModelRate.GENESIS_ATTRIBUTES, { sequelize });
