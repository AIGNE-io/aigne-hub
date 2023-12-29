import { spawnSync } from 'child_process';
import { chmodSync, existsSync, mkdirSync, symlinkSync } from 'fs';
import { dirname, join } from 'path';

const { name } = require('../../../package.json');

const logger = console;

export async function ensureSqliteBinaryFile() {
  logger.info(`${name} ensure sqlite3 installed`);

  try {
    await import('sqlite3');
    logger.info(`${name} sqlite3 already installed`);
    return;
  } catch {
    /* empty */
  }
  logger.info(`${name} try install sqlite3`);

  const appDir = process.env.BLOCKLET_APP_DIR!;

  // link `node-pre-gyp` to .bin for download or build sqlite3
  try {
    const srcPath = join(appDir, 'node_modules/@mapbox/node-pre-gyp/bin/node-pre-gyp');
    const binPath = join(appDir, 'node_modules/.bin/node-pre-gyp');
    if (!existsSync(binPath) && existsSync(srcPath)) {
      mkdirSync(dirname(binPath), { recursive: true });
      symlinkSync(srcPath, binPath);
      chmodSync(binPath, '755');
    }
  } catch (error) {
    logger.warn(error.message);
  }

  spawnSync('npm', ['run', 'install'], {
    cwd: join(appDir, 'node_modules/sqlite3'),
    stdio: 'inherit',
    shell: true,
  });
}
