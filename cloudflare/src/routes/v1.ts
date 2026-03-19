import { Hono } from 'hono';

import type { HonoEnv } from '../worker';
import v2Routes from './v2';

// V1 routes are a thin compatibility layer over V2
// Main difference: v1 uses component call auth (now replaced with user auth)
const routes = new Hono<HonoEnv>();

// Mount v2 handlers at v1 paths
routes.route('/', v2Routes);

export default routes;
