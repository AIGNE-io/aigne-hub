declare module 'vite-plugin-blocklet';

declare module 'express-history-api-fallback';

declare module 'express-async-errors';

declare module '@blocklet/logger';

namespace Express {
  interface Request {
    user?: {
      did: string;
      role: string;
      fullName: string;
    };
  }
}
