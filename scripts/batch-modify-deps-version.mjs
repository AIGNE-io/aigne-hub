/* eslint-disable no-console */
import { chalk, fs } from 'zx';

function setDepVersion({ packageObj, key, version, depName, fullPath }) {
  const oldVersion = packageObj?.[key]?.[depName];
  if (oldVersion) {
    if (oldVersion !== version) {
      console.log(chalk.blueBright(`[update]: ${fullPath} [${depName}] version from ${oldVersion} to ${version}`));
      packageObj[key][depName] = version;
    } else {
      console.log(chalk.whiteBright(`[info]: ${fullPath} [${depName}] current version is already in ${version}`));
    }
  }
  return packageObj;
}

/**
 * @name batchModifyDepsVersion
 * @param {string} dirPath: the directory path to search
 * @param {string} depsList: the dep name list to modify
 * @param {string} version: the new version to replace
 */
export default async function batchModifyDepsVersion({ dirPath = './', depList = [], version } = {}) {
  if (depList?.length === 0) {
    console.warn(chalk.yellowBright('[warn]: depList is empty, will not modify any dep'));
    return;
  }
  if (!version) {
    console.warn(chalk.yellowBright('[warn]: please provide a version'));
    return;
  }

  let pathList = await fs.readdirSync(dirPath);

  if (pathList?.length === 0) {
    console.warn(chalk.yellowBright('[warn]: dirPath is empty, will not modify any dep'));
    return;
  }

  console.log(chalk.greenBright(`[info]: start to modify dep version to ${version}`));

  pathList = pathList.map((item) => `${dirPath}/${item}/package.json`);

  const resultList = await Promise.all(
    pathList.map(async (fullPath) => {
      try {
        await fs.statSync(fullPath);
        let packageObj = await fs.readJSON(fullPath);

        depList.map((depName) => {
          packageObj = setDepVersion({ packageObj, key: 'dependencies', version, depName, fullPath });
          packageObj = setDepVersion({ packageObj, key: 'devDependencies', version, depName, fullPath });
        });

        try {
          await fs.writeJSON(fullPath, packageObj, { spaces: 2 });
          return true;
        } catch (err) {
          console.error(chalk.redBright('[error]: ', err));
          return false;
        }
      } catch (error) {
        console.warn(chalk.yellowBright('[warn]: ', `${fullPath} no such file or directory`));
      }
    })
  );

  if (resultList.some((item) => item === false)) {
    console.error(chalk.redBright('[error]: some dep version could not be modified, please check manually.'));
  } else {
    console.log(chalk.greenBright('[info]: all dep version modified.'));
  }
}
