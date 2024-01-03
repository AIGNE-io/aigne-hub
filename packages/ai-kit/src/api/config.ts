import { EventEmitter } from 'events';
import { existsSync, readFileSync, watch, writeFileSync } from 'fs';
import { join } from 'path';

import config from '@blocklet/sdk/lib/config';
import { parse, stringify } from 'yaml';

import logger from '../libs/logger';

class Config extends EventEmitter {
  static CONFIG_FILE_PATH = join(config.env.dataDir, '../ai-kit', 'ai-kit-service.config.yaml');

  constructor() {
    super();

    if (!existsSync(Config.CONFIG_FILE_PATH)) {
      writeFileSync(Config.CONFIG_FILE_PATH, '');
    }

    watch(Config.CONFIG_FILE_PATH, this.reloadConfigFile);

    this.reloadConfigFile();
  }

  private reloadConfigFile = () => {
    try {
      this.config = parse(readFileSync(Config.CONFIG_FILE_PATH).toString());
    } catch (error) {
      logger.error(`Parse ${Config.CONFIG_FILE_PATH} error`, { error });
    }
  };

  config: { useAIKitService?: boolean } | undefined;

  get useAIKitService() {
    return this.config?.useAIKitService;
  }

  set useAIKitService(value: boolean | undefined) {
    this.config ??= {};
    this.config.useAIKitService = value;
    this.save();
    this.emit('change', this.config);
  }

  save() {
    writeFileSync(Config.CONFIG_FILE_PATH, stringify(this.config));
  }
}

const AIKitConfig = new Config();

export default AIKitConfig;
