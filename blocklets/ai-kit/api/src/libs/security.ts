import { middlewares } from '@blocklet/sdk';

export const ensureAdmin = middlewares.auth({ roles: ['owner', 'admin'] });
