import 'express-async-errors';

import path from 'path';

import { CreditError, SubscriptionError } from '@blocklet/aigne-hub/api';
// eslint-disable-next-line import/no-extraneous-dependencies
import { CustomError, formatError, getStatusFromError } from '@blocklet/error';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv-flow';
import express, { ErrorRequestHandler } from 'express';

import { Config, isDevelopment } from './libs/env';
import logger, { accessLogMiddleware } from './libs/logger';
import { autoUpdateSubscriptionMeta, ensureMeter } from './libs/payment';
import { subscribeEvents } from './listeners/listen';
import routes from './routes';
import { initAuthRouter } from './routes/auth';
import setupHtmlRouter from './routes/html';
import { initialize } from './store/models';
import { sequelize } from './store/sequelize';

if (process.env.NODE_ENV === 'development') {
  dotenv.config();
}

initialize(sequelize);
const { name, version } = require('../../package.json');

export const app = express();

app.set('trust proxy', true);
app.use(cookieParser());

app.use(express.json({ limit: '1 mb' }));
app.use(express.urlencoded({ extended: true, limit: '1 mb' }));

app.use(cors());

app.use(accessLogMiddleware);

const router = express.Router();
initAuthRouter(router);
router.use('/api', routes);

app.use((req, _, next) => {
  // NOTE: Rewrite path from `/api/v1/sdk` to `/api/v1` compatible with old api
  if (req.url.startsWith('/api/v1/sdk/')) {
    req.url = req.url.replace('/sdk/', '/');
  }
  next();
}, router);

if (!isDevelopment) {
  const staticDir = path.resolve(Config.appDir, 'dist');
  app.use(express.static(staticDir, { maxAge: '30d', index: false }));
  setupHtmlRouter(app);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(<ErrorRequestHandler>((error, req, res, _next) => {
  logger.error('handle route error', { error, type: error?.type });

  let errorData = null;
  const isEventStream = req.accepts().some((i) => i.startsWith('text/event-stream'));

  if (error instanceof SubscriptionError || error instanceof CreditError) {
    errorData = {
      message: error.message,
      timestamp: error.timestamp,
      type: error.type,
      // @ts-ignore
      link: error?.link,
    };
  } else if (error instanceof CustomError) {
    errorData = formatError(error);
  } else {
    errorData = {
      message: error.message,
    };
  }

  if (!res.headersSent) {
    let statusCode = error?.statusCode || 500;
    if (error instanceof CustomError) {
      statusCode = getStatusFromError(error);
    }
    res.status(isEventStream ? 200 : statusCode);
    res.contentType(isEventStream ? 'text/event-stream' : 'json');
    res.flushHeaders();
  }

  if (res.writable) {
    if (isEventStream) {
      res.write(`data: ${JSON.stringify({ error: errorData })}\n\n`);
    } else {
      res.write(JSON.stringify({ error: errorData }));
    }
  }

  res.end();
}));

const port = parseInt(process.env.BLOCKLET_PORT!, 10);

export const server = app.listen(port, (err?: any) => {
  if (err) throw err;
  logger.info(`> ${name} v${version} ready on ${port}`);

  autoUpdateSubscriptionMeta();
  subscribeEvents();
  if (Config.creditBasedBillingEnabled) {
    ensureMeter();
  }
});
