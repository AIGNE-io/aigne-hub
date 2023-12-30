import { EventEmitter } from 'events';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

import config from '@blocklet/sdk/lib/config';
import { parse, stringify } from 'yaml';

import logger from '../../libs/logger';

export interface AIKitServiceConfig {
  useAIKitService?: boolean;
}

class Config extends EventEmitter {
  static CONFIG_FILE_PATH = join(config.env.dataDir, 'ai-kit-service.config.yaml');

  constructor() {
    super();
    try {
      if (existsSync(Config.CONFIG_FILE_PATH)) {
        this.config = parse(readFileSync(Config.CONFIG_FILE_PATH).toString());
      }
    } catch (error) {
      logger.error(`Parse ${Config.CONFIG_FILE_PATH} error`, { error });
    }
  }

  config: AIKitServiceConfig = {};

  get useAIKitService() {
    return this.config.useAIKitService;
  }

  set useAIKitService(value: boolean | undefined) {
    this.config.useAIKitService = value;
    this.save();
    this.emit('change', this.config);
  }

  save() {
    writeFileSync(Config.CONFIG_FILE_PATH, stringify(this.config));
  }
}

export default new Config();
