import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';

import nextId from '../../libs/next-id';
import { sequelize } from '../sequelize';

export type ArchiveStatus = 'success' | 'failed';
export type ArchiveTableName = 'ModelCalls' | 'ModelCallStats' | 'Usage';

export default class ArchiveExecutionLog extends Model<
  InferAttributes<ArchiveExecutionLog>,
  InferCreationAttributes<ArchiveExecutionLog>
> {
  declare id: CreationOptional<string>;

  declare tableName: ArchiveTableName;

  declare status: ArchiveStatus;

  declare archivedCount: number;

  declare dataRangeStart?: number | null;

  declare dataRangeEnd?: number | null;

  declare targetArchiveDb?: string | null;

  declare duration: number;

  declare errorMessage?: string | null;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;
}

ArchiveExecutionLog.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      defaultValue: nextId,
    },
    tableName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Source table name: ModelCalls, ModelCallStats, or Usage',
    },
    status: {
      type: DataTypes.ENUM('success', 'failed'),
      allowNull: false,
    },
    archivedCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: 'Number of records archived',
    },
    dataRangeStart: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Start timestamp of archived data range',
    },
    dataRangeEnd: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'End timestamp of archived data range',
    },
    targetArchiveDb: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Target archive database file name, e.g., archive_2025_Q1.db',
    },
    duration: {
      type: DataTypes.DECIMAL(10, 3),
      allowNull: false,
      comment: 'Execution duration in seconds',
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Error message if status is failed',
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
  },
  {
    sequelize,
    tableName: 'ArchiveExecutionLogs',
  }
);
