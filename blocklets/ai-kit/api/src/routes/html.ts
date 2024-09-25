import { readFileSync } from 'fs';
import { resolve } from 'path';

import { getOpenGraphInfo } from '@api/libs/og';
import { getBlockletJs } from '@blocklet/sdk/lib/config';
import { Express, Request, Router } from 'express';
import Mustache from 'mustache';
import type { ViteDevServer } from 'vite';

const ASSETS_PATTERNS = ['/assets/', '/images/', '/open-embed/', '/robots.txt'];

export default function setupHtmlRouter(app: Express, viteDevServer?: ViteDevServer) {
  const template = viteDevServer
    ? readFileSync(resolve(process.env.BLOCKLET_APP_DIR!, 'index.html'), 'utf-8')
    : readFileSync(resolve(process.env.BLOCKLET_APP_DIR!, 'dist/index.html'), 'utf-8');

  const router = Router();

  const loadHtml = async (req: Request) => {
    let html = template;

    if (viteDevServer) {
      const template = readFileSync(resolve(__dirname, '../../../index.html'), 'utf-8');
      const url = req.originalUrl;
      html = await viteDevServer.transformIndexHtml(url, template);
    }

    const blockletJs = getBlockletJs();
    if (blockletJs) {
      html = html.replace('<script src="__blocklet__.js"></script>', `<script>${blockletJs}</script>`);
    }

    return { html };
  };

  router.get('/*', async (req, res, next) => {
    if (ASSETS_PATTERNS.some((i) => req.path.startsWith(i))) {
      next();
      return;
    }

    const { html: template } = await loadHtml(req);

    const html = Mustache.render(template, await getOpenGraphInfo());

    res.send(html);
  });

  app.use(router);
}
