import { DataTypes } from 'sequelize';

import { Migration } from '../migrate';

/**
 * Migration for data archiving infrastructure:
 * 1. Create ArchiveExecutionLog table for audit trail
 */
export const up: Migration = async ({ context: queryInterface }) => {
  // 1. Create ArchiveExecutionLog table
  await queryInterface.createTable('ArchiveExecutionLogs', {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
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
  });

  // Add index for querying execution logs
  await queryInterface.addIndex('ArchiveExecutionLogs', ['tableName', 'status', 'createdAt'], {
    name: 'idx_archive_execution_logs_table_status_time',
  });
};

export const down: Migration = async ({ context: queryInterface }) => {
  // Drop ArchiveExecutionLog table
  await queryInterface.dropTable('ArchiveExecutionLogs');
};
