import 'express-async-errors';

import path from 'path';

import { SubscriptionError } from '@blocklet/ai-kit/api';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv-flow';
import express, { ErrorRequestHandler } from 'express';

import { Config, isDevelopment } from './libs/env';
import logger from './libs/logger';
import { autoUpdateSubscriptionMeta } from './libs/payment';
import routes from './routes';
import { initAuthRouter } from './routes/auth';
import setupHtmlRouter from './routes/html';

if (process.env.NODE_ENV === 'development') {
  dotenv.config();
}

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

if (!isDevelopment) {
  const staticDir = path.resolve(Config.appDir, 'dist');
  app.use(express.static(staticDir, { maxAge: '30d', index: false }));
  setupHtmlRouter(app);
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

  autoUpdateSubscriptionMeta();
});
