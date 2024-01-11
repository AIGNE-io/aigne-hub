import 'express-async-errors';

import path from 'path';

import cookieParser from 'cookie-parser';
import cors from 'cors';
import dotenv from 'dotenv-flow';
import express, { ErrorRequestHandler } from 'express';
import fallback from 'express-history-api-fallback';

import logger from './libs/logger';
import { SubscriptionError } from './libs/subscription-error';
import routes from './routes';

dotenv.config();

const { name, version } = require('../../package.json');

export const app = express();

app.set('trust proxy', true);
app.use(cookieParser());

app.use(express.json({ limit: '1 mb' }));
app.use(express.urlencoded({ extended: true, limit: '1 mb' }));

app.use(cors());

const router = express.Router();
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
app.use(<ErrorRequestHandler>((error, _req, res, _next) => {
  logger.error('handle route error', { error });

  let errorData = null;

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
    res.status(500);
    res.contentType('json');
  }

  if (res.writable) {
    // 在响应里加入errorData
    res.write(
      JSON.stringify({
        error: errorData,
      })
    );
  }

  res.end();
}));

const port = parseInt(process.env.BLOCKLET_PORT!, 10);

export const server = app.listen(port, (err?: any) => {
  if (err) throw err;
  logger.info(`> ${name} v${version} ready on ${port}`);
});
