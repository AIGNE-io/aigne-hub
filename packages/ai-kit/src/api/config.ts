import { EventEmitter } from 'events';
import { existsSync, writeFileSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

import config from '@blocklet/sdk/lib/config';
import { parse, stringify } from 'yaml';

import logger from '../libs/logger';

class Config extends EventEmitter {
  static CONFIG_FILE_PATH = join(config.env.dataDir, 'ai-kit-service.config.yaml');

  constructor() {
    super();

    if (!existsSync(Config.CONFIG_FILE_PATH)) {
      writeFileSync(Config.CONFIG_FILE_PATH, '');
    }

    this.reloadConfigFile();
  }

  private reloadConfigFile = async () => {
    try {
      this.config = parse((await readFile(Config.CONFIG_FILE_PATH)).toString());
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

  async save() {
    await writeFile(Config.CONFIG_FILE_PATH, stringify(this.config));
  }
}

const AIKitConfig = new Config();

export default AIKitConfig;
