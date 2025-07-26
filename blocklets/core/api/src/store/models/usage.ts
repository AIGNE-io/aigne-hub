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

  declare userDid?: string;

  // 用量上报状态
  // counted: 已经把这条记录作为**提交点**（但有可能因为上报失败而没有变为 reported）
  // reported: 已经把上一个**提交点**到这条记录间的 usage 上报至 payment
  declare usageReportStatus?: null | 'counted' | 'reported';

  declare usedCredits?: number | null;

  static async sumUsedCredits({
    appId,
    startTime,
    endTime,
  }: {
    appId: string;
    startTime?: string;
    endTime?: string;
  }): Promise<
    {
      date: string;
      usedCredits: string;
      promptTokens: number;
      completionTokens: number;
      numberOfImageGeneration: number;
    }[]
  > {
    return Usage.findAll({
      attributes: [
        'model',
        [sequelize.fn('DATE', sequelize.col('createdAt')), 'date'],
        [sequelize.cast(sequelize.fn('SUM', sequelize.col('usedCredits')), 'varchar(100)'), 'usedCredits'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('promptTokens')), 0), 'promptTokens'],
        [sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('completionTokens')), 0), 'completionTokens'],
        [
          sequelize.fn('COALESCE', sequelize.fn('SUM', sequelize.col('numberOfImageGeneration')), 0),
          'numberOfImageGeneration',
        ],
      ],
      where: { appId, createdAt: { [Op.gte]: startTime, [Op.lte]: endTime }, usedCredits: { [Op.not]: null } },
      group: ['model', 'date'],
      order: [['date', 'ASC']],
      raw: true,
    }) as any;
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
    usageReportStatus: {
      type: DataTypes.STRING,
    },
    userDid: {
      type: DataTypes.STRING,
    },
  },
  { sequelize }
);
