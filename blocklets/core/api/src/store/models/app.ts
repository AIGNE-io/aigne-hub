import { CustomError } from '@blocklet/error';
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';

import { sequelize } from '../sequelize';

export default class App extends Model<InferAttributes<App>, InferCreationAttributes<App>> {
  declare id: string;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;

  declare publicKey?: string;

  static async findPublicKeyById(appId: string) {
    return App.findByPk(appId, { rejectOnEmpty: new CustomError(404, 'App not found') }).then((app) => {
      if (!app.publicKey) throw new CustomError(400, 'Public key not set for this app');
      return app.publicKey;
    });
  }
}

App.init(
  {
    id: {
      type: DataTypes.STRING,
      primaryKey: true,
      allowNull: false,
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    updatedAt: {
      type: DataTypes.DATE,
      allowNull: false,
    },
    publicKey: {
      type: DataTypes.TEXT('medium'),
    },
  },
  { sequelize }
);
