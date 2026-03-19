import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';

import nextId from '../../libs/next-id';
import { sequelize } from '../sequelize';

export type RateChangeType = 'source_drift' | 'manual_update' | 'bulk_update' | 'bulk_create' | 'auto_update';

export default class AiModelRateHistory extends Model<
  InferAttributes<AiModelRateHistory>,
  InferCreationAttributes<AiModelRateHistory>
> {
  declare id: CreationOptional<string>;

  declare providerId: string;

  declare model: string;

  declare type: string;

  declare changeType: RateChangeType;

  declare source: string;

  declare previousUnitCosts: { input: number; output: number } | null;

  declare currentUnitCosts: { input: number; output: number } | null;

  declare previousRates: { inputRate: number; outputRate: number } | null;

  declare currentRates: { inputRate: number; outputRate: number } | null;

  declare driftPercent: number | null;

  declare detectedAt: number;

  declare metadata: Record<string, any> | null;

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
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    changeType: {
      type: DataTypes.STRING(20),
      allowNull: false,
    },
    source: {
      type: DataTypes.STRING(50),
      allowNull: false,
    },
    previousUnitCosts: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    currentUnitCosts: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    previousRates: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    currentRates: {
      type: DataTypes.JSON,
      allowNull: true,
    },
    driftPercent: {
      type: DataTypes.DECIMAL(10, 4),
      allowNull: true,
    },
    detectedAt: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    metadata: {
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
  };
}

AiModelRateHistory.init(AiModelRateHistory.GENESIS_ATTRIBUTES, {
  sequelize,
});
