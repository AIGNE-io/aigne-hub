import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';

import { sequelize } from '../sequelize';

/**
 * Project Model - stores metadata about user applications
 * Caches app information from blocklet domain to avoid repeated external requests
 */
export default class Project extends Model<InferAttributes<Project>, InferCreationAttributes<Project>> {
  declare appDid: string;

  declare appName: string;

  declare appLogo: CreationOptional<string>;

  declare appUrl: CreationOptional<string>;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;

  /**
   * Upsert project information
   * Creates or updates project metadata based on appDid
   */
  static async upsertProject(appDid: string, appName: string, appLogo?: string, appUrl?: string) {
    const [project] = await Project.upsert({
      appDid,
      appName,
      appLogo: appLogo || '',
      appUrl: appUrl || '',
    });
    return project;
  }

  /**
   * Get project by appDid
   */
  static async getByAppDid(appDid: string) {
    return Project.findOne({ where: { appDid } });
  }

  /**
   * Get multiple projects by appDids
   */
  static async getByAppDids(appDids: string[]) {
    return Project.findAll({ where: { appDid: appDids } });
  }
}

Project.init(
  {
    appDid: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
      comment: 'Blocklet DID',
    },
    appName: {
      type: DataTypes.STRING,
      allowNull: false,
      comment: 'Application name from blocklet metadata',
    },
    appLogo: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Application logo URL',
    },
    appUrl: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: 'Application URL',
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
    tableName: 'Projects',
    indexes: [
      {
        fields: ['appDid'],
        unique: true,
      },
    ],
  }
);
