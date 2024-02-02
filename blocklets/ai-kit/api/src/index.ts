import 'express-async-errors';

import path from 'path';

import { SubscriptionError } from '@blocklet/ai-kit/api';
import { appStatus } from '@blocklet/ai-kit/api/call/app';
import config from '@blocklet/sdk/lib/config';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv-flow';
import express, { ErrorRequestHandler } from 'express';
import fallback from 'express-history-api-fallback';
import { parseURL } from 'ufo';

import logger from './libs/logger';
import routes from './routes';
import { initAuthRouter } from './routes/auth';

dotenv.config();

const { name, version } = require('../../package.json');

export const app = express();

app.set('trust proxy', true);
app.use(cookieParser());

app.use(express.json({ limit: '1 mb' }));
app.use(express.urlencoded({ extended: true, limit: '1 mb' }));

app.use(cors());

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

const isProduction = process.env.NODE_ENV === 'production' || process.env.ABT_NODE_SERVICE_ENV === 'production';

if (isProduction) {
  const staticDir = path.resolve(process.env.BLOCKLET_APP_DIR!, 'dist');
  app.use(express.static(staticDir, { maxAge: '30d', index: false }));
  app.use(fallback('index.html', { root: staticDir }));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use(<ErrorRequestHandler>((error, req, res, _next) => {
  logger.error('handle route error', { error });

  let errorData = null;
  const isEventStream = req.accepts().some((i) => i.startsWith('text/event-stream'));

  if (error instanceof SubscriptionError) {
    errorData = {
      message: error.message,
      timestamp: error.timestamp,
      type: error.type,
    };
  } else {
    errorData = {
      message: error.message,
    };
  }

  if (!res.headersSent) {
    res.status(isEventStream ? 200 : 500);
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
});

// 更新 payment 中订阅的描述
const subscriptionDescription = [config.env.appName, `<${parseURL(config.env.appUrl).host}>`].join(' ');

appStatus({ description: subscriptionDescription }, { useAIKitService: true })
  .then((res) => {
    if (res?.subscription) {
      logger.info('update description of billing success', { description: subscriptionDescription });
    } else {
      logger.info('update description of billing error: no subscription updated');
    }
  })
  .catch((error) => {
    logger.error('update description of billing error', { error });
  });
