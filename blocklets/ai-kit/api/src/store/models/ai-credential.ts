import security from '@blocklet/sdk/lib/security';
import { CreationOptional, DataTypes, InferAttributes, InferCreationAttributes, Model } from 'sequelize';
import { Worker } from 'snowflake-uuid';

import { sequelize } from '../sequelize';

const idGenerator = new Worker();

const nextId = () => idGenerator.nextId().toString();

export type CredentialType = 'api_key' | 'access_key_pair' | 'custom';

export interface CredentialValue {
  access_key_id?: string;
  secret_access_key?: string;
  api_key?: string;
  [key: string]: any;
}

export default class AiCredential extends Model<InferAttributes<AiCredential>, InferCreationAttributes<AiCredential>> {
  declare id: CreationOptional<string>;

  declare providerId: string;

  declare name: string;

  declare credentialValue: CredentialValue;

  declare credentialType: CredentialType;

  declare active: boolean;

  declare lastUsedAt?: Date;

  declare usageCount: number;

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
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    credentialValue: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    credentialType: {
      type: DataTypes.ENUM('api_key', 'access_key_pair', 'custom'),
      allowNull: false,
      defaultValue: 'api_key',
    },
    active: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    usageCount: {
      type: DataTypes.INTEGER,
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

  // 关联方法
  static associate(models: any) {
    AiCredential.belongsTo(models.AiProvider, {
      foreignKey: 'providerId',
      as: 'provider',
    });
  }

  // 获取活跃的凭证
  static async getActiveCredentials(providerId: string): Promise<AiCredential[]> {
    return AiCredential.findAll({
      where: {
        providerId,
        active: true,
      },
      order: [['usageCount', 'ASC']], // 优先使用使用次数少的
    });
  }

  // 更新使用统计
  async updateUsage(): Promise<void> {
    await this.increment('usageCount');
    await this.update({ lastUsedAt: new Date() });
  }

  // 获取下一个可用的凭证（负载均衡）
  static async getNextAvailableCredential(providerId: string): Promise<AiCredential | null> {
    return AiCredential.findOne({
      where: {
        providerId,
        active: true,
      },
      order: [
        ['usageCount', 'ASC'],
        ['lastUsedAt', 'ASC'],
      ],
    });
  }

  // 批量更新凭证状态
  static async updateCredentialStatus(ids: string[], active: boolean): Promise<number> {
    const [affectedCount] = await AiCredential.update(
      { active },
      {
        where: { id: ids },
      }
    );
    return affectedCount;
  }

  // 加密凭证值（仅加密敏感字段）
  static encryptCredentialValue(credential: CredentialValue): CredentialValue {
    if (!credential || Object.keys(credential).length === 0) {
      throw new Error('Credential cannot be empty');
    }

    const encrypted: CredentialValue = { ...credential };

    // 加密敏感字段
    if (credential.secret_access_key) {
      encrypted.secret_access_key = security.encrypt(credential.secret_access_key);
    }
    if (credential.api_key) {
      encrypted.api_key = security.encrypt(credential.api_key);
    }

    // access_key_id 保持明文
    return encrypted;
  }

  // 解密凭证值
  static decryptCredentialValue(encryptedCredential: CredentialValue): CredentialValue {
    if (!encryptedCredential || Object.keys(encryptedCredential).length === 0) {
      throw new Error('Encrypted credential cannot be empty');
    }

    const decrypted: CredentialValue = { ...encryptedCredential };

    // 解密敏感字段
    if (encryptedCredential.secret_access_key) {
      decrypted.secret_access_key = security.decrypt(encryptedCredential.secret_access_key);
    }
    if (encryptedCredential.api_key) {
      decrypted.api_key = security.decrypt(encryptedCredential.api_key);
    }

    // access_key_id 已经是明文，不需要解密
    return decrypted;
  }

  // 生成掩码显示
  static maskCredentialValue(value: string): string {
    if (!value || value.length < 8) {
      return '***';
    }

    const start = value.substring(0, 4);
    const end = value.substring(value.length - 4);
    const maskLength = Math.max(4, value.length - 8);

    return `${start}${'*'.repeat(maskLength)}${end}`;
  }

  // 生成凭证的掩码显示
  static maskCredential(credential: CredentialValue): Record<string, string> {
    const masked: Record<string, string> = {};

    Object.entries(credential).forEach(([key, value]) => {
      if (typeof value === 'string') {
        if (key === 'access_key_id') {
          masked[key] = value;
        } else {
          masked[key] = AiCredential.maskCredentialValue(value);
        }
      }
    });

    return masked;
  }

  // 获取解密后的凭证值
  getDecryptedValue(): CredentialValue {
    return AiCredential.decryptCredentialValue(this.credentialValue);
  }

  // 获取掩码显示的凭证值
  getMaskedValue(): Record<string, string> {
    const decryptedValue = this.getDecryptedValue();
    return AiCredential.maskCredential(decryptedValue);
  }

  // 设置凭证值（自动加密敏感字段）
  async setCredentialValue(credential: CredentialValue): Promise<void> {
    this.credentialValue = AiCredential.encryptCredentialValue(credential);
    await this.save();
  }

  // 获取显示文本
  getDisplayText(): string {
    const masked = this.getMaskedValue();

    if (this.credentialType === 'access_key_pair') {
      return `${masked.access_key_id || '***'} / ${masked.secret_access_key || '***'}`;
    }

    if (this.credentialType === 'api_key') {
      return masked.api_key || '***';
    }

    // 对于custom类型，显示所有字段
    return Object.entries(masked)
      .map(([key, value]) => `${key}: ${value}`)
      .join(', ');
  }
}

AiCredential.init(AiCredential.GENESIS_ATTRIBUTES, { sequelize });
