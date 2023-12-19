import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';

import { sequelize } from '../sequelize';

export default class App extends Model<InferAttributes<App>, InferCreationAttributes<App>> {
  declare id: string;

  declare createdAt: CreationOptional<Date>;

  declare updatedAt: CreationOptional<Date>;

  declare publicKey?: string;
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
