import { Router } from 'express';

import app from './app';
import v1 from './v1';

const router = Router();

// NOTE: merge /v1/sdk routes into /v1
router.use('/v1/sdk', v1);
router.use('/v1', v1);

router.use('/apps', app);

export default router;
