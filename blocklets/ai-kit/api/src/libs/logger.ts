import createLogger from '@blocklet/logger';
import config from '@blocklet/sdk/lib/config';
import { NextFunction, Request, Response } from 'express';
import morgan from 'morgan';

export const isDevelopment = config.env.mode === 'development';

const logger = createLogger('ai-kit:main');

export default logger;

const accessLogStream = createLogger.getAccessLogStream();

const morganInstance = morgan(isDevelopment ? 'dev' : 'combined', { stream: accessLogStream });

export const accessLogMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (isDevelopment) {
    if (['/node_modules/.vite', '/src', '/@'].some((p) => req.originalUrl.startsWith(p))) {
      next();
      return;
    }
  }

  morganInstance(req, res, next);
};
