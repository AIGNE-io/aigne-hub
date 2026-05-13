import AiCredential from './ai-credential';
import AiModelRate from './ai-model-rate';
import AiProvider from './ai-provider';
import App from './app';
import ArchiveExecutionLog from './archive-execution-log';
import ModelCall from './model-call';
import ModelCallStat from './model-call-stat';
import Project from './project';
import Usage from './usage';

const models = {
  AiCredential,
  AiModelRate,
  AiProvider,
  App,
  ArchiveExecutionLog,
  ModelCall,
  ModelCallStat,
  Project,
  Usage,
};

// Initialize model associations
export function initialize(sequelize: any) {
  Object.values(models).forEach((model) => {
    if ('initialize' in model) {
      (model as any).initialize(sequelize);
    }
  });
  Object.values(models).forEach((model) => {
    if ('associate' in model) {
      (model as any).associate(models);
    }
  });
}

export default models;
