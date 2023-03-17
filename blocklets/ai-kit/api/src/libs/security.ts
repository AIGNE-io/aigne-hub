import { auth } from '@blocklet/sdk/lib/middlewares';

export const ensureAdmin = auth({ roles: ['owner', 'admin'] });
