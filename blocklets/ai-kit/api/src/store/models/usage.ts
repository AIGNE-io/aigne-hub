import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model, Op } from 'sequelize';
import { Worker } from 'snowflake-uuid';

import { sequelize } from '../sequelize';

const idGenerator = new Worker();

const nextId = () => idGenerator.nextId().toString();

export default class Usage extends Model<InferAttributes<Usage>, InferCreationAttributes<Usage>> {
  declare id: CreationOptional<string>;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;

  declare promptTokens: number;

  declare completionTokens: number;

  declare numberOfImageGeneration?: number;

  declare apiKey?: string;

  declare type?: 'chatCompletion' | 'embedding' | 'imageGeneration';

  declare model?: string;

  declare modelParams?: object;

  declare appId?: string;

  // 用量上报状态
  // counted: 已经把这条记录作为**提交点**（但有可能因为上报失败而没有变为 reported）
  // reported: 已经把上一个**提交点**到这条记录间的 usage 上报至 payment
  declare usageReportStatus?: null | 'counted' | 'reported';

  declare usedCredits?: number | null;

  static async getSumUsedCredits({
    appId,
    startOfMonth,
    endOfMonth,
  }: {
    appId: string;
    startOfMonth?: string;
    endOfMonth?: string;
  }) {
    const where: { appId: string; createdAt?: any } = { appId };

    if (startOfMonth && endOfMonth) {
      where.createdAt = {
        [Op.between]: [startOfMonth, endOfMonth],
      };
    }

    const results = await Usage.findAll({
      attributes: [
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.fn('SUM', sequelize.col('usedCredits')), 'totalUsedCredits'],
      ],
      where,
      group: [sequelize.fn('DATE', sequelize.col('createdAt'))],
      order: [[sequelize.fn('DATE', sequelize.col('createdAt')), 'ASC']],
    });

    if (startOfMonth && endOfMonth) {
      const dateRange = [];
      const currentDate = new Date(startOfMonth);
      while (currentDate <= new Date(endOfMonth)) {
        dateRange.push(currentDate.toISOString().split('T')[0]);
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const dataWithPlaceholders = dateRange.map((date) => {
        const existingData = results.find((result) => (result.dataValues as any)?.date === date);
        return existingData || { date, totalUsedCredits: 0 };
      });

      return dataWithPlaceholders;
    }

    return results;
  }
}

Usage.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      defaultValue: nextId,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    promptTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    completionTokens: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    numberOfImageGeneration: {
      type: DataTypes.INTEGER,
    },
    apiKey: {
      type: DataTypes.STRING,
    },
    model: {
      type: DataTypes.STRING,
    },
    modelParams: {
      type: DataTypes.JSON,
    },
    appId: {
      type: DataTypes.STRING,
    },
    type: {
      type: DataTypes.STRING,
    },
    usedCredits: {
      type: DataTypes.DECIMAL,
    },
  },
  { sequelize }
);
